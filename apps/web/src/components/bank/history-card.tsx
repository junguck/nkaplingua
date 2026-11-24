'use client';

import { formatAmount, formatShortDate, t } from '@nkap/client';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { JSX } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConversation, useWallet } from '@/lib/nkap';
import { cn } from '@/lib/utils';

export function HistoryCard(): JSX.Element {
  const { history } = useWallet();
  const { lang } = useConversation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('ui.history', lang)}</CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('ui.history.empty', lang)}</p>
        ) : (
          <ul className="divide-y">
            {history.map((tx) => {
              const incoming = tx.direction === 'in';
              const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
              return (
                <li key={tx.id} className="flex items-center gap-3 py-3">
                  <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', incoming ? 'bg-success/12 text-success' : 'bg-secondary text-secondary-foreground')}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{tx.counterparty}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(incoming ? 'ui.in' : 'ui.out', lang)} · {formatShortDate(tx.at)}
                      {tx.fee.amount > 0 ? ` · ${formatAmount(tx.fee.amount)}` : ''}
                    </p>
                  </div>
                  <p className={cn('text-sm font-semibold tabular-nums', incoming && 'text-success')}>
                    {incoming ? '+' : '−'}
                    {formatAmount(tx.amount.amount)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
