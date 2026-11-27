'use client';

import { t, type ChatMessage } from '@nkap/client';
import type { ReplyOption } from '@nkap/contracts';
import { Mic, Volume2 } from 'lucide-react';
import { useState, type JSX } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNkap } from '@/lib/nkap';
import { speak, speechBadgeLabel, type SpeechOutput } from '@/lib/speech';
import { cn } from '@/lib/utils';
import { OperationCard } from './operation-card';
import { StatusBadge } from './status-badge';
import { TraceDetails } from './trace-details';

function optionVariant(option: ReplyOption): 'default' | 'outline' | 'secondary' {
  if (option.input.kind !== 'intent') return 'secondary';
  if (option.input.intent === 'CONFIRM') return 'default';
  if (option.input.intent === 'CANCEL') return 'outline';
  return 'secondary';
}

interface MessageBubbleProps {
  readonly message: ChatMessage;
  /** Seuls les boutons du dernier message sont actifs : on ne confirme pas une fiche périmée. */
  readonly isLast: boolean;
  readonly pending: boolean;
}

export function MessageBubble({ message, isLast, pending }: MessageBubbleProps): JSX.Element {
  const { chat } = useNkap();
  const [speechOutput, setSpeechOutput] = useState<SpeechOutput | null>(null);
  const speechBadge = speechBadgeLabel(speechOutput);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {message.viaVoice ? <Mic className="mr-1.5 inline size-3.5 opacity-80" aria-hidden /> : null}
          {message.text}
        </p>
      </div>
    );
  }

  const { reply, trace } = message;
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] rounded-2xl rounded-bl-sm border bg-card px-4 py-3 shadow-xs">
        <div className="space-y-1 text-sm leading-relaxed" lang={reply.lang === 'wes' ? 'wes' : reply.lang}>
          {reply.parts.map((part, i) => (
            <p key={i} className={cn(i === 0 && 'font-medium')}>
              {part}
            </p>
          ))}
        </div>
        {reply.card ? <OperationCard card={reply.card} lang={reply.lang} /> : null}
        {reply.options.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {reply.options.map((option) => (
              <Button key={option.key} size="sm" variant={optionVariant(option)} disabled={!isLast || pending} onClick={() => void chat.choose(option)}>
                {option.label}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-2">
          <StatusBadge status={reply.status} fallback={reply.fallback} lang={reply.lang} />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-muted-foreground"
            onClick={() => {
              setSpeechOutput(null);
              void speak(reply.text, reply.lang).then(setSpeechOutput);
            }}
          >
            <Volume2 />
            {t('ui.listen', reply.lang)}
          </Button>
        </div>
        {speechBadge !== null ? <Badge variant="warning" aria-label={speechBadge}>{speechBadge}</Badge> : null}
        <TraceDetails trace={trace} lang={reply.lang} />
      </div>
    </div>
  );
}
