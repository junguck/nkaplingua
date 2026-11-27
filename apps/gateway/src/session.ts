/**
 * Une session USSD dure 180 secondes. On garde en mémoire ce que l'utilisateur a déjà saisi
 * et la transaction en attente côté banque (son identifiant, jamais un montant recalculé).
 * Le magasin est volontairement remplaçable : en production, Redis ou une table.
 */

import type { GatewayLanguage } from './i18n.js';

export type Step =
  | 'menu'
  | 'transfer_to'
  | 'transfer_pick'
  | 'transfer_amount'
  | 'airtime_target'
  | 'airtime_phone'
  | 'airtime_amount'
  | 'bill_biller'
  | 'bill_reference'
  | 'bill_amount'
  | 'fees_amount'
  | 'confirm'
  | 'help'
  | 'language';

export interface PendingTransaction {
  readonly id: string;
  readonly type: 'transfer' | 'airtime' | 'bill';
  readonly amount: number;
  readonly fee: number;
  readonly total: number;
  readonly to?: string;
  readonly name?: string;
  readonly biller?: string;
  readonly reference?: string;
}

export interface SessionState {
  step: Step;
  language: GatewayLanguage;
  /** D'où vient la langue : la passerelle, la détection, ou le choix explicite du menu 8. */
  languageSource?: 'turn' | 'detected' | 'user';
  draft: {
    /** Montant déjà donné dans une phrase libre : réutilisé dès que le bénéficiaire est connu. */
    amount?: number;
    to?: string;
    name?: string;
    candidates?: ReadonlyArray<{ name: string; phone: string }>;
    biller?: string;
    billReference?: string;
  };
  pending?: PendingTransaction;
  updatedAt: number;
}

export interface SessionStore {
  get(key: string): SessionState | undefined;
  set(key: string, state: SessionState): void;
  delete(key: string): void;
}

const TTL_MS = 180_000;

/** Petit magasin à durée de vie : utilisé par les canaux locaux (`ivr`, `atm`). */
export class TtlStore<T> {
  private readonly states = new Map<string, { value: T; updatedAt: number }>();

  constructor(
    private readonly ttlMs: number = TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): T | undefined {
    const entry = this.states.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.updatedAt > this.ttlMs) {
      this.states.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.states.set(key, { value, updatedAt: this.now() });
  }

  delete(key: string): void {
    this.states.delete(key);
  }
}

export class InMemorySessions implements SessionStore {
  private readonly states = new Map<string, SessionState>();

  get(key: string): SessionState | undefined {
    const state = this.states.get(key);
    if (!state) return undefined;
    if (Date.now() - state.updatedAt > TTL_MS) {
      this.states.delete(key);
      return undefined;
    }
    return state;
  }

  set(key: string, state: SessionState): void {
    state.updatedAt = Date.now();
    this.states.set(key, state);
    if (this.states.size > 5_000) this.evict();
  }

  delete(key: string): void {
    this.states.delete(key);
  }

  private evict(): void {
    for (const [key, state] of this.states) {
      if (Date.now() - state.updatedAt > TTL_MS) this.states.delete(key);
    }
  }
}
