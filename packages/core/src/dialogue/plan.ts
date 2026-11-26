import type { DialogueStage, OperationCard, TermId, TurnInput, TxStatus } from '@nkap/contracts';
import type { MessageKey } from '../lexicon/messages.lexicon';

export const PLACEHOLDERS = ['AMOUNT', 'FEE', 'TOTAL', 'BALANCE', 'NAME', 'PHONE', 'REF', 'CODE', 'OLD', 'NEW', 'DATE'] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
export type MessageParams = Readonly<Partial<Record<Placeholder, string>>>;

/**
 * Ce que le dialogue veut dire, indépendamment de la langue et du canal.
 * Le rendu se fait après : c'est ce qui permet de changer de langue en cours d'opération
 * sans perdre le contexte, et de servir le même contenu en USSD comme en vocal.
 */
export type PlanPart =
  | { readonly kind: 'message'; readonly key: MessageKey; readonly params?: MessageParams }
  | { readonly kind: 'term'; readonly term: TermId };

export interface PlanOption {
  readonly label: PlanPart;
  readonly input: TurnInput;
}

export interface Plan {
  readonly parts: readonly PlanPart[];
  readonly options: readonly PlanOption[];
  readonly card: OperationCard | null;
  readonly stage: DialogueStage;
  readonly status: TxStatus;
  readonly endSession: boolean;
  readonly errors: readonly string[];
  readonly params: Readonly<Record<string, string | number | boolean>>;
}

export const message = (key: MessageKey, params?: MessageParams): PlanPart =>
  params === undefined ? { kind: 'message', key } : { kind: 'message', key, params };
