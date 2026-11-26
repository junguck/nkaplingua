/**
 * Second regard : au-delà d'un seuil, un proche de confiance doit dire « oui » avant que le transfert parte.
 *
 * Le transfert reste en attente côté banque (créé, non confirmé). Le proche reçoit un résumé court dans sa
 * langue : montant, bénéficiaire, frais, total. Jamais le solde, jamais un code secret. Sa réponse confirme
 * ou annule la transaction. Sans réponse avant `ttlMs`, la transaction est annulée.
 *
 * Les textes sont en français et en anglais ; les autres langues retombent sur le français (aucune forme
 * en langue nationale n'est inventée ici).
 */

import type { BankPort } from './bank.js';
import { money, displayPhone, recipientLabel, type GatewayLanguage } from './i18n.js';
import { toGsm7, truncateGsm7 } from './gsm7.js';

export interface TrustedContact {
  readonly name: string;
  readonly phone: string;
  readonly language: GatewayLanguage;
}

export interface SecondLookPolicy {
  /** Montant (FCFA) à partir duquel le second regard est exigé. */
  readonly thresholdXAF: number;
  /** Durée de validité d'une demande. */
  readonly ttlMs: number;
  /** Proche désigné par l'utilisateur, ou `undefined` : alors pas de second regard. */
  readonly contactFor: (userPhone: string) => TrustedContact | undefined;
}

export type Decision = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalRequest {
  readonly id: string;
  readonly transactionId: string;
  readonly userPhone: string;
  readonly contact: TrustedContact;
  readonly summary: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  decision: Decision;
}

/** Envoi d'un SMS. Injecté : le middleware ne parle à aucun opérateur par lui-même. */
export type Notifier = (toPhone: string, text: string) => Promise<void>;

export interface TransferToGate {
  readonly transactionId: string;
  readonly userPhone: string;
  readonly userLanguage: GatewayLanguage;
  readonly amount: number;
  readonly fee: number;
  readonly total: number;
  readonly recipientName?: string;
  readonly recipientPhone?: string;
}

const SUMMARY: Readonly<Record<'fr' | 'en', (v: Record<string, string>) => string>> = {
  fr: (v) => `${v.user} veut envoyer ${v.amount} a ${v.recipient}. Frais ${v.fee}, total ${v.total}. Repondez 1 pour OUI, 2 pour NON.`,
  en: (v) => `${v.user} wants to send ${v.amount} to ${v.recipient}. Fee ${v.fee}, total ${v.total}. Reply 1 for YES, 2 for NO.`,
};

const RESULT: Readonly<Record<'fr' | 'en', Readonly<Record<'approved' | 'rejected' | 'expired', string>>>> = {
  fr: { approved: 'Votre proche a valide. Transfert effectue.', rejected: 'Votre proche a refuse. Transfert annule.', expired: 'Pas de reponse de votre proche. Transfert annule.' },
  en: { approved: 'Your contact approved. Transfer done.', rejected: 'Your contact refused. Transfer cancelled.', expired: 'No answer from your contact. Transfer cancelled.' },
};

const YES = new Set(['1', 'oui', 'yes', 'eey', 'ok', 'o', 'y']);
const NO = new Set(['2', 'non', 'no', 'ala', 'n']);

const lang2 = (language: GatewayLanguage): 'fr' | 'en' => (language === 'en' ? 'en' : 'fr');

export class SecondLook {
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly settle = new Map<string, (decision: Exclude<Decision, 'pending'>) => Promise<void>>();
  private counter = 0;

  constructor(
    private readonly policy: SecondLookPolicy,
    private readonly notify: Notifier,
    private readonly now: () => number = Date.now,
  ) {}

  /** Cette opération doit-elle passer par le proche ? */
  applies(userPhone: string, total: number): TrustedContact | undefined {
    if (total < this.policy.thresholdXAF) return undefined;
    return this.policy.contactFor(userPhone);
  }

  /**
   * Ouvre la demande et envoie le résumé au proche. `bank` sert à confirmer ou annuler la transaction
   * quand la décision tombe.
   */
  async open(transfer: TransferToGate, contact: TrustedContact, bank: BankPort): Promise<ApprovalRequest> {
    const lang = lang2(contact.language);
    const summary = truncateGsm7(
      toGsm7(
        SUMMARY[lang]({
          user: displayPhone(transfer.userPhone),
          amount: money(transfer.amount),
          recipient: recipientLabel(transfer.recipientName, transfer.recipientPhone),
          fee: money(transfer.fee),
          total: money(transfer.total),
        }),
      ),
      160,
    );
    const createdAt = this.now();
    const request: ApprovalRequest = {
      id: `sl-${createdAt.toString(36)}-${this.counter++}`,
      transactionId: transfer.transactionId,
      userPhone: transfer.userPhone,
      contact,
      summary,
      createdAt,
      expiresAt: createdAt + this.policy.ttlMs,
      decision: 'pending',
    };
    this.requests.set(request.id, request);
    this.settle.set(request.id, async (decision) => {
      if (decision === 'approved') await bank.confirm(request.transactionId);
      else await bank.cancel(request.transactionId);
      await this.notify(request.userPhone, RESULT[lang2(transfer.userLanguage)][decision]);
    });
    await this.notify(contact.phone, summary);
    return request;
  }

  /** Réponse du proche (« 1 », « oui »…). `unclear` : la demande reste ouverte. */
  async answer(id: string, text: string): Promise<Decision | 'unclear' | 'unknown'> {
    const request = this.requests.get(id);
    if (!request) return 'unknown';
    if (request.decision !== 'pending') return request.decision;
    if (this.now() >= request.expiresAt) return this.close(request, 'expired');
    const value = text.trim().toLowerCase();
    if (YES.has(value)) return this.close(request, 'approved');
    if (NO.has(value)) return this.close(request, 'rejected');
    return 'unclear';
  }

  status(id: string): Decision | 'unknown' {
    const request = this.requests.get(id);
    if (!request) return 'unknown';
    if (request.decision === 'pending' && this.now() >= request.expiresAt) return 'expired';
    return request.decision;
  }

  /** À appeler périodiquement : annule les transactions dont le proche n'a pas répondu à temps. */
  async sweep(): Promise<number> {
    let closed = 0;
    for (const request of this.requests.values()) {
      if (request.decision === 'pending' && this.now() >= request.expiresAt) {
        await this.close(request, 'expired');
        closed += 1;
      }
    }
    return closed;
  }

  private async close(request: ApprovalRequest, decision: Exclude<Decision, 'pending'>): Promise<Decision> {
    request.decision = decision;
    const settle = this.settle.get(request.id);
    this.settle.delete(request.id);
    if (settle) await settle(decision);
    return decision;
  }
}
