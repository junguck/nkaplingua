import type { FeeBracket, TransactionalIntent } from '@nkap/contracts';
import { FEE_BRACKETS, MAX_AMOUNT, MIN_AMOUNT, feeTypeOf, officialFee } from '@nkap/safinum';

/**
 * Le simulateur applique la grille OFFICIELLE (`@nkap/safinum`) : un chiffre affiché dans la démo
 * locale est le même que celui du jury.
 */
export const FEE_SCHEDULES: Readonly<Record<TransactionalIntent, readonly FeeBracket[]>> = {
  TRANSFER: FEE_BRACKETS.transfer,
  WITHDRAW: FEE_BRACKETS.withdrawal,
  BUY_AIRTIME: FEE_BRACKETS.airtime,
  PAY_BILL: FEE_BRACKETS.bill,
};

export type FeeLookup =
  | { readonly ok: true; readonly fee: number }
  | { readonly ok: false; readonly reason: 'BELOW_MINIMUM' | 'LIMIT_EXCEEDED'; readonly bound: number };

export function lookupFee(kind: TransactionalIntent, amount: number): FeeLookup {
  if (!Number.isInteger(amount) || amount < MIN_AMOUNT) return { ok: false, reason: 'BELOW_MINIMUM', bound: MIN_AMOUNT };
  const fee = officialFee(feeTypeOf(kind), amount);
  return fee === null ? { ok: false, reason: 'LIMIT_EXCEEDED', bound: MAX_AMOUNT } : { ok: true, fee };
}
