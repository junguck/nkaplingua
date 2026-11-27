import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEMO_TEAM_KEY,
  clipForText,
  createMiddlewareServer,
  voiceModel,
  voiceSummary,
} from '../src/index.js';
import { message } from '../src/i18n.js';

const PHONE = '237699000003';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nkap-voice-'));
const MENU = message('fr', 'ivr.menu');

/** WAV minimal mais valide (en-tête RIFF + 800 échantillons silencieux 8 kHz mono 16 bits). */
function wav(): Buffer {
  const samples = Buffer.alloc(1600);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

function installIndex(): void {
  fs.mkdirSync(path.join(dir, 'fr'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'fr', 'ivr.menu.wav'), wav());
  fs.writeFileSync(
    path.join(dir, 'index.json'),
    `${JSON.stringify(
      {
        engine: 'facebook/mms-tts',
        generated_at: '2026-11-27T10:00:00Z',
        models: ['facebook/mms-tts-fra'],
        sampling_rate: 16000,
        clips: [
          {
            lang: 'fr',
            key: 'ivr.menu',
            text: MENU,
            file: 'fr/ivr.menu.wav',
            duration_ms: 1200,
            bytes: 1644,
            model: 'facebook/mms-tts-fra',
            engine: 'facebook/mms-tts',
            status: 'generated',
          },
        ],
        failures: [],
        licence: 'facebook/mms-tts — CC-BY-NC 4.0',
      },
      null,
      2,
    )}\n`,
  );
}

// Installé une fois pour tout le fichier : les deux blocs partagent le même dossier.
process.env.NKAP_AUDIO_DIR = dir;
installIndex();

interface IvrAudit {
  say: string;
  audio: { url: string; model: string } | null;
  voice: { model: string | null; note?: string };
  language: string;
}

describe('voix MMS-TTS', () => {
  it('retrouve un clip par son texte exact, espaces compris', () => {
    expect(clipForText('fr', MENU.replace(/\n/g, '   '))?.key).toBe('ivr.menu');
    expect(clipForText('fr', 'phrase inconnue')).toBeNull();
    expect(clipForText('en', MENU)).toBeNull();
  });

  it('déclare les langues sans modèle publié', () => {
    expect(voiceModel('fr')).toBe('facebook/mms-tts-fra');
    expect(voiceModel('fub')).toBeNull();
    const summary = voiceSummary();
    expect(summary.languages).toEqual([{ lang: 'fr', model: 'facebook/mms-tts-fra', clips: 1 }]);
    expect(summary.withoutModel).toContain('fub');
    expect(summary.licence).toContain('CC-BY-NC');
  });
});

describe('routes voix et audio', () => {
  let server: ReturnType<typeof createMiddlewareServer>;
  let base: string;

  beforeAll(async () => {
    server = createMiddlewareServer({
      teamKey: DEMO_TEAM_KEY,
      bankUrl: 'http://127.0.0.1:1',
      localChannels: true,
      log: () => undefined,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('sert un clip WAV et son index', async () => {
    const clip = await fetch(`${base}/audio/fr/ivr.menu.wav`);
    expect(clip.status).toBe(200);
    expect(clip.headers.get('content-type')).toBe('audio/wav');
    expect((await clip.arrayBuffer()).byteLength).toBe(1644);

    const index = await fetch(`${base}/audio/index.json`).then(
      (response) => response.json() as Promise<{ clips: unknown[] }>,
    );
    expect(index.clips).toHaveLength(1);
  });

  it('refuse un clip absent ou une tentative de traversée', async () => {
    expect((await fetch(`${base}/audio/fr/absent.wav`)).status).toBe(404);
    // Le motif n'accepte ni `/` ni `..` : la tentative de traversée ne peut pas atteindre un fichier.
    const traversal = await fetch(`${base}/audio/..%2f..%2fpackage.json`);
    expect([404, 405]).toContain(traversal.status);
  });

  it('sert la page d’écoute', async () => {
    const page = await fetch(`${base}/voix`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('MMS-TTS');
  });

  it('attache le clip à la réponse IVR quand la phrase correspond', async () => {
    const reply = await fetch(`${base}/ivr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_id: 'voix-1', phone: PHONE, language: 'fr', input: { digits: '' } }),
    }).then((response) => response.json() as Promise<IvrAudit>);
    expect(reply.say).toBe(MENU);
    expect(reply.audio).toMatchObject({ url: '/audio/fr/ivr.menu.wav', model: 'facebook/mms-tts-fra' });
    expect(reply.voice).toEqual({ model: 'facebook/mms-tts-fra' });
  });

  it('n’invente pas de voix pour une langue sans modèle', async () => {
    const reply = await fetch(`${base}/ivr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_id: 'voix-2', phone: PHONE, language: 'fub', input: { digits: '' } }),
    }).then((response) => response.json() as Promise<IvrAudit>);
    expect(reply.language).toBe('fub');
    expect(reply.audio).toBeNull();
    expect(reply.voice.model).toBeNull();
    expect(String(reply.voice.note)).toContain('Aucun modèle');
  });
});

// Nettoyage en dernier : les deux blocs partagent le même dossier audio.
afterAll(() => {
  delete process.env.NKAP_AUDIO_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});
