import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createMiddlewareServer } from '../src/server.js';
import type { SpeechBackend } from '../src/speech-backend.js';

const servers: ReturnType<typeof createMiddlewareServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function serverUrl(speechBackend?: SpeechBackend): Promise<string> {
  const server = createMiddlewareServer({
    teamKey: '',
    bankUrl: '',
    ...(speechBackend === undefined ? {} : { speechBackend }),
    log: () => undefined,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe('speech gateway routes', () => {
  it('returns 501 for STT and TTS when the backend is disabled', async () => {
    const previousUrl = process.env.SPEECH_BACKEND_URL;
    delete process.env.SPEECH_BACKEND_URL;
    try {
      const url = await serverUrl();
      const stt = await fetch(`${url}/v1/stt?lang=ewo`, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: new Uint8Array([1, 2, 3]),
      });
      const tts = await fetch(`${url}/v1/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Bonjour', lang: 'ewo' }),
      });

      expect(stt.status).toBe(501);
      expect(tts.status).toBe(501);
    } finally {
      if (previousUrl === undefined) delete process.env.SPEECH_BACKEND_URL;
      else process.env.SPEECH_BACKEND_URL = previousUrl;
    }
  });

  it('returns WAV audio marked as draft from a configured backend', async () => {
    const speechBackend: SpeechBackend = {
      async transcribe(audio, lang, contentType) {
        expect(audio).toEqual(Buffer.from([4, 5, 6]));
        expect(lang).toBe('bul');
        expect(contentType).toBe('audio/webm');
        return { text: 'mbembe kidi', confidence: 0.87 };
      },
      async synthesize() {
        return Buffer.from('wav-data');
      },
    };
    const url = await serverUrl(speechBackend);
    const response = await fetch(`${url}/v1/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'mbembe kidi', lang: 'ewo' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/wav');
    expect(response.headers.get('x-translation-status')).toBe('draft');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('wav-data');

    const transcript = await fetch(`${url}/v1/stt?lang=bul`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/webm' },
      body: new Uint8Array([4, 5, 6]),
    });
    expect(await transcript.json()).toEqual({ text: 'mbembe kidi', confidence: 0.87 });
  });
});
