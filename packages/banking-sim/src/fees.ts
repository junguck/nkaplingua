import type { FeeBracket, TransactionalIntent } from '@nkap/contracts';

/** Grilles tarifaires du simulateur, par tranches, comme les grilles mobile money réelles. */
export const FEE_SCHEDULES: Readonly<Record<TransactionalIntent, readonly FeeBracket[]>> = {
  TRANSFER: [
    { min: 100, max: 5_000, fee: 50 },
    { min: 5_001, max: 10_000, fee: 100 },
    { min: 10_001, max: 25_000, fee: 375 },
    { min: 25_001, max: 50_000, fee: 500 },
    { min: 50_001, max: 100_000, fee: 1_000 },
    { min: 100_001, max: 500_000, fee: 2_000 },
  ],
  WITHDRAW: [
    { min: 500, max: 5_000, fee: 100 },
    { min: 5_001, max: 25_000, fee: 250 },
    { min: 25_001, max: 100_000, fee: 1_000 },
    { min: 100_001, max: 500_000, fee: 2_500 },
  ],
  BUY_AIRTIME: [{ min: 100, max: 50_000, fee: 0 }],
  PAY_BILL: [{ min: 100, max: 500_000, fee: 100 }],
};

export type FeeLookup = { readonly ok: true; readonly fee: number } | { readonly ok: false; readonly reason: 'BELOW_MINIMUM' | 'LIMIT_EXCEEDED'; readonly bound: number };

export function lookupFee(kind: TransactionalIntent, amount: number): FeeLookup {
  const brackets = FEE_SCHEDULES[kind];
  const first = brackets[0];
  const last = brackets[brackets.length - 1];
  if (!first || !last) return { ok: false, reason: 'LIMIT_EXCEEDED', bound: 0 };
  if (amount < first.min) return { ok: false, reason: 'BELOW_MINIMUM', bound: first.min };
  if (amount > last.max) return { ok: false, reason: 'LIMIT_EXCEEDED', bound: last.max };
  const bracket = brackets.find((b) => amount >= b.min && amount <= b.max);
  return bracket ? { ok: true, fee: bracket.fee } : { ok: false, reason: 'LIMIT_EXCEEDED', bound: last.max };
}
