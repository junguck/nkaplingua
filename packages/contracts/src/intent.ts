import type { LanguageCode } from './language';

/**
 * Intentions canoniques : la « lingua franca » entre tous les canaux.
 * Un menu USSD, un bouton web et une phrase en fulfulde aboutissent à la même valeur.
 */
export const INTENTS = [
  'CHECK_BALANCE',
  'TRANSFER',
  'CHECK_FEES',
  'TX_HISTORY',
  'BUY_AIRTIME',
  'PAY_BILL',
  'WITHDRAW',
  'EXPLAIN_TERM',
  'CHANGE_LANGUAGE',
  'CONFIRM',
  'CANCEL',
  'GREETING',
  'HELP',
  'UNKNOWN',
] as const;
export type IntentName = (typeof INTENTS)[number];

/** Intentions qui déplacent de l'argent : elles exigent toujours une confirmation explicite. */
export const TRANSACTIONAL_INTENTS = ['TRANSFER', 'BUY_AIRTIME', 'PAY_BILL', 'WITHDRAW'] as const;
export type TransactionalIntent = (typeof TRANSACTIONAL_INTENTS)[number];

export function isTransactional(intent: IntentName): intent is TransactionalIntent {
  return (TRANSACTIONAL_INTENTS as readonly string[]).includes(intent);
}

export type Currency = 'XAF';

/** Montant entier en francs CFA (le XAF n'a pas de subdivision en usage). */
export interface Money {
  readonly amount: number;
  readonly currency: Currency;
}

export const TERMS = [
  'balance',
  'fees',
  'total',
  'beneficiary',
  'irreversible',
  'pin',
  'otp',
  'limit',
  'airtime',
  'withdraw',
  'deposit',
  'history',
  'reference',
  'agent',
  'fraud',
  'interest',
  'loan',
] as const;
export type TermId = (typeof TERMS)[number];

export const BILLERS = ['ENEO', 'CAMWATER', 'CANAL'] as const;
export type BillerId = (typeof BILLERS)[number];

/** Paramètres extraits. Tous optionnels : le dialogue décide de ce qui manque. */
export interface IntentSlots {
  amount?: Money;
  /** Nom tel que dit par l'utilisateur (« Paul »), avant résolution dans le carnet. */
  recipientQuery?: string;
  /** Numéro au format national à 9 chiffres (6XXXXXXXX). */
  phone?: string;
  term?: TermId;
  targetLanguage?: LanguageCode;
  biller?: BillerId;
  billReference?: string;
  /** Choix numéroté (réponse à une clarification). */
  choice?: number;
}

export type SlotName = keyof IntentSlots;

export interface IntentScore {
  readonly intent: IntentName;
  readonly score: number;
}

/** Résultat de la compréhension d'un tour, exposé tel quel au tableau de bord du jury. */
export interface Interpretation {
  readonly lang: LanguageCode;
  readonly langConfidence: number;
  readonly intent: IntentName;
  readonly confidence: number;
  readonly alternatives: readonly IntentScore[];
  readonly slots: IntentSlots;
  /** L'utilisateur corrige une valeur déjà donnée (« non, 3000 »). */
  readonly isCorrection: boolean;
  /** Indices lexicaux reconnus : explicabilité pour le jury et les linguistes. */
  readonly cues: readonly string[];
  readonly normalizedInput: string;
}
