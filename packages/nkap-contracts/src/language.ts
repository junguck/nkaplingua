/**
 * Langues prises en charge par le contrat.
 * `fr` et `en` sont les langues des interfaces sources ; `fub` et `wes` sont les langues
 * nationales servies. Ajouter une langue = ajouter un code ici + un fichier de lexique.
 */
/** Les douze langues de la sandbox SAFINUM (codes ISO 639-3). */
export const LANGUAGES = ['fr', 'en', 'fub', 'wes', 'ewo', 'bum', 'hau', 'dua', 'bas', 'bbj', 'byv', 'ybb'] as const;
export type LanguageCode = (typeof LANGUAGES)[number];

export const SOURCE_LANGUAGE: LanguageCode = 'fr';

/**
 * Statut de fiabilité d'un texte. Rendu visible jusqu'à l'utilisateur et au jury :
 * on ne présente jamais une proposition comme une traduction validée.
 */
export const TRANSLATION_STATUSES = ['reference', 'attested', 'validated', 'proposed', 'draft'] as const;
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

export interface LanguageInfo {
  readonly code: LanguageCode;
  readonly name: string;
  readonly nativeName: string;
  readonly isNational: boolean;
  /** Locale de synthèse vocale de repli (aucune voix système n'existe pour fub). */
  readonly ttsLocale: string;
  /** Locale de reconnaissance vocale utilisable, ou null si aucune n'existe. */
  readonly sttLocale: string | null;
}

export const LANGUAGE_INFO: Readonly<Record<LanguageCode, LanguageInfo>> = {
  fr: { code: 'fr', name: 'Français', nativeName: 'Français', isNational: false, ttsLocale: 'fr-FR', sttLocale: 'fr-FR' },
  en: { code: 'en', name: 'Anglais', nativeName: 'English', isNational: false, ttsLocale: 'en-GB', sttLocale: 'en-GB' },
  fub: { code: 'fub', name: 'Fulfulde (Adamaoua)', nativeName: 'Fulfulde', isNational: true, ttsLocale: 'fr-FR', sttLocale: null },
  wes: { code: 'wes', name: 'Pidgin camerounais', nativeName: 'Kamtok', isNational: true, ttsLocale: 'en-GB', sttLocale: 'en-NG' },
  ewo: { code: 'ewo', name: 'Ewondo', nativeName: 'Ewondo', isNational: true, ttsLocale: 'fr-FR', sttLocale: null },
  bum: { code: 'bum', name: 'Bulu', nativeName: 'Bulu', isNational: true, ttsLocale: 'fr-FR', sttLocale: null },
  hau: { code: 'hau', name: 'Haoussa', nativeName: 'Hausa', isNational: true, ttsLocale: 'fr-FR', sttLocale: null },
  // Noms natifs : ceux de la documentation de la sandbox SAFINUM.
  dua: { code: 'dua', name: 'Duala', nativeName: 'Duálá', isNational: true, ttsLocale: 'fr-FR', sttLocale: null },
  bas: { code: 'bas', name: 'Basaa', nativeName: 'Ɓasaá', isNational: true, ttsLocale: 'fr-FR', sttLocale: null },
  bbj: { code: 'bbj', name: 'Ghomala', nativeName: 'Ghɔmálá', isNational: true, ttsLocale: 'fr-FR', sttLocale: null },
  byv: { code: 'byv', name: 'Medumba', nativeName: 'Mə̀dûmbà', isNational: true, ttsLocale: 'fr-FR', sttLocale: null },
  ybb: { code: 'ybb', name: 'Yemba', nativeName: 'Yɛmba', isNational: true, ttsLocale: 'fr-FR', sttLocale: null },
};

export function isLanguageCode(value: string): value is LanguageCode {
  return (LANGUAGES as readonly string[]).includes(value);
}
