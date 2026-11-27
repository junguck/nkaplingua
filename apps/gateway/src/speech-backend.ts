export type SpeechLanguage = 'ewo' | 'bul';

export interface SpeechTranscript {
  readonly text: string;
  readonly confidence: number;
}

export interface SpeechBackend {
  transcribe(audio: Buffer, lang: SpeechLanguage, contentType: string): Promise<SpeechTranscript>;
  synthesize(text: string, lang: SpeechLanguage): Promise<Buffer>;
}

export class SpeechBackendError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SpeechBackendError';
  }
}

export class DisabledSpeechBackend implements SpeechBackend {
  async transcribe(): Promise<SpeechTranscript> {
    throw new SpeechBackendError(501, 'Backend vocal désactivé');
  }

  async synthesize(): Promise<Buffer> {
    throw new SpeechBackendError(501, 'Backend vocal désactivé');
  }
}

export class HttpSpeechBackend implements SpeechBackend {
  constructor(private readonly baseUrl: string) {}

  async transcribe(audio: Buffer, lang: SpeechLanguage, contentType: string): Promise<SpeechTranscript> {
    const url = new URL('/v1/stt', this.baseUrl);
    url.searchParams.set('lang', lang);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: Uint8Array.from(audio),
    });
    if (!response.ok) throw new SpeechBackendError(502, `Service STT: HTTP ${response.status}`);
    const result: unknown = await response.json();
    if (!isTranscript(result)) throw new SpeechBackendError(502, 'Réponse STT invalide');
    return result;
  }

  async synthesize(text: string, lang: SpeechLanguage): Promise<Buffer> {
    const response = await fetch(new URL('/v1/tts', this.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang }),
    });
    if (!response.ok) throw new SpeechBackendError(502, `Service TTS: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
}

export function speechBackendFromEnv(): SpeechBackend {
  const url = process.env.SPEECH_BACKEND_URL;
  return url ? new HttpSpeechBackend(url) : new DisabledSpeechBackend();
}

export function isSpeechLanguage(value: unknown): value is SpeechLanguage {
  return value === 'ewo' || value === 'bul';
}

function isTranscript(value: unknown): value is SpeechTranscript {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return typeof result.text === 'string' && typeof result.confidence === 'number' && Number.isFinite(result.confidence);
}
