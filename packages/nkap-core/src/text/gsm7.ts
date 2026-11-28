import { USSD_RULES, foldToGsm7 } from '@nkap/lingua-core';

/**
 * Alphabet GSM-7 : celui d'un vrai réseau USSD.
 *
 * Un seul caractère hors alphabet (ɛ, ɔ, ŋ, ə, ɓ, ɗ, ƴ, l'apostrophe courbe, le tiret cadratin…)
 * fait basculer tout le message en UCS-2 : 70 caractères au lieu de 182, et un affichage cassé sur
 * beaucoup de téléphones. On translittère donc AVANT de compter, puis on compte en septets
 * (les caractères étendus comme € ou [ valent deux septets).
 */

const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

const GSM7_EXTENDED = '^{}\\[~]|€\f';

const BASIC_SET: ReadonlySet<string> = new Set([...GSM7_BASIC]);
const EXTENDED_SET: ReadonlySet<string> = new Set([...GSM7_EXTENDED]);

/** Vrai si le texte passe tel quel sur un réseau GSM-7 (sans transcodage UCS-2). */
export function isGsm7(text: string): boolean {
  return [...text].every((char) => BASIC_SET.has(char) || EXTENDED_SET.has(char));
}

/** Longueur en septets : un caractère étendu (€, [, ], {, }…) en consomme deux. */
export function gsm7Length(text: string): number {
  let total = 0;
  for (const char of text) total += EXTENDED_SET.has(char) ? 2 : 1;
  return total;
}

/**
 * Pliage vers GSM-7 : lettres à tons en consonnes composées (ŋ -> ng, ɓ -> bh, ɗ -> dh, ƙ -> kh,
 * ƴ -> yh), ɛ -> è, ɔ -> ò, ə -> eu, tons retirés. Implémentation unique, partagée avec l'aperçu du studio.
 */
export function toGsm7(text: string): string {
  return foldToGsm7(text, USSD_RULES);
}

/**
 * Coupe un texte à `maxSeptets`, sans jamais tomber au milieu d'un montant
 * (« 25 000 FCFA » coupé en « 25 00 » serait un mensonge).
 */
export function truncateGsm7(text: string, maxSeptets: number): string {
  if (gsm7Length(text) <= maxSeptets) return text;

  let out = '';
  let used = 0;
  for (const char of text) {
    const width = EXTENDED_SET.has(char) ? 2 : 1;
    if (used + width > maxSeptets - 3) break; // garde la place des points de suspension
    out += char;
    used += width;
  }

  let cut = out.lastIndexOf(' ');
  while (cut > 0 && /\d/.test(out.charAt(cut - 1)) && /\d/.test(out.charAt(cut + 1))) {
    cut = out.lastIndexOf(' ', cut - 1);
  }
  const body = cut > 0 ? out.slice(0, cut) : out;
  return `${body}...`;
}
