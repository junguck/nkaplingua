import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { InboundTurn, UssdReply } from '@nkap/safinum';

/**
 * Fichier isolé : le dossier des packs est lu au chargement du module. Les packs ci-dessous sont des
 * DONNÉES DE TEST (français préfixé « [test] »), jamais des traductions.
 */
let gatewayModule: typeof import('../src/index.js');

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'packs-served-'));
  // Phrases françaises de référence (premier chargement du module, avec le dossier par défaut).
  const fr = (await import('../src/i18n.js')).USSD_REFERENCE;
  const complete = Object.fromEntries(Object.entries(fr).map(([k, v]) => [k, `[test] ${v}`]));
  const partial = { 'menu.header': '[test] menu' };
  fs.writeFileSync(path.join(dir, 'dua.json'), JSON.stringify({ language: 'dua', status: 'draft', sources: ['test'], ui: { 'nav.home': '[test] accueil' }, ussd: complete }));
  fs.writeFileSync(path.join(dir, 'ewo.json'), JSON.stringify({ language: 'ewo', status: 'draft', sources: ['test'], ui: {}, ussd: partial }));
  process.env.NKAP_TRANSLATIONS_DIR = dir;
  const { vi } = await import('vitest');
  vi.resetModules();
  gatewayModule = await import('../src/index.js');
});

const turn = (language: string, text: string): InboundTurn => ({
  trace_id: 't',
  channel: 'ussd',
  session_id: `s-${language}-${text}`,
  phone: '237699000003',
  language,
  input: { type: 'text', text },
});

describe('pack servi de bout en bout', () => {
  it('pack USSD complet : la langue est servie et déclarée', async () => {
    const gw = new gatewayModule.Gateway({ teamKey: 'k', bankUrl: '', bankFactory: () => ({}) as never });
    const reply = (await gw.handle(turn('dua', ''))) as UssdReply;
    expect(reply.interpretation.language).toBe('dua');
    expect(reply.response.text.startsWith('[test]')).toBe(true);
  });

  it('pack USSD incomplet : réponse en français, déclarée fr', async () => {
    const gw = new gatewayModule.Gateway({ teamKey: 'k', bankUrl: '', bankFactory: () => ({}) as never });
    const reply = (await gw.handle(turn('ewo', ''))) as UssdReply;
    expect(reply.interpretation.language).toBe('fr');
    expect(reply.response.text).toContain('Choisissez');
  });

  it('le menu 8 propose la langue du pack complet', async () => {
    const gw = new gatewayModule.Gateway({ teamKey: 'k', bankUrl: '', bankFactory: () => ({}) as never });
    await gw.handle({ ...turn('fr', ''), session_id: 'menu8' });
    const reply = (await gw.handle({ ...turn('fr', '8'), session_id: 'menu8' })) as UssdReply;
    // Options en GSM-7 (USSD) : « Français » → « Francais », « Duálá » → « Duala ».
    expect(reply.response.options).toEqual(['Francais', 'English', 'Fulfulde', 'Duala']);
  });
});
