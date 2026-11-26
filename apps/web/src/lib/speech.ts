import { LANGUAGE_INFO, type LanguageCode } from '@nkap/contracts';

/** Sous-ensemble typé de l'API Web Speech (absente des typings DOM de base, préfixée sur Chrome). */
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

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Le fulfulde n'a aucune reconnaissance vocale système : on ne fait pas semblant. */
export function canListen(lang: LanguageCode): boolean {
  return LANGUAGE_INFO[lang].sttLocale !== null && recognitionConstructor() !== null;
}

export function listenOnce(lang: LanguageCode, onText: (text: string) => void, onEnd: () => void): (() => void) | null {
  const Ctor = recognitionConstructor();
  const locale = LANGUAGE_INFO[lang].sttLocale;
  if (Ctor === null || locale === null) return null;
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
  return () => recognition.stop();
}

/** Synthèse de repli : voix française pour le fulfulde (aucune voix système n'existe). */
export function speak(text: string, lang: LanguageCode): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LANGUAGE_INFO[lang].ttsLocale;
  window.speechSynthesis.speak(utterance);
}
