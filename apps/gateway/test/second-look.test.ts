import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { InboundTurn, UssdReply } from '@nkap/safinum';
import { DEMO_TEAM_KEY, Gateway, InMemorySessions, SecondLook, createDemoServer } from '../src/index.js';

const PHONE = '237699000003';
const OTHER = '237690000002';
const CONTACT_PHONE = '237677000009';

function turn(session: string, text: string, language = 'fr'): InboundTurn {
  return {
    trace_id: `t-${session}-${text}`,
    team_id: 'nkaplingua',
    channel: 'ussd',
    session_id: session,
    phone: PHONE,
    language,
    input: { type: 'menu', text },
    constraints: { max_chars: 182, charset: 'gsm7', mode: 'menu', timeout_ms: 3000 },
  };
}

describe('second regard', () => {
  let demo: ReturnType<typeof createDemoServer>;
  let bankUrl = '';
  let sms: Array<{ to: string; text: string }>;
  let clock: number;
  let gateway: Gateway;
  let secondLook: SecondLook;

  beforeAll(async () => {
    demo = createDemoServer();
    await new Promise<void>((resolve) => demo.server.listen(0, '127.0.0.1', resolve));
    bankUrl = `http://127.0.0.1:${(demo.server.address() as AddressInfo).port}/api/v1`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => demo.server.close(() => resolve()));
  });

  beforeEach(() => {
    demo.bank.reset();
    sms = [];
    clock = 1_000_000;
    secondLook = new SecondLook(
      {
        thresholdXAF: 100_000,
        ttlMs: 10 * 60_000,
        contactFor: (phone) => (phone.endsWith('699000003') ? { name: 'Papa', phone: CONTACT_PHONE, language: 'fr' } : undefined),
      },
      async (to, text) => void sms.push({ to, text }),
      () => clock,
    );
    gateway = new Gateway({ teamKey: DEMO_TEAM_KEY, bankUrl, sessions: new InMemorySessions(), secondLook });
  });

  async function transfer(session: string, amount: string): Promise<UssdReply> {
    await gateway.handle(turn(session, '2'));
    await gateway.handle(turn(session, OTHER));
    await gateway.handle(turn(session, amount));
    return (await gateway.handle(turn(session, '1'))) as UssdReply;
  }

  it('un petit transfert part sans proche', async () => {
    const reply = await transfer('s-petit', '5 000');
    // Exécuté tout de suite : pas de demande au proche. (Statut §8 : `pending` + id, comme toute exécution.)
    expect(reply.interpretation.parameters).not.toHaveProperty('second_look');
    expect(reply.response.text).toMatch(/MBP\d+/);
    expect(sms).toHaveLength(0);
  });

  it('un gros transfert reste en attente, le proche reçoit le résumé sans solde ni code', async () => {
    const reply = await transfer('s-gros', '150 000');
    expect(reply.transaction.status).toBe('pending');
    expect(reply.response.text).toContain('Papa');
    expect(sms).toHaveLength(1);
    expect(sms[0]?.to).toBe(CONTACT_PHONE);
    expect(sms[0]?.text).toContain('150 000');
    expect(sms[0]?.text).toContain('total');
    expect(sms[0]?.text).not.toMatch(/solde|code|pin/i);
  });

  it('« oui » du proche confirme côté banque et prévient l’utilisateur', async () => {
    const reply = await transfer('s-oui', '150 000');
    const id = String(reply.interpretation.parameters.second_look);
    expect(await secondLook.answer(id, '1')).toBe('approved');
    expect(sms.at(-1)?.to).toBe('699000003');
    expect(sms.at(-1)?.text).toContain('Transfert effectue');
    expect(await secondLook.answer(id, '2')).toBe('approved');
  });

  it('« non » annule la transaction', async () => {
    const reply = await transfer('s-non', '150 000');
    const id = String(reply.interpretation.parameters.second_look);
    expect(await secondLook.answer(id, 'non')).toBe('rejected');
    expect(sms.at(-1)?.text).toContain('annule');
  });

  it('sans réponse avant l’expiration, la transaction est annulée', async () => {
    const reply = await transfer('s-exp', '150 000');
    const id = String(reply.interpretation.parameters.second_look);
    clock += 11 * 60_000;
    expect(secondLook.status(id)).toBe('expired');
    expect(await secondLook.sweep()).toBe(1);
    expect(sms.at(-1)?.text).toContain('Pas de reponse');
  });

  it('une réponse incompréhensible laisse la demande ouverte', async () => {
    const reply = await transfer('s-flou', '150 000');
    const id = String(reply.interpretation.parameters.second_look);
    expect(await secondLook.answer(id, 'peut-etre')).toBe('unclear');
    expect(secondLook.status(id)).toBe('pending');
    expect(await secondLook.answer('inconnu', '1')).toBe('unknown');
  });

  it('sans proche désigné, pas de second regard même au-dessus du seuil', async () => {
    const solo = new SecondLook({ thresholdXAF: 100_000, ttlMs: 60_000, contactFor: () => undefined }, async () => undefined);
    const g = new Gateway({ teamKey: DEMO_TEAM_KEY, bankUrl, sessions: new InMemorySessions(), secondLook: solo });
    await g.handle(turn('s-solo', '2'));
    await g.handle(turn('s-solo', OTHER));
    await g.handle(turn('s-solo', '150 000'));
    const reply = (await g.handle(turn('s-solo', '1'))) as UssdReply;
    expect(reply.interpretation.parameters).not.toHaveProperty('second_look');
    expect(reply.response.text).toMatch(/MBP\d+/);
  });

  it('utilisateur en fulfulde : message d’attente sans forme relue → écran entier en français, déclaré `fr`', async () => {
    const session = 's-fub';
    await gateway.handle(turn(session, '2', 'fub'));
    await gateway.handle(turn(session, OTHER, 'fub'));
    await gateway.handle(turn(session, '150 000', 'fub'));
    const reply = (await gateway.handle(turn(session, '1', 'fub'))) as UssdReply;
    expect(reply.interpretation.parameters).toHaveProperty('second_look');
    expect(reply.interpretation.language).toBe('fr');
    expect(reply.response.text).toContain('En attente de Papa');
  });
});
