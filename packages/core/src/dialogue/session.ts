import type { ChannelId, Contact, FeeQuote, IntentName, IntentSlots, LanguageCode, TurnInput } from '@nkap/contracts';

/** Intentions qui ont besoin de paramètres avant de répondre. */
export type SlotFillingIntent = 'TRANSFER' | 'BUY_AIRTIME' | 'PAY_BILL' | 'WITHDRAW' | 'CHECK_FEES';

export interface PendingOperation {
  readonly intent: SlotFillingIntent;
  readonly slots: IntentSlots;
  readonly recipient: Contact | null;
  readonly quote: FeeQuote | null;
  /** Une même opération confirmée deux fois (double appui, renvoi USSD) n'est exécutée qu'une fois. */
  readonly idempotencyKey: string;
  readonly awaitingConfirmation: boolean;
}

/** L'utilisateur a donné une valeur sans dire quoi en faire (« 5000 ») : on lui propose des choix. */
export interface IntentClarification {
  readonly candidates: readonly IntentName[];
  readonly slots: IntentSlots;
}

/**
 * La conversation est rattachée au TITULAIRE, pas au canal : commencer en USSD et
 * confirmer sur l'application fonctionne, dans la langue choisie.
 */
export interface Session {
  readonly userId: string;
  lang: LanguageCode;
  lastChannel: ChannelId;
  pending: PendingOperation | null;
  clarification: IntentClarification | null;
  /** Réponses possibles au dernier menu : « 1 », « 2 »… quel que soit le canal. */
  lastOptions: readonly TurnInput[];
  turns: number;
}

export interface SessionStore {
  get(userId: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  reset(userId: string): Promise<void>;
}

/** Copie profonde portable (Hermes/React Native n'a pas toujours structuredClone). */
const clone = (session: Session): Session => JSON.parse(JSON.stringify(session)) as Session;

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();

  async get(userId: string): Promise<Session | null> {
    const found = this.sessions.get(userId);
    return found ? clone(found) : null;
  }

  async save(session: Session): Promise<void> {
    this.sessions.set(session.userId, clone(session));
  }

  async reset(userId: string): Promise<void> {
    this.sessions.delete(userId);
  }
}

export function newSession(userId: string, lang: LanguageCode, channel: ChannelId): Session {
  return { userId, lang, lastChannel: channel, pending: null, clarification: null, lastOptions: [], turns: 0 };
}
