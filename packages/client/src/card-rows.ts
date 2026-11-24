import type { LanguageCode, OperationCard } from '@nkap/contracts';
import { formatAmount, renderPart, type ScreenCardRow, type ScreenField } from '@nkap/core';

/**
 * Lignes d'une fiche d'opération pour un canal riche (web, mobile).
 * Même structure que la fiche de la bulle (`ScreenCardRow`) : un seul composant d'affichage par plateforme.
 */
export function operationCardRows(card: OperationCard, lang: LanguageCode): ScreenCardRow[] {
  const label = (field: ScreenField): string => renderPart({ kind: 'message', key: `screen.field.${field}` }, lang).text;
  const money = (v: number | null): string | null => (v === null ? null : formatAmount(v));
  const entries: Array<readonly [ScreenField, string | null]> = [
    ['recipient', card.recipientName],
    ['phone', card.recipientPhone],
    ['amount', money(card.amount)],
    ['fee', money(card.fee)],
    ['total', money(card.total)],
    ['balance', money(card.balanceAfter)],
    ['reference', card.reference],
  ];
  return entries.flatMap(([field, value]) => (value === null ? [] : [{ field, label: label(field), value }]));
}
