'use client';

import { t } from '@nkap/client';
import { Mic, MicOff, SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useConversation, useNkap } from '@/lib/nkap';
import { canListen, listenOnce } from '@/lib/speech';

export function Composer(): JSX.Element {
  const { chat } = useNkap();
  const { lang, pending } = useConversation();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [micAvailable, setMicAvailable] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  // La disponibilité dépend du navigateur : calculée après l'hydratation, jamais côté serveur.
  useEffect(() => setMicAvailable(canListen(lang)), [lang]);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const value = text;
    setText('');
    void chat.sayText(value);
  };

  const toggleMic = (): void => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    stopRef.current = listenOnce(
      lang,
      (heard) => void chat.sayText(heard, true),
      () => setListening(false),
    );
    setListening(stopRef.current !== null);
  };

  const micLabel = micAvailable ? (listening ? t('ui.mic.listening', lang) : t('ui.mic', lang)) : t('ui.mic.unavailable', lang);

  return (
    <form onSubmit={submit} className="flex items-center gap-2 border-t bg-background p-3">
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Le span garde l'infobulle active sur un bouton désactivé. */}
          <span tabIndex={micAvailable ? -1 : 0}>
            <Button
              type="button"
              size="icon"
              variant={listening ? 'destructive' : 'outline'}
              disabled={!micAvailable || pending}
              onClick={toggleMic}
              aria-label={micLabel}
              className="rounded-full"
            >
              {micAvailable ? <Mic /> : <MicOff />}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{micLabel}</TooltipContent>
      </Tooltip>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('ui.placeholder', lang)} aria-label={t('ui.placeholder', lang)} className="rounded-full" />
      <Button type="submit" size="icon" disabled={pending || text.trim().length === 0} aria-label={t('ui.send', lang)} className="rounded-full">
        <SendHorizontal />
      </Button>
    </form>
  );
}
