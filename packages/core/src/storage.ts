/**
 * Disposition des données partagée entre le studio (écrivain) et le middleware (lecteur).
 * Une seule définition : un nom de clé Redis mal recopié serait une panne silencieuse.
 */

import { z } from 'zod';
import { languageSchema } from './contract.ts';

export const COLLECTIONS = {
  references: 'references',
  translations: 'translations',
  contributions: 'contributions',
  users: 'users',
  foldRules: 'fold_rules',
  lexicon: 'lexicon',
  audioBucket: 'audio',
} as const;

export const REDIS = {
  /** HASH clé -> JSON `CachedTranslation`, une par langue. */
  translations: (lang: string): string => `i18n:t:${lang}`,
  /** HASH langue -> JSON `FoldRuleDoc`. */
  rules: 'i18n:rules',
  /** Liste des langues présentes (SET). */
  languages: 'i18n:langs',
  version: 'i18n:version',
  /** Canal pub/sub : `CatalogEvent`. */
  channel: 'i18n:changed',
  session: (channel: string, id: string): string => `sess:${channel}:${id}`,
  rate: (bucket: string): string => `rl:${bucket}`,
} as const;

export const cachedTranslationSchema = z.object({
  t: z.string(),
  a: z.string().nullable().optional(),
});
export type CachedTranslation = z.infer<typeof cachedTranslationSchema>;

export const catalogEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('upsert'), lang: languageSchema, key: z.string() }),
  z.object({ kind: z.literal('delete'), lang: languageSchema, key: z.string() }),
  z.object({ kind: z.literal('reload'), lang: languageSchema }),
  z.object({ kind: z.literal('rules'), lang: languageSchema }),
]);
export type CatalogEvent = z.infer<typeof catalogEventSchema>;

export const foldRuleDocSchema = z.object({
  lang: languageSchema,
  letters: z.record(z.string().min(1).max(4), z.string().max(4)),
  tones: z.enum(['strip', 'keep-gsm7']),
});
export type FoldRuleDoc = z.infer<typeof foldRuleDocSchema>;

export const CONTRIBUTION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

/** Document de la base définitive : une ligne par (clé, langue), toujours validée par un tiers. */
export interface TranslationDoc {
  readonly key: string;
  readonly lang: z.infer<typeof languageSchema>;
  readonly text: string;
  readonly audioId: string | null;
  readonly contributorId: string;
  readonly reviewerId: string;
  readonly contributionId: string;
  readonly validatedAt: Date;
  readonly version: number;
}

export const LEXICON_INTENTS = [
  'BALANCE_INQUIRY',
  'TRANSFER',
  'FEE_INQUIRY',
  'TRANSACTION_HISTORY',
  'AIRTIME_PURCHASE',
  'BILL_PAYMENT',
  'TERM_EXPLANATION',
  'CONFIRM',
  'CANCEL',
] as const;
export type LexiconIntent = (typeof LEXICON_INTENTS)[number];

export interface LexiconDoc {
  readonly lang: z.infer<typeof languageSchema>;
  readonly intent: LexiconIntent;
  /** Forme pliée en ASCII minuscule ; `*` final = préfixe. */
  readonly term: string;
  readonly weight: number;
}
