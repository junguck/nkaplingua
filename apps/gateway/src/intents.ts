/**
 * Correspondance entre nos intentions canoniques (`@nkap/contracts`) et la liste fermée de la sandbox.
 *
 * Le moteur NkapLingua nomme ses intentions (`CHECK_BALANCE`, `CHECK_FEES`…) ; la passerelle
 * n'accepte que les treize intentions officielles, à la casse près. Cette table est le seul
 * endroit où les deux vocabulaires se rencontrent.
 */

import type { SafinumIntent } from './contract.js';

export type CanonicalIntent =
  | 'CHECK_BALANCE'
  | 'TRANSFER'
  | 'CHECK_FEES'
  | 'TX_HISTORY'
  | 'BUY_AIRTIME'
  | 'PAY_BILL'
  | 'WITHDRAW'
  | 'EXPLAIN_TERM'
  | 'CHANGE_LANGUAGE'
  | 'CONFIRM'
  | 'CANCEL'
  | 'GREETING'
  | 'HELP'
  | 'UNKNOWN';

const MAP: Readonly<Record<CanonicalIntent, SafinumIntent>> = {
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

export function toSafinumIntent(intent: CanonicalIntent): SafinumIntent {
  return MAP[intent];
}

/** Rebranche les paramètres du moteur sur ceux attendus par le jury (montant + devise, bénéficiaire). */
export function toSafinumParameters(params: {
  amount?: number;
  currency?: string;
  beneficiary?: string;
  beneficiaryPhone?: string;
  biller?: string;
  reference?: string;
  fee?: number;
  total?: number;
  transactionId?: string;
  term?: string;
  language?: string;
}): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (params.amount !== undefined) out.amount = params.amount;
  if (params.amount !== undefined) out.currency = params.currency ?? 'XAF';
  if (params.beneficiary !== undefined) out.beneficiary = params.beneficiary;
  if (params.beneficiaryPhone !== undefined) out.beneficiary_phone = params.beneficiaryPhone;
  if (params.biller !== undefined) out.biller = params.biller;
  if (params.reference !== undefined) out.reference = params.reference;
  if (params.fee !== undefined) out.fee = params.fee;
  if (params.total !== undefined) out.total = params.total;
  if (params.transactionId !== undefined) out.transaction_id = params.transactionId;
  if (params.term !== undefined) out.term = params.term;
  if (params.language !== undefined) out.language = params.language;
  return out;
}
