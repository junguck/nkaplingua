'use client';

import { formatAmount, QUICK_ACTIONS, quickActionLabel, t, type QuickAction } from '@nkap/client';
import type { JSX } from 'react';
import { useConversation, useWallet } from '@/lib/nkap';
import { LanguageSelect } from './language-select';
import { QUICK_ACTION_ICONS } from './quick-action-icon';

interface BalanceCardProps {
  readonly institution: string;
  readonly onAction: (action: QuickAction, label: string) => void;
}

export function BalanceCard({ institution, onAction }: BalanceCardProps): JSX.Element {
  const { account, loading } = useWallet();
  const { lang, pending } = useConversation();

  return (
    <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--hero-from)] to-[var(--hero-to)] text-white shadow-lg">
      <div className="flex items-start justify-between gap-3 p-5 pb-3 sm:p-6 sm:pb-4">
        <div className="min-w-0">
          <p className="text-sm text-white/75">{institution}</p>
          <p className="truncate text-lg font-semibold">{account?.holderName ?? '…'}</p>
        </div>
        <LanguageSelect />
      </div>
      <div className="px-5 sm:px-6">
        <p className="text-sm text-white/75">{t('ui.balance', lang)}</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl" aria-busy={loading}>
          {account ? formatAmount(account.balance.amount) : '— FCFA'}
        </p>
        <p className="mt-1 text-sm text-white/70 tabular-nums">{account?.phone}</p>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-1 bg-black/10 p-2 sm:grid-cols-7 sm:p-3">
        {QUICK_ACTIONS.map((action) => {
          const Icon = QUICK_ACTION_ICONS[action.id];
          const label = quickActionLabel(action, lang).text;
          return (
            <button
              key={action.id}
              type="button"
              disabled={pending}
              onClick={() => onAction(action, label)}
              className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center text-xs font-medium leading-tight outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-white/15">
                <Icon className="size-5" />
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

