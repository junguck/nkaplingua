import { LANGUAGE_INFO, type LanguageCode } from '@nkap/contracts';

interface RecognitionResultEvent {
  readonly results: ArrayLike<ArrayLike<{ readonly transcript: string; readonly confidence: number }>>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => Recognition;
export type SpeechOutput = 'synthetic-draft' | 'device-fallback' | 'unavailable';
export interface SpeechRecordingControls {
  readonly stop: () => void;
  readonly cancel: () => void;
}

export function speechBadgeLabel(output: SpeechOutput | null): string | null {
  return output === 'synthetic-draft' ? 'voix synthétique (brouillon)' : null;
}

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canListen(lang: LanguageCode): boolean {
  const mode = LANGUAGE_INFO[lang].asrMode;
  if (mode === 'server') {
    return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && navigator.mediaDevices?.getUserMedia !== undefined;
  }
  return mode === 'device' && LANGUAGE_INFO[lang].sttLocale !== null && recognitionConstructor() !== null;
}

export function listenOnce(
  lang: LanguageCode,
  onText: (text: string) => void,
  onEnd: () => void,
  onError: (error: Error) => void = () => undefined,
): SpeechRecordingControls | null {
  if (LANGUAGE_INFO[lang].asrMode === 'server') return listenOnServer(lang, onText, onEnd, onError);
  const Ctor = recognitionConstructor();
  const locale = LANGUAGE_INFO[lang].sttLocale;
  if (LANGUAGE_INFO[lang].asrMode !== 'device' || Ctor === null || locale === null) return null;
  const recognition = new Ctor();
  recognition.lang = locale;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const transcript = event.results[0]?.[0]?.transcript;
    if (transcript !== undefined) onText(transcript);
  };
  recognition.onerror = onEnd;
  recognition.onend = onEnd;
  recognition.start();
  const stop = (): void => recognition.stop();
  return { stop, cancel: stop };
}

function listenOnServer(
  lang: LanguageCode,
  onText: (text: string) => void,
  onEnd: () => void,
  onError: (error: Error) => void,
): SpeechRecordingControls | null {
  if (!canRecord()) return null;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let cancelled = false;
  let finished = false;
  const chunks: Blob[] = [];
  const finish = (): void => {
    if (finished) return;
    finished = true;
    onEnd();
  };
  const stopTracks = (): void => stream?.getTracks().forEach((track) => track.stop());

  void navigator.mediaDevices.getUserMedia({ audio: true }).then((media) => {
    stream = media;
    if (cancelled) {
      stopTracks();
      finish();
      return;
    }
    recorder = new MediaRecorder(media);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = (event) => {
      onError(event.error);
      stopTracks();
      finish();
    };
    recorder.onstop = () => {
      if (finished) return;
      stopTracks();
      if (cancelled) {
        finish();
        return;
      }
      void transcribeRecording(new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }), lang)
        .then(onText)
        .catch((error: unknown) => onError(asError(error)))
        .finally(finish);
    };
    recorder.start();
  }).catch((error: unknown) => {
    onError(asError(error));
    finish();
  });

  const stop = (): void => {
    if (recorder?.state === 'recording') {
      recorder.stop();
    } else {
      cancelled = true;
      stopTracks();
      finish();
    }
  };
  const cancel = (): void => {
    cancelled = true;
    if (recorder?.state === 'recording') recorder.stop();
    else {
      stopTracks();
      finish();
    }
  };
  return { stop, cancel };
}

function canRecord(): boolean {
  return typeof window !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && navigator.mediaDevices?.getUserMedia !== undefined;
}

async function transcribeRecording(audio: Blob, lang: LanguageCode): Promise<string> {
  if (audio.size === 0) throw new Error('Aucun audio enregistré');
  const response = await fetch(`/v1/stt?lang=${encodeURIComponent(lang)}`, {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'application/octet-stream' },
    body: audio,
  });
  if (!response.ok) throw new Error(await responseError(response));
  const result: unknown = await response.json();
  if (!isTranscript(result)) throw new Error('Réponse STT invalide');
  return result.text;
}

export async function speak(text: string, lang: LanguageCode): Promise<SpeechOutput> {
  if (typeof window === 'undefined') return 'unavailable';
  if (LANGUAGE_INFO[lang].ttsMode === 'server') {
    try {
      const response = await fetch('/v1/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang }),
      });
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size > 0 && blob.type.includes('wav')) {
          await playWav(blob);
          return 'synthetic-draft';
        }
      }
    } catch {
      // An unavailable server voice falls back to the existing device voice.
    }
  }
  if (!('speechSynthesis' in window)) return 'unavailable';
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LANGUAGE_INFO[lang].ttsLocale;
  window.speechSynthesis.speak(utterance);
  return 'device-fallback';
}

export function confirmedVoiceText(text: string, confirmed: boolean): string | null {
  const value = text.trim();
  return confirmed && value.length > 0 ? value : null;
}

async function playWav(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  const release = (): void => URL.revokeObjectURL(url);
  audio.onended = release;
  audio.onerror = release;
  try {
    await audio.play();
  } catch (error) {
    release();
    throw error;
  }
}

async function responseError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') return body.error;
  } catch {
    return `Erreur vocale HTTP ${response.status}`;
  }
  return `Erreur vocale HTTP ${response.status}`;
}

function isTranscript(value: unknown): value is { readonly text: string; readonly confidence: number } {
  if (typeof value !== 'object' || value === null) return false;
  return 'text' in value && typeof value.text === 'string'
    && 'confidence' in value && typeof value.confidence === 'number' && Number.isFinite(value.confidence);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
