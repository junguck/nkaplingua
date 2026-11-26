import type { TransactionStatus } from './status';

/**
 * Contrat de la passerelle SAFINUM, tel que documenté sur https://safinum.cm/sandbox/docs.
 *
 * Deux familles de tours arrivent sur la même URL :
 *   - USSD          : `input.text` (menu numéroté), session de 180 s, 182 septets GSM-7, 3 s de délai ;
 *   - mobile / web  : `type: "ui_translation"`, on traduit les chaînes d'un écran, 10 s de délai.
 */

export type SafinumChannel = 'ussd' | 'mobile' | 'web';

/** Intentions officielles. Casse exacte : une faute rend la réponse invalide. */
export const SAFINUM_INTENTS = [
  'BALANCE_INQUIRY',
  'TRANSFER',
  'FEE_INQUIRY',
  'TRANSACTION_HISTORY',
  'AIRTIME_PURCHASE',
  'BILL_PAYMENT',
  'CONFIRM',
  'CANCEL',
  'CORRECTION',
  'CLARIFICATION_NEEDED',
  'TERM_EXPLANATION',
  'LANGUAGE_SWITCH',
  'UNKNOWN',
] as const;

export type SafinumIntent = (typeof SAFINUM_INTENTS)[number];

/** Langues de la sandbox. Le pidgin n'en fait pas partie. */
export const SAFINUM_LANGUAGES = ['fr', 'en', 'fub', 'dua', 'ewo', 'bas', 'bbj', 'byv'] as const;

export type SafinumLanguage = (typeof SAFINUM_LANGUAGES)[number];

/** Ce que la passerelle envoie. Tous les champs sont optionnels à la lecture : on ne fait confiance à rien. */
export interface InboundTurn {
  readonly trace_id?: string;
  readonly team_id?: string;
  readonly channel?: string;
  readonly type?: string;
  readonly session_id?: string;
  readonly phone?: string;
  readonly language?: string | null;
  readonly source_language?: string;
  readonly screen?: string;
  readonly input?: { readonly type?: string; readonly text?: string; readonly ussd_text?: string };
  readonly strings?: Readonly<Record<string, UiStringEntry>>;
  readonly constraints?: {
    readonly max_chars?: number | null;
    readonly charset?: string;
    readonly mode?: string;
    readonly timeout_ms?: number;
  };
  readonly bank_api?: { readonly base_url?: string };
}

export interface UiStringEntry {
  readonly text: string;
  readonly context?: string;
  readonly max_chars?: number | null;
}

/** Ce qu'il faut renvoyer pour un tour USSD. */
export interface UssdReply {
  response: { text: string; end_session: boolean; options: string[] };
  interpretation: {
    intent: SafinumIntent;
    parameters: Record<string, string | number | boolean | null>;
    language: SafinumLanguage;
  };
  transaction: { id: string | null; status: TransactionStatus };
}

/** Ce qu'il faut renvoyer pour un écran mobile ou web. */
export interface UiReply {
  language: SafinumLanguage;
  strings: Record<string, string>;
}

const SAFINUM_LANGUAGE_SET: ReadonlySet<string> = new Set(SAFINUM_LANGUAGES);

export function isSafinumLanguage(value: unknown): value is SafinumLanguage {
  return typeof value === 'string' && SAFINUM_LANGUAGE_SET.has(value);
}

export function normalizeChannel(value: unknown): SafinumChannel {
  return value === 'mobile' || value === 'web' ? value : 'ussd';
}

/** Un tour d'écran est reconnaissable à son `type`, pas à son canal : la même URL sert les trois. */
export function isUiTranslation(turn: InboundTurn): boolean {
  return turn.type === 'ui_translation' || (turn.strings !== undefined && turn.input === undefined);
}

/** Numéro camerounais ramené à 9 chiffres nationaux (677000001), ou null si ce n'en est pas un. */
export function normalizePhone(raw: string): string | null {
  const digits = String(raw).replace(/\D+/g, '');
  if (digits.length === 9 && digits.startsWith('6')) return digits;
  if (digits.length === 12 && digits.startsWith('2376')) return digits.slice(3);
  if (digits.length === 13 && digits.startsWith('002376')) return digits.slice(4);
  return null;
}
