import type { ChannelId } from './channel';
import type { IntentName, IntentSlots, Interpretation } from './intent';
import type { LanguageCode, TranslationStatus } from './language';
import type { Trace } from './trace';

/**
 * Entrée d'un tour. Deux formes convergent vers le même dialogue :
 * - `text` / `voice` : langage naturel, passe par la compréhension ;
 * - `intent` : choix structuré (menu USSD, bouton, touche SVI), saute la compréhension.
 */
export type TurnInput =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'voice'; readonly value: string; readonly sttConfidence?: number }
  | { readonly kind: 'intent'; readonly intent: IntentName; readonly slots?: IntentSlots };

export interface TurnRequest {
  /** Identifiant de session côté canal (session USSD, appel SVI, onglet web…). */
  readonly sessionId: string;
  /** Titulaire du compte : clé de la conversation, partagée entre canaux. */
  readonly userId: string;
  readonly channel: ChannelId;
  /** Langue imposée par le canal (menu de langue). Sinon : langue de la conversation. */
  readonly lang?: LanguageCode;
  readonly input: TurnInput;
}

export const DIALOGUE_STAGES = ['idle', 'collecting', 'clarifying', 'confirming'] as const;
export type DialogueStage = (typeof DIALOGUE_STAGES)[number];

export interface ReplyOption {
  /** Numéro affiché sur les canaux à choix numérotés. */
  readonly key: string;
  readonly label: string;
  readonly input: TurnInput;
}

/** Résumé chiffré d'une opération, identique sur tous les canaux. */
export interface OperationCard {
  readonly intent: IntentName;
  readonly amount: number | null;
  readonly fee: number | null;
  readonly total: number | null;
  readonly recipientName: string | null;
  readonly recipientPhone: string | null;
  readonly balanceAfter: number | null;
  readonly reference: string | null;
}

export interface Reply {
  readonly lang: LanguageCode;
  /** Message complet, prêt à afficher sur un canal riche. */
  readonly text: string;
  /** Mêmes phrases découpées, par ordre d'importance : les canaux courts gardent le début. */
  readonly parts: readonly string[];
  readonly messageKeys: readonly string[];
  readonly status: TranslationStatus;
  /** Au moins une phrase est retombée sur le français faute d'entrée validée. */
  readonly fallback: boolean;
  readonly options: readonly ReplyOption[];
  readonly card: OperationCard | null;
  readonly endSession: boolean;
}

export interface TurnResponse {
  readonly reply: Reply;
  readonly stage: DialogueStage;
  readonly interpretation: Interpretation;
  readonly trace: Trace;
}
