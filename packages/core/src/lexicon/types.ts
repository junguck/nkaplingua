import type { IntentName, LanguageCode, TranslationStatus } from '@nkap/contracts';

/** Indice lexical : expression + poids. Le statut par défaut est celui de la langue. */
export type CueSpec = readonly [text: string, weight: number];

export type CueTable = Readonly<Partial<Record<LanguageCode, readonly CueSpec[]>>>;

export type IntentLexicon = Readonly<Partial<Record<IntentName, CueTable>>>;

/** Gabarit traduit avec son statut. Une chaîne seule prend le statut par défaut de la langue. */
export type Template = string | { readonly text: string; readonly status: TranslationStatus };

export type TemplateSet = { readonly fr: string } & Readonly<Partial<Record<Exclude<LanguageCode, 'fr'>, Template>>>;

/**
 * Statut appliqué quand une entrée n'en précise pas.
 * Toute entrée en langue nationale est une PROPOSITION tant que deux locuteurs ne l'ont pas validée.
 */
export const DEFAULT_STATUS: Readonly<Record<LanguageCode, TranslationStatus>> = {
  fr: 'reference',
  en: 'reference',
  fub: 'proposed',
  wes: 'proposed',
  ewo: 'proposed',
  bul: 'proposed',
  hau: 'proposed',
};

export function resolveTemplate(set: TemplateSet, lang: LanguageCode): { text: string; status: TranslationStatus } | null {
  const entry: Template | undefined = lang === 'fr' ? set.fr : set[lang];
  if (entry === undefined) return null;
  return typeof entry === 'string' ? { text: entry, status: DEFAULT_STATUS[lang] } : entry;
}
