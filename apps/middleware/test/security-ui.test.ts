import { afterEach, describe, expect, it } from 'vitest';
import { harness, type Harness } from './helpers.ts';

let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});

const ussd = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  trace_id: 'x',
  channel: 'ussd',
  session_id: 's',
  phone: '237699000001',
  language: null,
  input: { type: 'text', text: '' },
  ...extra,
});

describe('sécurité', () => {
  it('ignore un bank_api.base_url forgé : la clé ne part jamais vers un tiers', async () => {
    h = await harness();
    await h.turn({});
    const res = await h.app.inject({
      method: 'POST',
      url: '/',
      payload: { ...ussd({ input: { type: 'text', text: '1' } }), bank_api: { base_url: 'https://attaquant.example/api' } },
    });
    expect(res.statusCode).toBe(200);
    expect(h.bank.calls.at(-1)?.path).toBe('/accounts/237699000001');
  });

  it('avec HOOK_SECRET : POST / n’existe plus, un mauvais secret renvoie 404', async () => {
    h = await harness({ hookSecret: 'un-secret-de-test-assez-long-0001' });
    expect((await h.app.inject({ method: 'POST', url: '/', payload: ussd() })).statusCode).toBe(404);
    expect((await h.app.inject({ method: 'POST', url: '/hook/mauvais', payload: ussd() })).statusCode).toBe(404);
    expect((await h.app.inject({ method: 'POST', url: '/hook/un-secret-de-test-assez-long-0001', payload: ussd() })).statusCode).toBe(200);
  });

  it('payload mal formé : 422 avec le champ fautif, sans trace de pile', async () => {
    h = await harness();
    const res = await h.app.inject({ method: 'POST', url: '/', payload: { channel: 'ussd', phone: 'abc', input: { type: 'text' } } });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'INVALID_REQUEST', field: 'phone' });
  });

  it('limite de débit par numéro', async () => {
    const { MemoryRateLimiter } = await import('../src/security/guard.ts');
    h = await harness({ rateLimiter: new MemoryRateLimiter(2) });
    await h.turn({});
    await h.turn({});
    const res = await h.app.inject({ method: 'POST', url: '/', payload: ussd() });
    expect(res.statusCode).toBe(429);
  });
});

describe('traduction d’écrans (mobile, web, GAB)', () => {
  const screen = (language: string): Record<string, unknown> => ({
    trace_id: 'ui-1',
    channel: 'mobile',
    type: 'ui_translation',
    screen: 'home',
    language,
    source_language: 'fr',
    strings: {
      'nav.home': { text: 'Accueil', context: 'Onglet', max_chars: 12 },
      'shell.greeting': { text: 'Bonjour {name}', context: 'En-tête', max_chars: null },
      'home.balance_label': { text: 'Solde disponible', context: 'Libellé', max_chars: null },
      'common.back': { text: 'Retour', context: 'Bouton', max_chars: 20 },
    },
  });

  it('langue couverte : emplacements intacts, max_chars respecté', async () => {
    h = await harness();
    h.catalog.set({ key: 'ui.nav.home', lang: 'en', text: 'Home' });
    h.catalog.set({ key: 'ui.shell.greeting', lang: 'en', text: 'Hello {name}' });
    h.catalog.set({ key: 'ui.home.balance_label', lang: 'en', text: 'Available balance' });
    h.catalog.set({ key: 'ui.common.back', lang: 'en', text: 'Back' });
    const res = await h.app.inject({ method: 'POST', url: '/', payload: screen('en') });
    expect(res.json()).toEqual({
      language: 'en',
      strings: { 'nav.home': 'Home', 'shell.greeting': 'Hello {name}', 'home.balance_label': 'Available balance', 'common.back': 'Back' },
    });
  });

  it('traduction qui casse un emplacement ou dépasse : écartée, jamais servie', async () => {
    h = await harness();
    h.catalog.set({ key: 'ui.nav.home', lang: 'en', text: 'Home page of the app' });
    h.catalog.set({ key: 'ui.shell.greeting', lang: 'en', text: 'Hello {nom}' });
    const res = await h.app.inject({ method: 'POST', url: '/', payload: screen('en') });
    expect(res.json().language).toBe('fr');
  });

  it('langue sans dictionnaire : français déclaré fr, toutes les clés présentes', async () => {
    h = await harness();
    const res = await h.app.inject({ method: 'POST', url: '/', payload: screen('dua') });
    expect(res.json().language).toBe('fr');
    expect(Object.keys(res.json().strings)).toHaveLength(4);
  });
});
