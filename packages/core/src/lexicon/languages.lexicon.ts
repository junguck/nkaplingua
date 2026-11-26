import type { LanguageCode } from '@nkap/contracts';

/** Noms par lesquels un utilisateur désigne une langue (« parle fulfulde », « tok pidgin »). */
export const LANGUAGE_NAMES: Readonly<Record<LanguageCode, readonly string[]>> = {
  fr: ['français', 'francais', 'french', 'faransi'],
  en: ['anglais', 'english', 'inglisi'],
  fub: ['fulfulde', 'foulfouldé', 'foulfoulde', 'peul', 'fulani', 'fula', 'pulaar'],
  wes: ['pidgin', 'pidjin', 'kamtok', 'pigin'],
  ewo: ['ewondo'],
  bul: ['bulu'],
};

/** Verbes de changement de langue. */
export const SWITCH_CUES: readonly string[] = [
  'parle', 'parlez', 'en', 'langue', 'change', 'passe',
  'speak', 'in', 'language', 'switch',
  'tok', 'for',
  'wolwu', 'haalu', 'ɗemngal',
];

/**
 * Mots-outils discriminants pour identifier la langue d'un énoncé court.
 * Les homographes (« mi », « am », « for », « no ») ont un poids faible.
 */
export const FUNCTION_WORDS: Readonly<Record<LanguageCode, ReadonlyArray<readonly [string, number]>>> = {
  fr: [['je', 2], ['j', 1], ['mon', 2], ['ma', 1], ['mes', 2], ['le', 1], ['la', 1], ['les', 1], ['de', 1], ['du', 1], ['des', 1], ['a', 1], ['est', 1], ['quel', 2], ['quelle', 2], ['combien', 2], ['veux', 2], ['voudrais', 2], ['pour', 1], ['moi', 2], ['envoie', 2], ['s il', 2], ['plait', 2], ['c est', 2], ['quoi', 2], ['mille', 2], ['oui', 2], ['non', 2], ['merci', 2]],
  en: [['i', 1], ['my', 2], ['the', 2], ['is', 1], ['what', 2], ['how', 1], ['much', 2], ['want', 2], ['to', 1], ['please', 2], ['send', 1], ['thousand', 2], ['yes', 1], ['thanks', 2], ['of', 1]],
  wes: [['wey', 3], ['dey', 3], ['na', 2], ['ya', 2], ['ma', 1], ['di', 2], ['don', 2], ['wetin', 3], ['haw', 3], ['moch', 3], ['wan', 2], ['sen', 2], ['giv', 2], ['give', 1], ['am', 1], ['abeg', 3], ['tok', 2], ['comot', 3], ['tausand', 3], ['balans', 3], ['moni', 3], ['ehen', 3], ['sabi', 3]],
  fub: [['mi', 1], ['maa', 3], ['am', 1], ['ka', 2], ['ngam', 3], ['ko', 2], ['ɗum', 3], ['yiɗi', 3], ['ceede', 3], ['njelu', 3], ['ɗoo', 3], ['hande', 3], ['eey', 3], ['ala', 2], ['ujineere', 3], ['jam', 2], ['useni', 3], ['jaraama', 3], ['no', 1], ['e', 1]],
  // Aucun mot-outil attesté dans ewo.json / bul.json : liste vide plutôt qu'inventée.
  // Ces langues sont reconnues par leurs indices d'intention ou choisies au menu de langue.
  ewo: [],
  bul: [],
};

/** « Mon solde », « my balance », « ma balans », « ceede am » : l'utilisateur parle de SES valeurs. */
export const POSSESSIVES: readonly string[] = ['mon', 'ma', 'mes', 'my', 'am'];
