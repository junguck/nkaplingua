import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmedVoiceText, speak, speechBadgeLabel } from '../src/lib/speech.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('assistant speech', () => {
  it('uses the French device voice when the server TTS backend is unavailable', async () => {
    const spoken: Array<{ readonly text: string; lang: string }> = [];
    class MockUtterance {
      lang = '';
      constructor(readonly text: string) {}
    }
    const synthesis = {
      cancel: vi.fn(),
      speak: vi.fn((utterance: MockUtterance) => spoken.push(utterance)),
    };
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
    vi.stubGlobal('window', { speechSynthesis: synthesis });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('disabled', { status: 501 })));

    const output = await speak('Texte à prononcer', 'ewo');

    expect(output).toBe('device-fallback');
    expect(spoken.at(-1)?.lang).toBe('fr-FR');
  });

  it('marks successful server audio as a synthetic draft', async () => {
    const playMock = vi.fn().mockResolvedValue(undefined);
    class MockAudio {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly source: string) {}
      play(): Promise<void> {
        return playMock();
      }
    }
    vi.stubGlobal('window', { speechSynthesis: { cancel: vi.fn(), speak: vi.fn() } });
    vi.stubGlobal('Audio', MockAudio);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['RIFF']), {
      status: 200,
      headers: { 'Content-Type': 'audio/wav' },
    })));

    const output = await speak('Texte', 'bul');
    expect(output).toBe('synthetic-draft');
    expect(speechBadgeLabel(output)).toBe('voix synthétique (brouillon)');
    expect(playMock).toHaveBeenCalledOnce();
  });

  it('does not make a recognized transcript eligible until explicit confirmation', () => {
    expect(confirmedVoiceText('  envoie 500 ', false)).toBeNull();
    expect(confirmedVoiceText('  envoie 500 ', true)).toBe('envoie 500');
  });
});
