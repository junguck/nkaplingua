/**
 * Grille officielle des frais SAFINUM (docs §4). Elle sert de repli quand `GET /fees`
 * ne répond pas, et de référence dans les tests : le chiffre montré au client vient
 * toujours de l'API bancaire quand elle répond.
 *
 *   transfer / withdrawal : 1–5 000 → 50 · 5 001–25 000 → 150 · 25 001–100 000 → 400 · ≥ 100 001 → 1 %
 *   airtime               : 0
 *   bill                  : 100
 *   plafond               : 500 000 XAF par opération
 */
export const MAX_AMOUNT = 500_000;
export const TRANSFER_BRACKETS = [
    { min: 1, max: 5_000, fee: 50 },
    { min: 5_001, max: 25_000, fee: 150 },
    { min: 25_001, max: 100_000, fee: 400 },
];
/** Frais officiels d'un montant. `null` si le montant sort des bornes admises. */
export function officialFee(type, amount) {
    if (!Number.isInteger(amount) || amount <= 0)
        return null;
    if (amount > MAX_AMOUNT)
        return null;
    if (type === 'airtime')
        return 0;
    if (type === 'bill')
        return 100;
    const bracket = TRANSFER_BRACKETS.find((b) => amount >= b.min && amount <= b.max);
    if (bracket)
        return bracket.fee;
    return Math.round(amount * 0.01);
}
export function officialTotal(type, amount) {
    const fee = officialFee(type, amount);
    return fee === null ? null : amount + fee;
}
