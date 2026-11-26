/**
 * Langues prises en charge par le contrat.
 * `fr` et `en` sont les langues des interfaces sources ; `fub` et `wes` sont les langues
 * nationales servies. Ajouter une langue = ajouter un code ici + un fichier de lexique.
 */
export const LANGUAGES = ['fr', 'en', 'fub', 'wes', 'ewo', 'bul', 'hau'] as const;
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
  bul: { code: 'bul', name: 'Bulu', nativeName: 'Bulu', isNational: true, ttsLocale: 'fr-FR', sttLocale: null },
  hau: { code: 'hau', name: 'Haoussa', nativeName: 'Hausa', isNational: true, ttsLocale: 'fr-FR', sttLocale: null },
};

export function isLanguageCode(value: string): value is LanguageCode {
  return (LANGUAGES as readonly string[]).includes(value);
}
