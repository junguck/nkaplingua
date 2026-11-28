/**
 * Matrice langues × canaux : ce que `GET /langues` publie doit être la même vérité que le
 * dialogue (USSD/SMS/IVR) et les écrans (mobile/web/GAB) — pas une déclaration.
 */

import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_TEAM_KEY, createMiddlewareServer } from '../src/index.js';
import {
  CHANNELS,
  CONVERSATION_KEYS,
  MIN_UI_KEYS,
  conversationLanguages,
  languageAvailability,
} from '../src/language-availability.js';

describe('matrice langues × canaux', () => {
  it('fr, en et fub portent tout le parcours sur les trois canaux conversationnels', () => {
    const rows = languageAvailability();
    for (const code of ['fr', 'en', 'fub'] as const) {
      const row = rows.find((r) => r.code === code);
      expect(row?.conversation).toBe(`${CONVERSATION_KEYS.length}/${CONVERSATION_KEYS.length}`);
      expect(row?.canaux.ussd).toBe('servi');
      expect(row?.canaux.sms).toBe('servi');
      expect(row?.canaux.ivr).toBe('servi');
    }
  });

  it('une langue sans pack ni traduction studio est absente partout, jamais proposée au menu', () => {
    const dua = languageAvailability().find((r) => r.code === 'dua');
    expect(dua?.conversation).toBe(`0/${CONVERSATION_KEYS.length}`);
    expect(dua?.canaux.ussd).toBe('absent');
    expect(dua?.canaux.mobile).toBe('absent');
    expect(conversationLanguages()).not.toContain('dua');
  });

  it('le menu Langue ne propose que les langues qui portent tout le parcours, français en tête', () => {
    expect(conversationLanguages()).toEqual(['fr', 'en', 'fub']);
  });

  it('les écrans partent en français sous 75 % de clés traduites', () => {
    expect(MIN_UI_KEYS).toBeGreaterThan(0);
    const rows = languageAvailability();
    const fr = rows.find((r) => r.code === 'fr');
    const fub = rows.find((r) => r.code === 'fub');
    // Le français est la langue source : ses écrans sont servis, quel que soit le seuil.
    expect(fr?.canaux.mobile).toBe('servi');
    expect(fr?.ecrans).toBeGreaterThanOrEqual(MIN_UI_KEYS);
    // Le fulfulde couvre l'accueil et le parcours de paiement, pas les 75 % d'écrans.
    expect(fub?.ecrans).toBeLessThan(MIN_UI_KEYS);
    expect(fub?.ecrans).toBeGreaterThan(0);
    expect(fub?.canaux.mobile).toBe('partiel');
    expect(fub?.canaux.web).toBe('partiel');
    expect(fub?.canaux.atm).toBe('partiel');
  });

  it('GET /langues publie la matrice et la liste réellement servie', async () => {
    let server: ReturnType<typeof createMiddlewareServer> | undefined;
    try {
      server = createMiddlewareServer({ teamKey: DEMO_TEAM_KEY, bankUrl: 'http://127.0.0.1:1', log: () => undefined });
      await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const body = (await fetch(`${base}/langues`).then((response) => response.json())) as {
        canaux: string[];
        matrice: { code: string; conversation: string; canaux: Record<string, string> }[];
        servi: string[];
        languages: unknown[];
      };
      expect(body.canaux).toEqual([...CHANNELS]);
      expect(body.servi).toEqual(['fr', 'en', 'fub']);
      expect(body.matrice.map((row) => row.code)).toContain('hau');
      expect(body.matrice.find((row) => row.code === 'fr')?.canaux.ussd).toBe('servi');
      expect(body.matrice.find((row) => row.code === 'wes')?.canaux.ussd).toBe('absent');
      expect(Array.isArray(body.languages)).toBe(true);
    } finally {
      if (server !== undefined) await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
  });
});
