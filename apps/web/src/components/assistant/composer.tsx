'use client';

import { t } from '@nkap/client';
import { Mic, MicOff, SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useConversation, useNkap } from '@/lib/nkap';
import { canListen, confirmedVoiceText, listenOnce } from '@/lib/speech';

export function Composer(): JSX.Element {
  const { chat } = useNkap();
  const { lang, pending } = useConversation();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [micAvailable, setMicAvailable] = useState(false);
  const [voiceNeedsConfirmation, setVoiceNeedsConfirmation] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const stopRef = useRef<{ readonly stop: () => void; readonly cancel: () => void } | null>(null);

  // La disponibilité dépend du navigateur : calculée après l'hydratation, jamais côté serveur.
  useEffect(() => setMicAvailable(canListen(lang)), [lang]);
  useEffect(() => () => stopRef.current?.cancel(), []);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const value = confirmedVoiceText(text, !voiceNeedsConfirmation);
    if (value === null) return;
    setText('');
    void chat.sayText(value);
  };

  const confirmVoiceText = (): void => {
    const value = confirmedVoiceText(text, true);
    if (value === null) return;
    setVoiceNeedsConfirmation(false);
    setText('');
    void chat.sayText(value, true);
  };

  const toggleMic = (): void => {
    if (listening) {
      stopRef.current?.stop();
      return;
    }
    stopRef.current = listenOnce(
      lang,
      (heard) => {
        setText(heard);
        setVoiceNeedsConfirmation(true);
        setSpeechError(null);
      },
      () => setListening(false),
      (error) => setSpeechError(error.message),
    );
    setSpeechError(null);
    setListening(stopRef.current !== null);
  };

  const micLabel = micAvailable ? (listening ? t('ui.mic.listening', lang) : t('ui.mic', lang)) : t('ui.mic.unavailable', lang);

  return (
    <form onSubmit={submit} className="border-t bg-background p-3">
      {voiceNeedsConfirmation ? (
        <div className="mb-2 flex items-center justify-between gap-2 text-sm" role="status">
          <span>{t('ui.voice.review', lang)}</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setVoiceNeedsConfirmation(false)}>{t('ui.voice.edit', lang)}</Button>
            <Button type="button" size="sm" onClick={confirmVoiceText}>{t('ui.voice.confirm', lang)}</Button>
          </div>
        </div>
      ) : null}
      {speechError !== null ? <p className="mb-2 text-sm text-destructive" role="alert">{speechError}</p> : null}
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
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
        <Button type="submit" size="icon" disabled={pending || text.trim().length === 0 || voiceNeedsConfirmation} aria-label={t('ui.send', lang)} className="rounded-full">
          <SendHorizontal />
        </Button>
      </div>
    </form>
  );
}
