/**
 * Pliage vers GSM-7 pour l'USSD et le SMS.
 *
 * Les tons (diacritiques combinants) sont retirés de façon uniforme, et les lettres hors
 * alphabet sont remplacées par des graphies composées :
 *   - consonnes : ŋ -> ng, ɓ -> bh, ɗ -> dh, ƙ -> kh, ƴ -> yh (digraphes, 2 septets)
 *   - voyelles  : ɛ -> è, ɔ -> ò (déjà dans GSM-7, 1 septet, distinctes de e et o)
 *                 ə -> eu (lecture francophone de la voyelle centrale)
 *
 * Choix assumé : un digraphe pour une voyelle (« eh », « oh ») entrerait en collision avec
 * des suites réelles de la langue et coûterait 2 septets sur un budget de 182. Les règles
 * sont des données (`FoldRules`) : le studio peut les surcharger langue par langue.
 */

import { isGsm7Char } from './gsm7.ts';

export type ToneMode = 'strip' | 'keep-gsm7';

export interface FoldRules {
  /** Lettre source (une seule unité Unicode, sans diacritique) vers sa graphie GSM-7. */
  readonly letters: Readonly<Record<string, string>>;
  /**
   * `strip` : tous les tons disparaissent (langues nationales, lecture cohérente).
   * `keep-gsm7` : un caractère accentué déjà présent dans GSM-7 est conservé (é, è, à du français).
   */
  readonly tones: ToneMode;
}

const LETTERS: Readonly<Record<string, string>> = {
  ŋ: 'ng', Ŋ: 'Ng',
  ɓ: 'bh', Ɓ: 'Bh',
  ɗ: 'dh', Ɗ: 'Dh',
  ƙ: 'kh', Ƙ: 'Kh',
  ƴ: 'yh', Ƴ: 'Yh',
  ɛ: 'è', Ɛ: 'E',
  ɔ: 'ò', Ɔ: 'O',
  ə: 'eu', Ə: 'Eu', ǝ: 'eu', Ǝ: 'Eu',
  ɨ: 'i', Ɨ: 'I',
  ʉ: 'u', Ʉ: 'U',
  ʼ: "'", '’': "'", '‘': "'", 'ʻ': "'",
  '“': '"', '”': '"', '«': '"', '»': '"',
  '\u2013': '-', '\u2014': '-', '\u2212': '-', '\u2026': '...', '\u2022': '-', '\u00b7': '.', '\t': ' ',
  '\u00a0': ' ', '\u202f': ' ', '\u2009': ' ',
  // Latin courant hors GSM-7 (français, anglais).
  ç: 'c', â: 'a', ê: 'e', î: 'i', ô: 'o', û: 'u', ë: 'e', ï: 'i', œ: 'oe', Œ: 'OE',
  À: 'A', Â: 'A', È: 'E', Ê: 'E', Î: 'I', Ô: 'O', Û: 'U',
};

export const NATIONAL_RULES: FoldRules = { letters: LETTERS, tones: 'strip' };
export const LATIN_RULES: FoldRules = { letters: LETTERS, tones: 'keep-gsm7' };

/** Règles appliquées à tout écran USSD ou SMS, quelle que soit la langue : celles de l'aperçu du studio. */
export const USSD_RULES: FoldRules = LATIN_RULES;

const COMBINING = /\p{M}/gu;
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });

function foldGrapheme(grapheme: string, rules: FoldRules): string {
  const direct = rules.letters[grapheme];
  if (direct !== undefined) return direct;

  if (rules.tones === 'keep-gsm7') {
    if (grapheme.length === 1 && isGsm7Char(grapheme)) return grapheme;
    const composed = grapheme.normalize('NFC');
    if (composed.length === 1 && isGsm7Char(composed)) return composed;
  } else if (grapheme.length === 1 && isGsm7Char(grapheme) && grapheme.normalize('NFD').length === 1) {
    return grapheme;
  }

  // Ton retiré : on décompose, on jette les diacritiques, on remappe la lettre de base.
  const base = grapheme.normalize('NFD').replace(COMBINING, '');
  let out = '';
  for (const char of base) {
    const mapped = rules.letters[char];
    if (mapped !== undefined) out += mapped;
    else if (isGsm7Char(char)) out += char;
    else out += '?';
  }
  return out;
}

/**
 * Texte quelconque vers GSM-7 pur. À appliquer UNE fois, sur la source : en mode `strip`,
 * le è produit pour ɛ perdrait son accent à un second passage (il serait lu comme un ton).
 */
export function foldToGsm7(text: string, rules: FoldRules = NATIONAL_RULES): string {
  let out = '';
  for (const { segment } of segmenter.segment(text)) out += foldGrapheme(segment, rules);
  return out;
}

/** Fusionne des surcharges (studio, Mongo) sur les règles par défaut. */
export function withOverrides(base: FoldRules, overrides: Readonly<Record<string, string>>, tones?: ToneMode): FoldRules {
  return { letters: { ...base.letters, ...overrides }, tones: tones ?? base.tones };
}
