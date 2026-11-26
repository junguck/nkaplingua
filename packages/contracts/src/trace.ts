import type { ChannelId } from './channel';
import type { IntentName } from './intent';
import type { LanguageCode, TranslationStatus } from './language';

export const TX_STATUSES = [
  'none',
  'awaiting_input',
  'awaiting_clarification',
  'awaiting_confirmation',
  'executed',
  'rejected',
  'cancelled',
  'failed',
] as const;
export type TxStatus = (typeof TX_STATUSES)[number];

export interface TraceValidation {
  /** Chaque montant, nom et numéro de la réponse est identique à la donnée métier. */
  readonly integrity: boolean;
  readonly translationStatus: TranslationStatus;
  readonly fallback: boolean;
  /** Résultat du contrôle lexical des invariants de traduction. */
  readonly roundTrip: 'ok' | 'to_check';
}

/**
 * Une ligne du tableau de bord du jury. Les champs suivent l'ordre du règlement (§6.D) :
 * équipe, canal, langue, requête, intention, paramètres, réponse, statut, temps, erreurs, validation.
 */
export interface Trace {
  readonly id: string;
  readonly at: string;
  readonly team: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly channel: ChannelId;
  readonly lang: LanguageCode;
  readonly rawInput: string;
  readonly intent: IntentName;
  readonly confidence: number;
  readonly params: Readonly<Record<string, string | number | boolean>>;
  readonly response: string;
  readonly status: TxStatus;
  readonly latencyMs: number;
  readonly errors: readonly string[];
  readonly validation: TraceValidation;
}
