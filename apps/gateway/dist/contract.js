/**
 * Contrat de la passerelle SAFINUM, tel que documenté sur https://safinum.cm/sandbox/docs.
 *
 * Deux familles de tours arrivent sur la même URL :
 *   - USSD          : `input.text` (menu numéroté), session de 180 s, 182 septets GSM-7, 3 s de délai ;
 *   - mobile / web  : `type: "ui_translation"`, on traduit les chaînes d'un écran, 10 s de délai.
 */
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
];
/** Langues de la sandbox. Le pidgin n'en fait pas partie. */
export const SAFINUM_LANGUAGES = ['fr', 'en', 'fub', 'dua', 'ewo', 'bas', 'bbj', 'byv'];
const SAFINUM_LANGUAGE_SET = new Set(SAFINUM_LANGUAGES);
export function isSafinumLanguage(value) {
    return typeof value === 'string' && SAFINUM_LANGUAGE_SET.has(value);
}
export function normalizeChannel(value) {
    return value === 'mobile' || value === 'web' ? value : 'ussd';
}
/** Un tour d'écran est reconnaissable à son `type`, pas à son canal : la même URL sert les trois. */
export function isUiTranslation(turn) {
    return turn.type === 'ui_translation' || (turn.strings !== undefined && turn.input === undefined);
}
/** Numéro camerounais ramené à 9 chiffres nationaux (677000001), ou null si ce n'en est pas un. */
export function normalizePhone(raw) {
    const digits = String(raw).replace(/\D+/g, '');
    if (digits.length === 9 && digits.startsWith('6'))
        return digits;
    if (digits.length === 12 && digits.startsWith('2376'))
        return digits.slice(3);
    if (digits.length === 13 && digits.startsWith('002376'))
        return digits.slice(4);
    return null;
}
