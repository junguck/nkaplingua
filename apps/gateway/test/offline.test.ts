import { describe, expect, it } from 'vitest';
import { Connectivity, Gateway, SyncQueue, TranslationCache, gsm7Length, isGsm7, type BankPort, type InboundTurn, type UssdReply } from '../src/index.js';

const DOWN = { ok: false, status: 0, error: 'UNREACHABLE', message: 'réseau coupé' } as const;
const deadBank = new Proxy({}, { get: () => async () => DOWN }) as unknown as BankPort;

function ussd(text: string, language = 'en'): InboundTurn {
  return { trace_id: 't', channel: 'ussd', session_id: 's1', phone: '237699000003', language, input: { type: 'ussd', text } };
}

describe('mode hors-ligne', () => {
  it('répond par un menu pré-traduit, GSM-7, ≤182, session ouverte', async () => {
    const gw = new Gateway({ teamKey: 'k', bankUrl: '', bankFactory: () => deadBank });
    const reply = (await gw.handle(ussd('1'))) as UssdReply;
    expect(reply.response.end_session).toBe(false);
    expect(reply.response.text).toContain('Service temporarily unavailable');
    expect(reply.response.text).toContain('1. ');
    expect(isGsm7(reply.response.text)).toBe(true);
    expect(gsm7Length(reply.response.text)).toBeLessThanOrEqual(182);
    expect(gw.connectivity.isOffline).toBe(true);
  });

  it('hors-ligne, ne sonde pas la banque à chaque tour', async () => {
    let calls = 0;
    const bank = new Proxy({}, { get: () => async () => (calls++, DOWN) }) as unknown as BankPort;
    const gw = new Gateway({ teamKey: 'k', bankUrl: '', bankFactory: () => bank, offline: { connectivity: new Connectivity(60_000) } });
    await gw.handle(ussd('1'));
    await gw.handle(ussd('1'));
    await gw.handle(ussd('1'));
    expect(calls).toBe(1);
  });

  it('refuse une correction qui viole max_chars, charset ou emplacements', () => {
    const gw = new Gateway({ teamKey: 'k', bankUrl: '' });
    expect(gw.correct('en', 'menu.balance', 'x'.repeat(300), 182, 'gsm7')).toBe('OVER_LENGTH');
    expect(gw.correct('fub', 'menu.balance', 'Ɓɗɓ ʼ', 182, 'gsm7')).toBe('NOT_GSM7');
    expect(gw.correct('en', 'ui:home.account', 'Account', null, 'utf8')).toBe('PLACEHOLDERS');
    expect(gw.queue.pending).toHaveLength(0);
  });

  it('une correction vaut tout de suite, est mise en file, puis synchronisée au retour du réseau', async () => {
    const sent: string[] = [];
    const gw = new Gateway({
      teamKey: 'k',
      bankUrl: '',
      offline: { sender: async (c) => (sent.push(...c.map((x) => x.text)), true) },
    });
    gw.connectivity.markOffline();
    expect(gw.correct('en', 'ui:common.back', 'Go back', 12)).toBeNull();
    expect(sent).toEqual([]);
    expect(gw.queue.pending).toHaveLength(1);
    const screen: InboundTurn = {
      type: 'ui_translation', channel: 'mobile', language: 'en', screen: 'x',
      strings: { 'common.back': { text: 'Retour', max_chars: 12 } },
    };
    expect(await gw.handle(screen)).toMatchObject({ language: 'en', strings: { 'common.back': 'Go back' } });
    gw.connectivity.markOnline();
    expect(await gw.sync()).toBe(1);
    expect(sent).toEqual(['Go back']);
    expect(gw.queue.pending).toHaveLength(0);
  });

  it('un envoi raté garde la file intacte', async () => {
    const q = new SyncQueue();
    q.enqueue({ kind: 'new', language: 'en', key: 'a', text: 'A', max_chars: null, charset: 'utf8' });
    expect(await q.flush(async () => false)).toBe(0);
    expect(await q.flush(async () => { throw new Error('x'); })).toBe(0);
    expect(q.pending).toHaveLength(1);
  });

  it('le cache embarqué couvre menus USSD et écrans', () => {
    const c = TranslationCache.bundled();
    expect(c.get('fub', 'menu.header')?.charset).toBe('gsm7');
    expect(Object.keys(c.uiStrings('en')).length).toBeGreaterThan(20);
  });
});
