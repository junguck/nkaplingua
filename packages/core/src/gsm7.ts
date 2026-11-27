/**
 * Alphabet GSM 03.38 (USSD et SMS). La limite de la sandbox se compte en septets :
 * un caractère de la table étendue (€, [, ], ^...) en consomme deux.
 */

const BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const EXTENDED = '^{}\\[~]|€\f';

const BASIC_SET: ReadonlySet<string> = new Set(BASIC);
const EXTENDED_SET: ReadonlySet<string> = new Set(EXTENDED);

export const USSD_MAX_SEPTETS = 182;
export const UCS2_MAX_CHARS = 70;

export function isGsm7Char(char: string): boolean {
  return BASIC_SET.has(char) || EXTENDED_SET.has(char);
}

export function isGsm7(text: string): boolean {
  for (const char of text) if (!isGsm7Char(char)) return false;
  return true;
}

/** Longueur en septets, ou `null` si le texte sort de l'alphabet (le réseau passerait en UCS-2). */
export function septetLength(text: string): number | null {
  let total = 0;
  for (const char of text) {
    if (BASIC_SET.has(char)) total += 1;
    else if (EXTENDED_SET.has(char)) total += 2;
    else return null;
  }
  return total;
}

/** Caractères hors alphabet, dédoublonnés : ce que le panneau Diagnostics signalerait. */
export function nonGsm7Chars(text: string): readonly string[] {
  const out = new Set<string>();
  for (const char of text) if (!isGsm7Char(char)) out.add(char);
  return [...out];
}

export interface UssdBudget {
  readonly gsm7: boolean;
  readonly length: number;
  readonly limit: number;
  readonly fits: boolean;
}

/** Budget réel d'un écran USSD : 182 septets en GSM-7, 70 caractères dès qu'un seul caractère en sort. */
export function ussdBudget(text: string, limit: number = USSD_MAX_SEPTETS): UssdBudget {
  const septets = septetLength(text);
  if (septets === null) {
    const length = [...text].length;
    return { gsm7: false, length, limit: UCS2_MAX_CHARS, fits: length <= UCS2_MAX_CHARS };
  }
  return { gsm7: true, length: septets, limit, fits: septets <= limit };
}
