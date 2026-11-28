import type { FeeBracket, TransactionalIntent } from '@nkap/contracts';

/**
 * Grille OFFICIELLE des frais SAFINUM (docs §4) — seule copie du dépôt. Le simulateur local,
 * la banque de démonstration et le repli du middleware la lisent ici : un chiffre affiché en
 * démo est le même que celui du jury. Quand `GET /fees` répond, c'est lui qui fait foi.
 *
 *   transfer / withdrawal : 1–5 000 → 50 · 5 001–25 000 → 150 · 25 001–100 000 → 400 · ≥ 100 001 → 1 %
 *   airtime : 0 · bill : 100 · plafond : 500 000 XAF par opération
 *
 * Exemples officiels : 5 000 → 5 050 · 5 001 → 5 151 · 25 000 → 25 150 · 25 001 → 25 401 ·
 * 100 001 → 101 001 · 500 000 → 505 000.
 */
export type FeeType = 'transfer' | 'withdrawal' | 'airtime' | 'bill';

export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 500_000;

/** Au-delà de ce montant, transferts et retraits coûtent 1 % (arrondi au franc). */
const PERCENT_FROM = 100_001;
const PERCENT = 0.01;

const CASH_BRACKETS: readonly FeeBracket[] = [
  { min: 1, max: 5_000, fee: 50 },
  { min: 5_001, max: 25_000, fee: 150 },
  { min: 25_001, max: 100_000, fee: 400 },
  // `fee` = frais au premier franc de la tranche ; le calcul réel est un pourcentage.
  { min: PERCENT_FROM, max: MAX_AMOUNT, fee: Math.round(PERCENT_FROM * PERCENT) },
];

export const FEE_BRACKETS: Readonly<Record<FeeType, readonly FeeBracket[]>> = {
  transfer: CASH_BRACKETS,
  withdrawal: CASH_BRACKETS,
  airtime: [{ min: MIN_AMOUNT, max: MAX_AMOUNT, fee: 0 }],
  bill: [{ min: MIN_AMOUNT, max: MAX_AMOUNT, fee: 100 }],
};

const FEE_TYPE_OF: Readonly<Record<TransactionalIntent, FeeType>> = {
  TRANSFER: 'transfer',
  WITHDRAW: 'withdrawal',
  BUY_AIRTIME: 'airtime',
  PAY_BILL: 'bill',
};

export function feeTypeOf(kind: TransactionalIntent): FeeType {
  return FEE_TYPE_OF[kind];
}

/** Frais officiels d'un montant entier, ou `null` hors bornes (≤ 0, décimal, > plafond). */
export function officialFee(type: FeeType, amount: number): number | null {
  if (!Number.isInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) return null;
  if ((type === 'transfer' || type === 'withdrawal') && amount >= PERCENT_FROM) return Math.round(amount * PERCENT);
  return FEE_BRACKETS[type].find((b) => amount >= b.min && amount <= b.max)?.fee ?? null;
}

export function officialTotal(type: FeeType, amount: number): number | null {
  const fee = officialFee(type, amount);
  return fee === null ? null : amount + fee;
}
