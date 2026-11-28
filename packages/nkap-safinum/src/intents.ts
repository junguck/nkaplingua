import type { IntentName } from '@nkap/contracts';
import type { SafinumIntent } from './protocol';

/**
 * Seul point de rencontre entre les intentions du moteur (`@nkap/contracts`) et la liste fermée
 * de la sandbox. Une intention sans équivalent honnête est déclarée `UNKNOWN`, jamais maquillée.
 */
const MAP: Readonly<Record<IntentName, SafinumIntent>> = {
  CHECK_BALANCE: 'BALANCE_INQUIRY',
  TRANSFER: 'TRANSFER',
  CHECK_FEES: 'FEE_INQUIRY',
  TX_HISTORY: 'TRANSACTION_HISTORY',
  BUY_AIRTIME: 'AIRTIME_PURCHASE',
  PAY_BILL: 'BILL_PAYMENT',
  // La sandbox n'a pas d'intention de retrait : on ne peut pas la déclarer sans mentir.
  WITHDRAW: 'UNKNOWN',
  EXPLAIN_TERM: 'TERM_EXPLANATION',
  CHANGE_LANGUAGE: 'LANGUAGE_SWITCH',
  CONFIRM: 'CONFIRM',
  CANCEL: 'CANCEL',
  GREETING: 'UNKNOWN',
  HELP: 'TERM_EXPLANATION',
  UNKNOWN: 'UNKNOWN',
};

export function toSafinumIntent(intent: IntentName): SafinumIntent {
  return MAP[intent];
}
