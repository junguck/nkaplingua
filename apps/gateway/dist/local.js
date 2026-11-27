/**
 * Socle commun des canaux locaux (`ivr`, `atm`).
 *
 * Ces deux canaux ne font PAS partie du contrat SAFINUM : la sandbox ne connaît que `ussd`,
 * `mobile` et `web`, et son API bancaire n'expose pas de route de retrait (d'où `WITHDRAW →
 * UNKNOWN` dans `intents.ts`). Ils vivent donc derrière `ENABLE_V2_CHANNELS=1`, sur des routes
 * séparées (`/ivr`, `/atm`), et ne sont jamais déclarés par `scripts/safinum.mjs`.
 */
import { message } from './i18n.js';
/** Mention affichée par l'ATM : on ne prétend pas avoir débité le compte. */
export const LOCAL_ONLY_NOTE = "Canal local : aucun appel de retrait n'existe dans l'API bancaire SAFINUM, le distributeur ne fait que simuler la remise d'espèces.";
/**
 * Lecture DTMF : `input.digits` (pavé), à défaut `input.text` (les deux sont acceptés pour
 * pouvoir rejouer un tour au clavier). `*` annule, `#` valide.
 */
export function readDigits(turn) {
    const raw = String(turn.input?.digits ?? turn.input?.text ?? '');
    const cancel = raw.includes('*');
    const submitted = raw.includes('#');
    return { digits: raw.replace(/\D+/g, ''), submitted, cancel };
}
/** Le montant DTMF est un nombre entier de francs : ni séparateur, ni décimale. */
export function digitsToAmount(digits) {
    if (!/^\d{1,9}$/.test(digits))
        return null;
    const amount = Number.parseInt(digits, 10);
    return Number.isInteger(amount) && amount > 0 ? amount : null;
}
/** Aucun code d'erreur bancaire brut ne sort vers l'utilisateur. */
export function failureText(language, failure) {
    const known = new Set([
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
    const key = known.has(failure.error) ? `error.${failure.error}` : 'error.GENERIC';
    return message(language, key);
}
