import type { IntentName, LanguageCode } from '@nkap/contracts';

/** Indice d'intention : forme repliée (un `*` final accepte les suffixes) et poids de 1 à 5. */
export type CueSpec = readonly [cue: string, weight: number];

/** Indices par intention puis par langue. */
export type IntentLexicon = Readonly<Partial<Record<IntentName, Readonly<Partial<Record<LanguageCode, readonly CueSpec[]>>>>>>;

/** Statut d'une forme : `reference` (repli), `draft`/`proposed` (à relire), `attested` (source écrite), `validated`. */
export type TranslationStatus = 'reference' | 'draft' | 'proposed' | 'attested' | 'validated';

/** Une forme : texte simple, ou texte accompagné de son statut de relecture. */
export type Template = string | { readonly text: string; readonly status: TranslationStatus };

/** Un texte par langue, le français étant toujours présent. */
export type TemplateSet = { readonly fr: string } & Readonly<Partial<Record<LanguageCode, Template>>>;
