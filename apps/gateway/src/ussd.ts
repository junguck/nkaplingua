/**
 * Canal USSD : le dialogue complet, en menus numérotés, sous contrainte GSM-7 / 182 septets.
 *
 * Deux règles structurent ce fichier :
 *   1. une opération est CRÉÉE dans un tour (`POST /transactions`, statut `pending`, aucun débit)
 *      puis CONFIRMÉE dans un tour ultérieur (`POST /transactions/{id}/confirm`) ;
 *   2. on ne devine jamais un montant ni un bénéficiaire : en cas d'ambiguïté, on déclare
 *      `CLARIFICATION_NEEDED` et on pose la question.
 */

import {
  normalizePhone,
  type InboundTurn,
  type SafinumIntent,
  type TransactionStatus,
  type UssdReply,
} from './contract.js';
import type { BankFailure, BankPort, BankTransaction, FeeType } from './bank.js';
import { MAX_AMOUNT, officialFee } from './fees.js';
import {
  displayPhone,
  message,
  money,
  recipientLabel,
  shortDate,
  type GatewayLanguage,
  type MessageKey,
} from './i18n.js';
import { resolveTurnLanguage } from './language.js';
import { toGsm7, truncateGsm7 } from './gsm7.js';
import type { SessionState, SessionStore, Step } from './session.js';

const MAX_CHARS = 182;

const MENU_KEYS: readonly MessageKey[] = [
  'menu.balance',
  'menu.transfer',
  'menu.fees',
  'menu.history',
  'menu.airtime',
  'menu.bill',
  'menu.help',
  'menu.language',
];

const FALLBACK_BILLERS = ['ENEO', 'CAMWATER', 'CANAL', 'CAMTEL'];

export interface UssdDeps {
  readonly bank: BankPort;
  readonly sessions: SessionStore;
  /** Contrat prudent : n'envoyer que les statuts déjà observés (`none`, `pending`). */
  readonly strictStatus?: boolean;
}

export async function handleUssd(turn: InboundTurn, deps: UssdDeps): Promise<UssdReply> {
  const key = turn.session_id || turn.phone || 'sans-session';
  const text = readText(turn);
  const state = deps.sessions.get(key) ?? newState();

  // `language: null` est un cas d'évaluation : on détecte, sans jamais écraser un choix explicite.
  const resolved = resolveTurnLanguage(
    { requested: turn.language, current: state.language, source: state.languageSource },
    text,
  );
  state.language = resolved.language;
  if (resolved.source !== 'user') state.languageSource = resolved.source;
  const language = state.language;

  const result = await advance(state, text, turn, deps, language);

  if (result.keep) deps.sessions.set(key, state);
  else deps.sessions.delete(key);

  return result.reply;
}

function newState(): SessionState {
  return { step: 'menu', language: 'fr', languageSource: 'detected', draft: {}, updatedAt: Date.now() };
}

interface Outcome {
  readonly reply: UssdReply;
  readonly keep: boolean;
}

async function advance(
  state: SessionState,
  text: string,
  turn: InboundTurn,
  deps: UssdDeps,
  language: GatewayLanguage,
): Promise<Outcome> {
  const phone = normalizePhone(turn.phone ?? '');
  const upper = text.toLowerCase();

  if (!phone) {
    return done(reply(language, message(language, 'error.UNKNOWN_ACCOUNT'), 'UNKNOWN', { end: true }));
  }

  // Annulation universelle : un zéro suffit, à n'importe quelle étape.
  if (text === '0' || ['annuler', 'cancel', 'haaytu', 'stop'].includes(upper)) {
    return cancelPending(state, deps, language);
  }

  if (state.step === 'menu') return menu(state, text, phone, deps, language);

  switch (state.step) {
    case 'transfer_to':
      return readBeneficiary(state, text, deps, language);
    case 'transfer_pick':
      return pickBeneficiary(state, text, deps, language);
    case 'transfer_amount':
      return readAmount(state, text, 'transfer', phone, deps, language);
    case 'airtime_target':
      if (text === '1') {
        state.draft.to = phone;
        state.step = 'airtime_amount';
        return keep(reply(language, message(language, 'ask.amount'), 'CLARIFICATION_NEEDED'));
      }
      if (text === '2') {
        state.step = 'airtime_phone';
        return keep(reply(language, message(language, 'ask.airtimePhone'), 'CLARIFICATION_NEEDED'));
      }
      return keep(
        reply(language, message(language, 'ask.airtimeTarget'), 'CLARIFICATION_NEEDED', {
          options: ['Mon numero', 'Un autre numero'],
        }),
      );
    case 'airtime_phone': {
      const target = normalizePhone(text);
      if (!target) return keep(reply(language, message(language, 'invalid.phone'), 'CLARIFICATION_NEEDED'));
      state.draft.to = target;
      state.step = 'airtime_amount';
      return keep(reply(language, message(language, 'ask.amount'), 'CLARIFICATION_NEEDED'));
    }
    case 'airtime_amount':
      return readAmount(state, text, 'airtime', phone, deps, language);
    case 'bill_biller':
      return pickBiller(state, text, deps, language);
    case 'bill_reference': {
      const reference = text.replace(/\s+/g, '');
      if (!/^[A-Za-z0-9-]{3,20}$/.test(reference)) {
        return keep(reply(language, message(language, 'invalid.choice'), 'CLARIFICATION_NEEDED'));
      }
      state.draft.billReference = reference;
      state.step = 'bill_amount';
      return keep(reply(language, message(language, 'ask.amount'), 'CLARIFICATION_NEEDED'));
    }
    case 'bill_amount':
      return readAmount(state, text, 'bill', phone, deps, language);
    case 'fees_amount':
      return showFees(state, text, deps, language);
    case 'confirm':
      return atConfirmation(state, text, phone, deps, language);
    case 'help': {
      const terms: Readonly<Record<string, MessageKey>> = {
        '1': 'term.fee',
        '2': 'term.limit',
        '3': 'term.beneficiary',
        '4': 'term.confirmation',
      };
      const term = terms[text];
      if (!term) return done(reply(language, message(language, 'ask.term'), 'CLARIFICATION_NEEDED', { end: true }));
      return done(reply(language, message(language, term), 'TERM_EXPLANATION', { end: true, term: text }));
    }
    case 'language': {
      const choices: Readonly<Record<string, GatewayLanguage>> = { '1': 'fr', '2': 'en', '3': 'fub' };
      const chosen = choices[text];
      if (!chosen) {
        state.step = 'menu';
        return keep(reply(language, message(language, 'ask.language'), 'CLARIFICATION_NEEDED'));
      }
      state.language = chosen;
      state.languageSource = 'user';
      state.step = 'menu';
      return keep(
        reply(chosen, `${message(chosen, 'lang.set', { language: chosen })}\n${menuText(chosen)}`, 'LANGUAGE_SWITCH', {
          end: false,
          language: chosen,
        }),
      );
    }
    default:
      state.step = 'menu';
      return keep(reply(language, menuText(language), 'UNKNOWN'));
  }
}

// ── Menu ───────────────────────────────────────────────────────────────────

async function menu(
  state: SessionState,
  text: string,
  phone: string,
  deps: UssdDeps,
  language: GatewayLanguage,
): Promise<Outcome> {
  const choice = resolveMenuChoice(text);

  switch (choice) {
    case 'balance':
      return balance(state, phone, deps, language);
    case 'transfer':
      state.step = 'transfer_to';
      return keep(reply(language, message(language, 'ask.beneficiary'), 'CLARIFICATION_NEEDED'));
    case 'fees':
      state.step = 'fees_amount';
      return keep(reply(language, message(language, 'ask.feesAmount'), 'CLARIFICATION_NEEDED'));
    case 'history':
      return history(state, phone, deps, language);
    case 'airtime':
      state.step = 'airtime_target';
      return keep(
        reply(language, message(language, 'ask.airtimeTarget'), 'CLARIFICATION_NEEDED', {
          options: ['Mon numero', 'Un autre numero'],
        }),
      );
    case 'bill':
      return chooseBiller(state, deps, language);
    case 'help':
      state.step = 'help';
      return keep(
        reply(language, message(language, 'ask.term'), 'TERM_EXPLANATION', {
          options: ['Frais', 'Plafond', 'Beneficiaire', 'Confirmation'],
        }),
      );
    case 'language':
      state.step = 'language';
      return keep(
        reply(language, message(language, 'ask.language'), 'LANGUAGE_SWITCH', {
          options: ['Francais', 'English', 'Fulfulde'],
        }),
      );
    default:
      if (text === '') return keep(reply(language, menuText(language), 'UNKNOWN'));
      return keep(reply(language, `${message(language, 'invalid.choice')}\n${menuText(language)}`, 'CLARIFICATION_NEEDED'));
  }
}

function resolveMenuChoice(text: string):
  | 'balance'
  | 'transfer'
  | 'fees'
  | 'history'
  | 'airtime'
  | 'bill'
  | 'help'
  | 'language'
  | null {
  const value = text.trim().toLowerCase();
  if (value === '1' || value === 'solde' || value === 'balance' || value === 'ceede') return 'balance';
  if (['2', 'envoyer', 'send', 'transfert', 'transfer', 'neldu'].includes(value)) return 'transfer';
  if (['3', 'frais', 'fees', 'njoɓdi', 'njobdi'].includes(value)) return 'fees';
  if (['4', 'historique', 'history', 'golle'].includes(value)) return 'history';
  if (['5', 'credit', 'crédit', 'airtime', 'kerdii'].includes(value)) return 'airtime';
  if (['6', 'facture', 'bill', 'fakture'].includes(value)) return 'bill';
  if (['7', 'aide', 'help', 'wallu'].includes(value)) return 'help';
  if (['8', 'langue', 'language', 'ɗemngal', 'demngal'].includes(value)) return 'language';
  return null;
}

// ── Opérations ─────────────────────────────────────────────────────────────

async function balance(
  state: SessionState,
  phone: string,
  deps: UssdDeps,
  language: GatewayLanguage,
): Promise<Outcome> {
  const result = await deps.bank.account(phone);
  if (!result.ok) return failure(result, 'BALANCE_INQUIRY', language);
  return done(
    reply(language, message(language, 'balance', { balance: money(result.data.balance, 'FCFA') }), 'BALANCE_INQUIRY', {
      end: true,
      params: { balance: result.data.balance, currency: result.data.currency },
    }),
  );
}

async function showFees(
  state: SessionState,
  text: string,
  deps: UssdDeps,
  language: GatewayLanguage,
): Promise<Outcome> {
  const amount = parseAmount(text);
  if (amount === null) return keep(reply(language, message(language, 'invalid.amount'), 'CLARIFICATION_NEEDED'));
  if (amount > MAX_AMOUNT) return keep(limitReply(language));

  const fees = await deps.bank.fees('transfer', amount);
  const quote = fees.ok ? fees.data : fallbackQuote('transfer', amount);
  return done(
    reply(
      language,
      message(language, 'fees', {
        amount: money(quote.amount),
        fee: money(quote.fee),
        total: money(quote.total),
      }),
      'FEE_INQUIRY',
      { end: true, params: { amount, fee: quote.fee, total: quote.total } },
    ),
  );
}

async function history(
  state: SessionState,
  phone: string,
  deps: UssdDeps,
  language: GatewayLanguage,
): Promise<Outcome> {
  const result = await deps.bank.history(phone, 4);
  if (!result.ok) return failure(result, 'TRANSACTION_HISTORY', language);
  if (result.data.length === 0) {
    return done(reply(language, message(language, 'history.empty'), 'TRANSACTION_HISTORY', { end: true }));
  }
  const lines = result.data.slice(0, 4).map((entry) =>
    message(language, 'history.line', {
      date: shortDate(entry.at),
      label: entry.label || entry.type,
      amount: `${entry.direction === 'in' ? '+' : '-'}${money(entry.amount)}`,
    }),
  );
  const text = [message(language, 'history.header'), ...lines].join('\n');
  return done(reply(language, text, 'TRANSACTION_HISTORY', { end: true }));
}

async function readBeneficiary(
  state: SessionState,
  text: string,
  deps: UssdDeps,
  language: GatewayLanguage,
): Promise<Outcome> {
  const direct = normalizePhone(text);
  if (direct) {
    state.draft.to = direct;
    state.draft.name = direct;
    state.step = 'transfer_amount';
    return keep(reply(language, message(language, 'ask.amount'), 'CLARIFICATION_NEEDED'));
  }

  const query = text.trim();
  if (query.length === 0) return keep(reply(language, message(language, 'ask.beneficiary'), 'CLARIFICATION_NEEDED'));

  const found = await deps.bank.beneficiaries(query);
  if (!found.ok) {
    // Le nom n'est pas résolu : on demande le numéro plutôt que de deviner.
    return keep(reply(language, message(language, 'invalid.phone'), 'CLARIFICATION_NEEDED'));
  }
  if (found.data.length === 1) {
    const only = found.data[0];
    if (!only) return keep(reply(language, message(language, 'invalid.phone'), 'CLARIFICATION_NEEDED'));
    state.draft.to = only.phone;
    state.draft.name = only.name;
    state.step = 'transfer_amount';
    return keep(reply(language, `${only.name}\n${message(language, 'ask.amount')}`, 'CLARIFICATION_NEEDED'));
  }
  if (found.data.length === 0) {
    return keep(reply(language, message(language, 'error.UNKNOWN_BENEFICIARY'), 'CLARIFICATION_NEEDED'));
  }

  // Homonymes : on ne choisit pas à la place de l'utilisateur.
  state.draft.candidates = found.data.slice(0, 5);
  state.step = 'transfer_pick';
  const list = found.data
    .slice(0, 5)
    .map((candidate, index) => `${index + 1}. ${candidate.name} ${displayPhone(candidate.phone)}`)
    .join('\n');
  return keep(
    reply(language, `${message(language, 'ambiguous.beneficiary')}\n${list}`, 'CLARIFICATION_NEEDED', {
      options: found.data.slice(0, 5).map((c) => c.name),
    }),
  );
}

async function pickBeneficiary(
  state: SessionState,
  text: string,
  deps: UssdDeps,
  language: GatewayLanguage,
): Promise<Outcome> {
  const candidates = state.draft.candidates ?? [];
  const index = Number.parseInt(text, 10);
  const chosen = Number.isInteger(index) ? candidates[index - 1] : undefined;
  if (!chosen) return keep(reply(language, message(language, 'invalid.choice'), 'CLARIFICATION_NEEDED'));
  state.draft.to = chosen.phone;
  state.draft.name = chosen.name;
  state.draft.candidates = undefined;
  state.step = 'transfer_amount';
  return keep(reply(language, message(language, 'ask.amount'), 'CLARIFICATION_NEEDED'));
}

async function readAmount(
  state: SessionState,
  text: string,
  type: FeeType,
  phone: string,
  deps: UssdDeps,
  language: GatewayLanguage,
): Promise<Outcome> {
  const amount = parseAmount(text);
  if (amount === null) return keep(reply(language, message(language, 'invalid.amount'), 'CLARIFICATION_NEEDED'));
  if (amount > MAX_AMOUNT) return keep(limitReply(language));

  const to = state.draft.to ?? phone;
  const fees = await deps.bank.fees(type, amount);
  const quote = fees.ok ? fees.data : fallbackQuote(type, amount);

  const input = {
    type,
    from: phone,
    to,
    amount,
    ...(type === 'bill'
      ? { biller: state.draft.biller ?? FALLBACK_BILLERS[0], reference: state.draft.billReference ?? '' }
      : {}),
  };

  // Correction : la transaction en attente est mise à jour, pas dupliquée.
  const result = state.pending
    ? await deps.bank.update(state.pending.id, { amount, to })
    : await deps.bank.create(input);

  if (!result.ok) return failure(result, transactionalIntent(type), language);

  const tx = result.data;
  state.pending = {
    id: tx.id,
    type,
    amount: tx.amount || amount,
    fee: tx.fee || quote.fee,
    total: tx.total || quote.total,
    to: tx.to ?? to,
    name: state.draft.name ?? tx.to ?? to,
    biller: tx.biller ?? state.draft.biller,
    reference: state.draft.billReference,
  };
  state.step = 'confirm';

  return keep(confirmation(state, language));
}

function confirmation(state: SessionState, language: GatewayLanguage): UssdReply {
  const pending = state.pending;
  if (!pending) return reply(language, message(language, 'invalid.choice'), 'CLARIFICATION_NEEDED');

  const key: MessageKey =
    pending.type === 'transfer' ? 'confirm.transfer' : pending.type === 'airtime' ? 'confirm.airtime' : 'confirm.bill';

  const body = message(language, key, {
    amount: money(pending.amount),
    fee: money(pending.fee),
    total: money(pending.total),
    recipient: recipientLabel(pending.name, pending.to),
    name: pending.name ?? '',
    phone: displayPhone(pending.to ?? ''),
    biller: pending.biller ?? '',
    reference: pending.reference ?? '',
  });

  return reply(language, body, transactionalIntent(pending.type), {
    options: ['Confirmer', 'Annuler', 'Modifier'],
    transaction: { id: pending.id, status: 'pending' },
    params: compact({
      amount: pending.amount,
      fee: pending.fee,
      total: pending.total,
      beneficiary: pending.name,
      beneficiary_phone: pending.to,
      biller: pending.biller,
      transaction_id: pending.id,
    }),
  });
}

async function atConfirmation(
  state: SessionState,
  text: string,
  phone: string,
  deps: UssdDeps,
  language: GatewayLanguage,
): Promise<Outcome> {
  const pending = state.pending;
  if (!pending) {
    state.step = 'menu';
    return keep(reply(language, menuText(language), 'UNKNOWN'));
  }

  const value = text.trim().toLowerCase();

  if (value === '1' || ['oui', 'yes', 'eey', 'confirmer', 'confirm', 'tabbitin'].includes(value)) {
    const result = await deps.bank.confirm(pending.id);
    if (!result.ok) return failure(result, 'CONFIRM', language, pending.id);

    const tx = result.data;
    const amount = tx.amount || pending.amount;
    const key: MessageKey = pending.type === 'transfer' ? 'done.transfer' : pending.type === 'airtime' ? 'done.airtime' : 'done.bill';
    const text = message(language, key, {
      amount: money(amount),
      recipient: recipientLabel(pending.name, pending.to),
      name: pending.name ?? displayPhone(pending.to ?? ''),
      phone: displayPhone(pending.to ?? ''),
      ref: tx.id || pending.id,
      biller: pending.biller ?? '',
      balance: money(tx.balanceAfter ?? 0),
    });

    return done(
      reply(language, text, 'CONFIRM', {
        end: true,
        transaction: { id: tx.id || pending.id, status: statusAfterConfirm(result.data.status) },
        params: { amount, transaction_id: tx.id || pending.id },
      }),
    );
  }

  if (value === '2' || ['non', 'no', 'annuler', 'cancel', 'haaytu'].includes(value)) {
    return cancelPending(state, deps, language);
  }

  if (value === '3' || ['modifier', 'corriger', 'correction', 'change', 'waylu'].includes(value)) {
    const correction = await applyCorrection(state, text, phone, deps, language);
    if (correction) return correction;
    return keep(reply(language, message(language, 'ask.amount'), 'CORRECTION'));
  }

  // L'utilisateur tape directement un nouveau montant après le récapitulatif : c'est une correction.
  const amount = parseAmount(text);
  if (amount !== null) {
    const correction = await applyCorrection(state, text, phone, deps, language);
    if (correction) return correction;
  }

  return keep(
    reply(language, message(language, 'confirm.retry'), 'CLARIFICATION_NEEDED', {
      options: ['Confirmer', 'Annuler', 'Modifier'],
      transaction: { id: pending.id, status: 'pending' },
    }),
  );
}

/** Corrige le montant de la transaction en attente, côté banque, puis réaffiche le récapitulatif. */
async function applyCorrection(
  state: SessionState,
  text: string,
  phone: string,
  deps: UssdDeps,
  language: GatewayLanguage,
): Promise<Outcome | null> {
  const pending = state.pending;
  if (!pending) return null;
  const amount = parseAmount(text);
  if (amount === null) return null;
  if (amount > MAX_AMOUNT) return keep(limitReply(language));

  const result = await deps.bank.update(pending.id, { amount });
  if (!result.ok) return failure(result, 'CORRECTION', language, pending.id);
  const tx = result.data;

  state.pending = {
    ...pending,
    amount: tx.amount || amount,
    fee: tx.fee || pending.fee,
    total: tx.total || tx.amount + pending.fee,
  };
  state.step = 'confirm';

  const recap = confirmation(state, language);
  return keep({ ...recap, interpretation: { ...recap.interpretation, intent: 'CORRECTION' } });
}

async function cancelPending(
  state: SessionState,
  deps: UssdDeps,
  language: GatewayLanguage,
): Promise<Outcome> {
  const pending = state.pending;
  if (!pending) {
    return done(reply(language, message(language, 'done.cancel'), 'CANCEL', { end: true }));
  }
  const result = await deps.bank.cancel(pending.id);
  if (!result.ok) return failure(result, 'CANCEL', language, pending.id);
  return done(
    reply(language, message(language, 'done.cancel'), 'CANCEL', {
      end: true,
      transaction: { id: result.data.id || pending.id, status: 'cancelled' },
    }),
  );
}

async function chooseBiller(
  state: SessionState,
  deps: UssdDeps,
  language: GatewayLanguage,
): Promise<Outcome> {
  const result = await deps.bank.billers();
  const billers = result.ok && result.data.length > 0 ? result.data.filter((b) => b.kind === 'bill') : [];
  const codes = billers.length > 0 ? billers.map((b) => b.code) : [...FALLBACK_BILLERS];
  state.step = 'bill_biller';
  state.draft.candidates = undefined;

  return keep(
    reply(language, `${message(language, 'ask.biller')}\n${numbered(codes)}`, 'CLARIFICATION_NEEDED', {
      options: codes,
    }),
  );
}

async function pickBiller(
  state: SessionState,
  text: string,
  deps: UssdDeps,
  language: GatewayLanguage,
): Promise<Outcome> {
  const result = await deps.bank.billers();
  const billers = result.ok ? result.data.filter((b) => b.kind === 'bill') : [];
  const codes = billers.length > 0 ? billers.map((b) => b.code) : [...FALLBACK_BILLERS];

  const index = Number.parseInt(text, 10);
  const byNumber = Number.isInteger(index) ? codes[index - 1] : undefined;
  const byName = codes.find((code) => code.toLowerCase() === text.trim().toLowerCase());
  const chosen = byNumber ?? byName;

  if (!chosen) return keep(reply(language, message(language, 'invalid.choice'), 'CLARIFICATION_NEEDED'));

  state.draft.biller = chosen;
  state.step = 'bill_reference';
  return keep(reply(language, message(language, 'ask.billReference'), 'CLARIFICATION_NEEDED'));
}

// ── Construction des réponses ──────────────────────────────────────────────

interface ReplyOptions {
  readonly end?: boolean;
  readonly options?: readonly string[];
  readonly transaction?: { readonly id: string | null; readonly status: TransactionStatus };
  readonly params?: Record<string, string | number | boolean | null>;
  readonly term?: string;
  readonly language?: GatewayLanguage;
}

function reply(
  language: GatewayLanguage,
  text: string,
  intent: SafinumIntent,
  options: ReplyOptions = {},
): UssdReply {
  const optionLabels = options.options ?? [];
  const body = finalizeText(text, optionLabels, MAX_CHARS);
  const params: Record<string, string | number | boolean | null> = { ...(options.params ?? {}) };
  if (options.term) params.term = options.term;

  return {
    response: {
      text: body,
      end_session: options.end ?? false,
      options: optionLabels.map((label) => toGsm7(label)),
    },
    interpretation: { intent, parameters: params, language: options.language ?? language },
    transaction: options.transaction ?? { id: null, status: 'none' },
  };
}

/** Garantit GSM-7 et 182 septets, options comprises : sans elles, l'utilisateur est bloqué. */
function finalizeText(text: string, options: readonly string[], maxChars: number): string {
  const optionsBlock =
    options.length > 0 ? options.map((label, index) => `${index + 1}. ${toGsm7(label)}`).join('\n') : '';
  const budget = optionsBlock ? maxChars - gsm7Length(optionsBlock) - 1 : maxChars;
  const body = truncateGsm7(toGsm7(text), Math.max(24, budget));
  return optionsBlock ? `${body}\n${optionsBlock}` : body;
}

function gsm7Length(text: string): number {
  let total = 0;
  for (const char of text) total += '^{}\\[~]|€\f'.includes(char) ? 2 : 1;
  return total;
}

function menuText(language: GatewayLanguage): string {
  const items = MENU_KEYS.map((key, index) => `${index + 1}. ${message(language, key)}`);
  return `${message(language, 'menu.header')}\n${items.join('\n')}`;
}

function numbered(items: readonly string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function compact(
  values: Readonly<Record<string, string | number | boolean | null | undefined>>,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function transactionalIntent(type: FeeType): SafinumIntent {
  return type === 'transfer' ? 'TRANSFER' : type === 'airtime' ? 'AIRTIME_PURCHASE' : 'BILL_PAYMENT';
}

function keep(replyValue: UssdReply): Outcome {
  return { reply: replyValue, keep: true };
}

function done(replyValue: UssdReply): Outcome {
  return { reply: replyValue, keep: false };
}

function statusAfterConfirm(status: string): TransactionStatus {
  if (status === 'pending') return 'pending';
  return 'confirmed';
}

function limitReply(language: GatewayLanguage): UssdReply {
  return reply(language, message(language, 'invalid.limit', { max: money(MAX_AMOUNT) }), 'CLARIFICATION_NEEDED');
}

function failure(
  result: BankFailure,
  intent: SafinumIntent,
  language: GatewayLanguage,
  transactionId?: string,
): Outcome {
  const known: ReadonlySet<string> = new Set([
    'INSUFFICIENT_FUNDS',
    'LIMIT_EXCEEDED',
    'UNKNOWN_BENEFICIARY',
    'UNKNOWN_BILLER',
    'UNKNOWN_ACCOUNT',
    'INVALID_AMOUNT',
    'TX_NOT_PENDING',
    'UNAUTHORIZED',
    'UNREACHABLE',
  ]);
  const key = known.has(result.error) ? (`error.${result.error}` as MessageKey) : ('error.GENERIC' as MessageKey);
  return done(
    reply(language, message(language, key), intent, {
      end: true,
      transaction: transactionId ? { id: transactionId, status: 'failed' } : { id: null, status: 'none' },
      params: { error: result.error },
    }),
  );
}

function fallbackQuote(type: FeeType, amount: number): { amount: number; fee: number; total: number } {
  const fee = officialFee(type, amount) ?? 0;
  return { amount, fee, total: amount + fee };
}

// ── Lecture de la saisie ───────────────────────────────────────────────────

function readText(turn: InboundTurn): string {
  const raw = String(turn.input?.text ?? '').trim();
  if (raw.length > 0) return raw.replace(/\u00a0|\u202f/g, ' ');
  const ussd = String(turn.input?.ussd_text ?? '').trim();
  if (!ussd) return '';
  const segments = ussd.split('*').filter((segment) => /[0-9A-Za-z]/.test(segment));
  return segments[segments.length - 1]?.trim() ?? '';
}

/** Montant entier en francs CFA : « 5 000 », « 5.000 », « 5000 FCFA ». Jamais de décimales inventées. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/fcfa|xaf/gi, '').trim();
  if (!/^\d[\d\s.,]*$/.test(cleaned)) return null;
  const digits = cleaned.replace(/[\s.,]/g, '');
  if (digits.length === 0 || digits.length > 9) return null;
  const amount = Number.parseInt(digits, 10);
  return Number.isInteger(amount) && amount > 0 ? amount : null;
}

export { MAX_CHARS };
