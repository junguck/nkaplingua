import { describe, expect, it } from 'vitest';
import { conversationLanguages, languageAvailability, CONVERSATION_KEYS } from '../src/i18n/availability.ts';
import { Catalog } from '../src/i18n/catalog.ts';
import { seedRecords } from '../src/i18n/sync.ts';
import { harness } from './helpers.ts';

function withLanguage(catalog: Catalog, lang: 'ewo' | 'dua', conversation: boolean, ui: number): void {
  if (conversation) for (const key of CONVERSATION_KEYS) catalog.set({ key, lang, text: `[${lang}] ${key}` });
  for (let i = 0; i < ui; i += 1) catalog.set({ key: `ui.cle${i}`, lang, text: `[${lang}] ${i}` });
}

describe('matrice langues × canaux', () => {
  it('fr et en portent tout le parcours sur les six canaux', () => {
    const catalog = Catalog.from(seedRecords());
    const rows = languageAvailability(catalog);
    for (const code of ['fr', 'en'] as const) {
      const row = rows.find((r) => r.code === code);
      expect(row?.conversation).toBe(`${CONVERSATION_KEYS.length}/${CONVERSATION_KEYS.length}`);
      expect(row?.canaux.ussd).toBe('servi');
      expect(row?.canaux.sms).toBe('servi');
      expect(row?.canaux.ivr).toBe('servi');
    }
    expect(conversationLanguages(catalog)).toEqual(['fr', 'en']);
  });

  it('une langue sans aucune traduction est absente partout, jamais proposée au menu', () => {
    const catalog = Catalog.from(seedRecords());
    const fub = languageAvailability(catalog).find((r) => r.code === 'fub');
    expect(fub?.conversation).toBe(`0/${CONVERSATION_KEYS.length}`);
    expect(fub?.canaux.ussd).toBe('absent');
    expect(conversationLanguages(catalog)).not.toContain('fub');
  });

  it('une langue qui n’a que des écrans sert mobile, web et GAB, pas le conversationnel', () => {
    const catalog = Catalog.from(seedRecords());
    withLanguage(catalog, 'dua', false, 40);
    const dua = languageAvailability(catalog).find((r) => r.code === 'dua');
    expect(dua?.canaux.mobile).toBe('servi');
    expect(dua?.canaux.web).toBe('servi');
    expect(dua?.canaux.atm).toBe('servi');
    expect(dua?.canaux.ussd).toBe('absent');
    expect(conversationLanguages(catalog)).not.toContain('dua');
  });

  it('dès que les 55 phrases sont validées, la langue apparaît sur les trois canaux conversationnels', () => {
    const catalog = Catalog.from(seedRecords());
    withLanguage(catalog, 'ewo', true, 0);
    const ewo = languageAvailability(catalog).find((r) => r.code === 'ewo');
    expect(ewo?.conversation).toBe(`${CONVERSATION_KEYS.length}/${CONVERSATION_KEYS.length}`);
    expect(ewo?.canaux.ussd).toBe('servi');
    expect(ewo?.canaux.ivr).toBe('servi');
    expect(ewo?.canaux.mobile).toBe('absent');
    expect(conversationLanguages(catalog)).toContain('ewo');
  });

  it('GET /langues expose la matrice et la liste réellement servie', async () => {
    const h = await harness();
    try {
      const res = await h.app.inject({ method: 'GET', url: '/langues' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ canaux: string[]; langues: { code: string; canaux: Record<string, string> }[]; servi: string[] }>();
      expect(body.canaux).toEqual(['ussd', 'mobile', 'web', 'sms', 'atm', 'ivr']);
      expect(body.langues.map((l) => l.code)).toContain('dua');
      expect(body.servi).toEqual(['fr', 'en']);
      expect(body.langues.find((l) => l.code === 'fr')?.canaux.ussd).toBe('servi');
    } finally {
      await h.close();
    }
  });
});
