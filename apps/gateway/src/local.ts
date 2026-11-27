/**
 * Socle commun des canaux locaux (`ivr`, `atm`).
 *
 * Ces deux canaux ne font PAS partie du contrat SAFINUM : la sandbox ne connaît que `ussd`,
 * `mobile` et `web`, et son API bancaire n'expose pas de route de retrait (d'où `WITHDRAW →
 * UNKNOWN` dans `intents.ts`). Ils vivent donc derrière `ENABLE_V2_CHANNELS=1`, sur des routes
 * séparées (`/ivr`, `/atm`), et ne sont jamais déclarés par `scripts/safinum.mjs`.
 */

import type { BankFailure } from './bank.js';
import { message, type GatewayLanguage } from './i18n.js';
import type { MessageKey } from './i18n.js';

/** Mention affichée par l'ATM : on ne prétend pas avoir débité le compte. */
export const LOCAL_ONLY_NOTE =
  "Canal local : aucun appel de retrait n'existe dans l'API bancaire SAFINUM, le distributeur ne fait que simuler la remise d'espèces.";

export interface DigitInput {
  /** Chiffres saisis, sans `#` ni `*`. */
  readonly digits: string;
  /** L'utilisateur a validé avec `#`. */
  readonly submitted: boolean;
  /** L'utilisateur a annulé avec `*`. */
  readonly cancel: boolean;
}

/**
 * Lecture DTMF : `input.digits` (pavé), à défaut `input.text` (les deux sont acceptés pour
 * pouvoir rejouer un tour au clavier). `*` annule, `#` valide.
 */
export function readDigits(turn: {
  readonly input?: { readonly digits?: string; readonly text?: string };
}): DigitInput {
  const raw = String(turn.input?.digits ?? turn.input?.text ?? '');
  const cancel = raw.includes('*');
  const submitted = raw.includes('#');
  return { digits: raw.replace(/\D+/g, ''), submitted, cancel };
}

/** Le montant DTMF est un nombre entier de francs : ni séparateur, ni décimale. */
export function digitsToAmount(digits: string): number | null {
  if (!/^\d{1,9}$/.test(digits)) return null;
  const amount = Number.parseInt(digits, 10);
  return Number.isInteger(amount) && amount > 0 ? amount : null;
}

/** Aucun code d'erreur bancaire brut ne sort vers l'utilisateur. */
export function failureText(language: GatewayLanguage, failure: BankFailure): string {
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
  const key = known.has(failure.error) ? (`error.${failure.error}` as MessageKey) : ('error.GENERIC' as MessageKey);
  return message(language, key);
}
