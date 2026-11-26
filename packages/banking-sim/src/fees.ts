import type { FeeBracket, TransactionalIntent } from '@nkap/contracts';

/**
 * Grille tarifaire OFFICIELLE de la sandbox SAFINUM (docs §4), appliquée aussi au simulateur local
 * pour qu'un chiffre affiché dans la démo soit le même que celui du jury.
 *
 *   transfer / withdrawal : 1–5 000 → 50 · 5 001–25 000 → 150 · 25 001–100 000 → 400 · ≥ 100 001 → 1 %
 *   airtime : 0 · bill : 100 · plafond : 500 000 XAF par opération
 *
 * Exemples officiels : 5 000 → 5 050 · 5 001 → 5 151 · 25 000 → 25 150 · 25 001 → 25 401 ·
 * 100 001 → 101 001 · 500 000 → 505 000.
 */
const CASH_BRACKETS: readonly FeeBracket[] = [
  { min: 1, max: 5_000, fee: 50 },
  { min: 5_001, max: 25_000, fee: 150 },
  { min: 25_001, max: 100_000, fee: 400 },
  // Au-delà de 100 000 : 1 % du montant (calculé dans lookupFee, `fee` sert de borne basse).
  { min: 100_001, max: 500_000, fee: 1_001 },
];

export const FEE_SCHEDULES: Readonly<Record<TransactionalIntent, readonly FeeBracket[]>> = {
  TRANSFER: CASH_BRACKETS,
  WITHDRAW: CASH_BRACKETS,
  BUY_AIRTIME: [{ min: 1, max: 500_000, fee: 0 }],
  PAY_BILL: [{ min: 1, max: 500_000, fee: 100 }],
};

/** Part du montant retenue au-delà de 100 000 XAF. */
const PERCENT_FROM = 100_001;
const PERCENT = 0.01;

export type FeeLookup = { readonly ok: true; readonly fee: number } | { readonly ok: false; readonly reason: 'BELOW_MINIMUM' | 'LIMIT_EXCEEDED'; readonly bound: number };

export function lookupFee(kind: TransactionalIntent, amount: number): FeeLookup {
  const brackets = FEE_SCHEDULES[kind];
  const first = brackets[0];
  const last = brackets[brackets.length - 1];
  if (!first || !last) return { ok: false, reason: 'LIMIT_EXCEEDED', bound: 0 };
  if (!Number.isInteger(amount) || amount < first.min) return { ok: false, reason: 'BELOW_MINIMUM', bound: first.min };
  if (amount > last.max) return { ok: false, reason: 'LIMIT_EXCEEDED', bound: last.max };
  if ((kind === 'TRANSFER' || kind === 'WITHDRAW') && amount >= PERCENT_FROM) {
    return { ok: true, fee: Math.round(amount * PERCENT) };
  }
  const bracket = brackets.find((b) => amount >= b.min && amount <= b.max);
  return bracket ? { ok: true, fee: bracket.fee } : { ok: false, reason: 'LIMIT_EXCEEDED', bound: last.max };
}
