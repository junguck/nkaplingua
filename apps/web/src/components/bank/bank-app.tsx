'use client';

import { quickActionInput, t, type QuickAction } from '@nkap/client';
import { MessageCircle } from 'lucide-react';
import { useState, type JSX } from 'react';
import { AssistantPanel } from '@/components/assistant/assistant-panel';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createLocalRuntime, NkapProvider, useConversation, useNkap, type NkapRuntime } from '@/lib/nkap';
import { BalanceCard } from './balance-card';
import { HistoryCard } from './history-card';

const DESKTOP = '(min-width: 1024px)';

function BankScreen(): JSX.Element {
  const { client, chat } = useNkap();
  const { lang } = useConversation();
  const [assistantOpen, setAssistantOpen] = useState(false);

  // Sur téléphone, une action rapide ouvre l'assistant ; sur grand écran, il est déjà visible.
  const runAction = (action: QuickAction, label: string): void => {
    void chat.sendIntent(quickActionInput(action), label);
    if (!window.matchMedia(DESKTOP).matches) setAssistantOpen(true);
  };

  return (
    <div className="mx-auto grid min-h-dvh max-w-7xl gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:py-8">
      <main className="flex min-w-0 flex-col gap-6 pb-24 lg:pb-0">
        <BalanceCard institution={client.institutionName} onAction={runAction} />
        <HistoryCard />
        <p className="text-center text-xs text-muted-foreground">{t('ui.lockedValues', lang)}</p>
      </main>

      <aside className="sticky top-8 hidden h-[calc(100dvh-4rem)] overflow-hidden rounded-2xl border bg-card shadow-sm lg:flex lg:flex-col">
        <AssistantPanel />
      </aside>

      <Sheet open={assistantOpen} onOpenChange={setAssistantOpen}>
        <Button
          size="lg"
          onClick={() => setAssistantOpen(true)}
          className="fixed bottom-5 right-5 z-40 rounded-full shadow-lg lg:hidden"
          aria-label={t('ui.assistant', lang)}
        >
          <MessageCircle className="size-5" />
          {t('ui.assistant', lang)}
        </Button>
        <SheetContent closeLabel={t('ui.cancel', lang)} className="lg:hidden">
          <SheetTitle className="sr-only">{t('ui.assistant', lang)}</SheetTitle>
          <SheetDescription className="sr-only">{t('ui.offline', lang)}</SheetDescription>
          <AssistantPanel />
        </SheetContent>
      </Sheet>
    </div>
  );
}

const createWebRuntime = (): NkapRuntime => createLocalRuntime('web', 'amina');

export function BankApp(): JSX.Element {
  return (
    <NkapProvider create={createWebRuntime}>
      <TooltipProvider delayDuration={200}>
        <BankScreen />
      </TooltipProvider>
    </NkapProvider>
  );
}
