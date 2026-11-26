import { z } from 'zod';
import { CHANNELS } from './channel';
import { BILLERS, INTENTS, TERMS } from './intent';
import { LANGUAGES } from './language';
import type { TurnRequest } from './turn';

/**
 * Validation à la frontière (API, webhooks USSD/SMS). Le cœur ne reçoit jamais
 * une entrée non validée.
 */
const moneySchema = z.object({ amount: z.number().int().positive().max(10_000_000), currency: z.literal('XAF') });

export const intentSlotsSchema = z
  .object({
    amount: moneySchema,
    recipientQuery: z.string().min(1).max(80),
    phone: z.string().regex(/^6\d{8}$/),
    term: z.enum(TERMS),
    targetLanguage: z.enum(LANGUAGES),
    biller: z.enum(BILLERS),
    billReference: z.string().min(1).max(40),
    choice: z.number().int().min(1).max(9),
  })
  .partial()
  .strict();

export const turnInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), value: z.string().min(1).max(500) }),
  z.object({ kind: z.literal('voice'), value: z.string().min(1).max(500), sttConfidence: z.number().min(0).max(1).optional() }),
  z.object({ kind: z.literal('intent'), intent: z.enum(INTENTS), slots: intentSlotsSchema.optional() }),
]);

export const turnRequestSchema = z.object({
  sessionId: z.string().min(1).max(120),
  userId: z.string().min(1).max(120),
  channel: z.enum(CHANNELS),
  lang: z.enum(LANGUAGES).optional(),
  input: turnInputSchema,
});

export type TurnRequestInput = z.input<typeof turnRequestSchema>;

export function parseTurnRequest(payload: unknown): TurnRequest {
  return turnRequestSchema.parse(payload);
}
