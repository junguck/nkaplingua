import { operationCardRows } from '@nkap/client';
import type { LanguageCode, OperationCard as Card } from '@nkap/contracts';
import { Lock } from 'lucide-react';
import type { JSX } from 'react';

const EMPHASIS = new Set(['total', 'balance']);

/** Fiche chiffrée identique sur tous les canaux : les valeurs viennent du système financier. */
export function OperationCard({ card, lang }: { readonly card: Card; readonly lang: LanguageCode }): JSX.Element | null {
  const rows = operationCardRows(card, lang);
  if (rows.length === 0) return null;
  return (
    <dl className="mt-3 divide-y rounded-lg border bg-background text-sm">
      {rows.map((row) => (
        <div key={row.field} className="flex items-baseline justify-between gap-4 px-3 py-2">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className={`flex items-center gap-1.5 text-right tabular-nums ${EMPHASIS.has(row.field) ? 'font-semibold' : 'font-medium'}`}>
            {row.value}
            <Lock className="size-3 text-muted-foreground/60" aria-hidden />
          </dd>
        </div>
      ))}
    </dl>
  );
}
