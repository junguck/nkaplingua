import type { IntentName, LanguageCode, TurnInput } from '@nkap/contracts';
import { renderPart, type MessageKey, type RenderedText } from '@nkap/core';

export type QuickActionId = 'balance' | 'send' | 'withdraw' | 'airtime' | 'bill' | 'history' | 'fees';

export interface QuickAction {
  readonly id: QuickActionId;
  readonly intent: IntentName;
  readonly labelKey: MessageKey;
}

/**
 * Les boutons du tableau de bord sont des entrées structurées du MÊME dialogue que la phrase libre :
 * « Envoyer » ouvre la conversation qui demande montant et bénéficiaire, avec confirmation.
 * Aucun écran de formulaire parallèle, donc aucune règle métier dupliquée côté interface.
 */
export const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: 'balance', intent: 'CHECK_BALANCE', labelKey: 'intent.CHECK_BALANCE' },
  { id: 'send', intent: 'TRANSFER', labelKey: 'intent.TRANSFER' },
  { id: 'withdraw', intent: 'WITHDRAW', labelKey: 'intent.WITHDRAW' },
  { id: 'airtime', intent: 'BUY_AIRTIME', labelKey: 'intent.BUY_AIRTIME' },
  { id: 'bill', intent: 'PAY_BILL', labelKey: 'intent.PAY_BILL' },
  { id: 'history', intent: 'TX_HISTORY', labelKey: 'intent.TX_HISTORY' },
  { id: 'fees', intent: 'CHECK_FEES', labelKey: 'intent.CHECK_FEES' },
];

export function quickActionInput(action: QuickAction): TurnInput {
  return { kind: 'intent', intent: action.intent };
}

export function quickActionLabel(action: QuickAction, lang: LanguageCode): RenderedText {
  return renderPart({ kind: 'message', key: action.labelKey }, lang);
}
