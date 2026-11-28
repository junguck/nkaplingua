/**
 * Contrat de la passerelle SAFINUM. Tolérant en entrée (`passthrough`), strict en sortie.
 */

import { z } from 'zod';

export const INTENTS = [
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
] as const;
export type Intent = (typeof INTENTS)[number];

export const LANGUAGES = ['fr', 'en', 'dua', 'ewo', 'bas', 'bbj', 'byv', 'fub', 'hau', 'bum', 'wes', 'ybb'] as const;
export type Language = (typeof LANGUAGES)[number];
export const languageSchema = z.enum(LANGUAGES);

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export const CHANNELS = ['ussd', 'mobile', 'web', 'sms', 'atm', 'ivr'] as const;
export type Channel = (typeof CHANNELS)[number];

export const TX_STATUSES = ['none', 'pending', 'confirmed', 'cancelled', 'failed'] as const;
export type TxStatus = (typeof TX_STATUSES)[number];

const audioInputSchema = z
  .object({
    format: z.string().max(16),
    encoding: z.string().max(16),
    sample_rate: z.number().int().positive(),
    channels: z.number().int().positive(),
    duration_ms: z.number().int().nonnegative().optional(),
    data: z.string().max(2_000_000),
  })
  .passthrough();

/** Tour conversationnel : ussd, sms, ivr. */
export const turnSchema = z
  .object({
    trace_id: z.string().min(1).max(128).optional(),
    team_id: z.string().max(128).optional(),
    channel: z.enum(['ussd', 'sms', 'ivr']),
    session_id: z.string().max(128).optional(),
    phone: z.string().regex(/^\+?\d{6,15}$/),
    language: z.string().max(8).nullable().optional(),
    input: z
      .object({
        type: z.string().max(16),
        text: z.string().max(500).nullable().optional(),
        ussd_text: z.string().max(500).nullable().optional(),
        audio: audioInputSchema.nullable().optional(),
      })
      .passthrough(),
    constraints: z.object({ max_chars: z.number().int().positive().nullable().optional() }).passthrough().optional(),
    bank_api: z.object({ base_url: z.string().max(256) }).passthrough().optional(),
  })
  .passthrough();
export type Turn = z.infer<typeof turnSchema>;

const uiStringSchema = z.object({
  text: z.string().max(2000),
  context: z.string().max(500).nullable().optional(),
  max_chars: z.number().int().positive().nullable().optional(),
});
export type UiString = z.infer<typeof uiStringSchema>;

/** Écran à traduire : mobile, web, atm. Aucune donnée financière : seulement des gabarits. */
export const uiTranslationSchema = z
  .object({
    trace_id: z.string().max(128).optional(),
    channel: z.enum(['mobile', 'web', 'atm']),
    type: z.literal('ui_translation'),
    screen: z.string().max(64).optional(),
    language: z.string().max(8).nullable().optional(),
    source_language: z.string().max(8).optional(),
    strings: z.record(z.string().max(128), uiStringSchema).refine((s) => Object.keys(s).length <= 500, 'trop de clés'),
  })
  .passthrough();
export type UiTranslationRequest = z.infer<typeof uiTranslationSchema>;

export type AudioChunk = { readonly url: string } | { readonly say: string };

export interface TurnResponse {
  readonly response: {
    readonly text: string;
    readonly end_session: boolean;
    readonly options: readonly string[];
    readonly audio?: readonly AudioChunk[];
  };
  readonly interpretation: {
    readonly intent: Intent;
    readonly parameters: Readonly<Record<string, string | number | boolean | null>>;
    readonly language: Language;
  };
  readonly transaction: { readonly id: string | null; readonly status: TxStatus };
}

export interface UiTranslationResponse {
  readonly language: Language;
  readonly strings: Readonly<Record<string, string>>;
}
