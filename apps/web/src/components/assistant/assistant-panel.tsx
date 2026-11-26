'use client';

import { t } from '@nkap/client';
import { Sparkles, WifiOff } from 'lucide-react';
import { useEffect, useRef, type JSX } from 'react';
import { Button } from '@/components/ui/button';
import { useConversation, useNkap } from '@/lib/nkap';
import { Composer } from './composer';
import { MessageBubble } from './message-bubble';

const SUGGESTIONS = ['Neldu ujineere jowi ka Fadimatou', 'Abeg sen faiv tausand give Maman', 'Combien de frais pour envoyer 25 000 ?', 'Envoie 2000 à Paul'];

export function AssistantPanel(): JSX.Element {
  const { chat } = useNkap();
  const { messages, pending, lang, error } = useConversation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pending]);

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={t('ui.assistant', lang)}>
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold leading-tight">NkapLingua</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <WifiOff className="size-3" aria-hidden />
            {t('ui.offline', lang)}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/40 p-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="space-y-3 rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground">
            <p>{t('ui.welcome', lang)}</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} size="sm" variant="secondary" className="h-auto whitespace-normal py-1.5 text-left" onClick={() => void chat.sayText(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m, i) => (
          <MessageBubble key={m.id} message={m} isLast={i === messages.length - 1} pending={pending} />
        ))}
        {pending ? <p className="animate-pulse text-sm text-muted-foreground">…</p> : null}
        {error !== null ? <p className="text-sm text-destructive">{error}</p> : null}
        <div ref={endRef} />
      </div>

      <Composer />
    </section>
  );
}
