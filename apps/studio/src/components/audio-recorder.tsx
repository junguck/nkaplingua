'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MAX_SECONDS = 30;

/** Enregistre au micro (MediaRecorder). 30 s au plus : la limite d'un tour IVR. */
export function AudioRecorder({ onChange }: { readonly onChange: (audio: Blob | null) => void }): ReactNode {
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (url !== null) URL.revokeObjectURL(url);
  }, [url]);

  async function start(): Promise<void> {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, noiseSuppression: true } });
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (event) => chunks.push(event.data);
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        setUrl(URL.createObjectURL(blob));
        onChange(blob);
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      timer.current = setTimeout(stop, MAX_SECONDS * 1000);
    } catch {
      setError('Micro indisponible ou refusé.');
    }
  }

  function stop(): void {
    if (timer.current !== null) clearTimeout(timer.current);
    recorder.current?.stop();
    setRecording(false);
  }

  function clear(): void {
    setUrl(null);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {!recording ? (
          <Button type="button" variant="outline" onClick={() => void start()}><Mic className="mr-1 size-4" /> Enregistrer</Button>
        ) : (
          <Button type="button" variant="destructive" onClick={stop}><Square className="mr-1 size-4" /> Arrêter</Button>
        )}
        {url !== null && <Button type="button" variant="ghost" size="icon" onClick={clear} aria-label="Supprimer"><Trash2 className="size-4" /></Button>}
        {recording && <span className="text-sm text-destructive">Enregistrement… ({MAX_SECONDS} s max)</span>}
      </div>
      {url !== null && <audio controls src={url} className="w-full" />}
      {error !== null && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
