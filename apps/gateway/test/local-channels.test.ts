import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEMO_TEAM_KEY,
  Gateway,
  InMemorySessions,
  TtlStore,
  createDemoServer,
  createMiddlewareServer,
  handleAtm,
  handleIvr,
  notesFor,
  type AtmReply,
  type AtmState,
  type DemoCall,
  type IvrReply,
  type IvrState,
} from '../src/index.js';

const PHONE = '237699000003';
const OTHER = '237690000002';

describe('IVR DTMF (canal local)', () => {
  let demo: ReturnType<typeof createDemoServer>;
  let ivr: (turn: Parameters<typeof handleIvr>[0]) => Promise<IvrReply>;
  const calls: DemoCall[] = [];

  beforeAll(async () => {
    demo = createDemoServer({ onCall: (call) => calls.push(call) });
    await new Promise<void>((resolve) => demo.server.listen(0, '127.0.0.1', resolve));
    const address = demo.server.address() as AddressInfo;
    const bankUrl = `http://127.0.0.1:${address.port}/api/v1`;
    const { SafinumBank } = await import('../src/bank.js');
    const sessions = new TtlStore<IvrState>();
    const bank = new SafinumBank({ baseUrl: bankUrl, teamKey: DEMO_TEAM_KEY, traceId: 'trace-ivr' });
    ivr = (turn) => handleIvr(turn, { bank, sessions });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => demo.server.close(() => resolve()));
  });

  beforeEach(() => {
    demo.bank.reset();
    calls.length = 0;
  });

  it('ouvre l’appel sur le menu DTMF', async () => {
    const reply = await ivr({ call_id: 'appel-1', phone: PHONE, input: { digits: '' } });
    expect(reply.channel).toBe('ivr');
    expect(reply.gather).toMatchObject({ type: 'menu', terminator: '#', cancel: '*' });
    expect(reply.say).toContain('1. Solde');
    expect(reply.end).toBe(false);
  });

  it('lit le solde et raccroche', async () => {
    const reply = await ivr({ call_id: 'appel-2', phone: PHONE, input: { digits: '1#' } });
    expect(reply.say).toContain('250 000 FCFA');
    expect(reply.gather).toBeNull();
    expect(reply.end).toBe(true);
  });

  it('crée puis confirme le transfert dans deux tours séparés', async () => {
    await ivr({ call_id: 'appel-3', phone: PHONE, input: { digits: '2' } });
    const target = await ivr({ call_id: 'appel-3', phone: PHONE, input: { digits: `${OTHER}#` } });
    expect(target.gather).toMatchObject({ type: 'amount' });

    const recap = await ivr({ call_id: 'appel-3', phone: PHONE, input: { digits: '5000#' } });
    expect(recap.state.pending_id).toMatch(/^MBP/);
    expect(recap.say).toContain('5 050 FCFA');
    expect(recap.gather).toMatchObject({ type: 'confirm' });

    const done = await ivr({ call_id: 'appel-3', phone: PHONE, input: { digits: '1#' } });
    expect(done.say).toContain('244 950 FCFA');
    expect(done.end).toBe(true);
    expect(calls.some((call) => call.path.endsWith('/confirm'))).toBe(true);
  });

  it('annule avec * et ne laisse rien en attente', async () => {
    await ivr({ call_id: 'appel-4', phone: PHONE, input: { digits: '2' } });
    await ivr({ call_id: 'appel-4', phone: PHONE, input: { digits: OTHER } });
    await ivr({ call_id: 'appel-4', phone: PHONE, input: { digits: '5000#' } });

    const cancelled = await ivr({ call_id: 'appel-4', phone: PHONE, input: { digits: '*' } });
    expect(cancelled.say).toContain('annulee');
    expect(cancelled.state.pending_id).toBeUndefined();

    const balance = await ivr({ call_id: 'appel-5', phone: PHONE, input: { digits: '1' } });
    expect(balance.say).toContain('250 000 FCFA');
  });

  it('parle fulfulde quand l’appel le demande', async () => {
    const reply = await ivr({ call_id: 'appel-6', phone: PHONE, language: 'fub', input: { digits: '' } });
    expect(reply.language).toBe('fub');
    expect(reply.say).toContain('Ceede');
  });
});

describe('ATM (canal local)', () => {
  let demo: ReturnType<typeof createDemoServer>;
  let atm: (turn: Parameters<typeof handleAtm>[0]) => Promise<AtmReply>;

  beforeAll(async () => {
    demo = createDemoServer();
    await new Promise<void>((resolve) => demo.server.listen(0, '127.0.0.1', resolve));
    const address = demo.server.address() as AddressInfo;
    const { SafinumBank } = await import('../src/bank.js');
    const sessions = new TtlStore<AtmState>();
    const bank = new SafinumBank({
      baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
      teamKey: DEMO_TEAM_KEY,
      traceId: 'trace-atm',
    });
    atm = (turn) => handleAtm(turn, { bank, sessions });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => demo.server.close(() => resolve()));
  });

  beforeEach(() => demo.bank.reset());

  it('demande la carte puis le code, et accueille le porteur', async () => {
    const askCard = await atm({ session_id: 'dab-1', input: { digits: '' } });
    expect(askCard.screen).toContain('carte');
    expect(askCard.gather).toMatchObject({ type: 'card' });

    const askPin = await atm({ session_id: 'dab-1', card: PHONE, input: { digits: '' } });
    expect(askPin.gather).toMatchObject({ type: 'pin', digits: [4, 4] });

    const welcome = await atm({ session_id: 'dab-1', input: { digits: '1234#' } });
    expect(welcome.screen).toContain('Bienvenue');
    expect(welcome.screen).toContain('1. Retrait');
  });

  it('retire un multiple de 5 000 avec frais et coupures', async () => {
    await atm({ session_id: 'dab-2', card: PHONE, input: { digits: '' } });
    await atm({ session_id: 'dab-2', input: { digits: '1234#' } });
    await atm({ session_id: 'dab-2', input: { digits: '1' } });

    const receipt = await atm({ session_id: 'dab-2', input: { digits: '25000#' } });
    expect(receipt.receipt).toMatchObject({
      kind: 'withdrawal',
      amount: 25_000,
      fee: 150,
      total: 25_150,
      notes: [10_000, 10_000, 5_000],
      simulated: true,
    });
    expect(receipt.simulation).toMatchObject({ localOnly: true, bankRoute: 'none', pinVerified: false });
    expect(receipt.end).toBe(true);
  });

  it('refuse un montant qui n’est pas un multiple de 5 000', async () => {
    await atm({ session_id: 'dab-3', card: PHONE, input: { digits: '' } });
    await atm({ session_id: 'dab-3', input: { digits: '1234#' } });
    await atm({ session_id: 'dab-3', input: { digits: '1' } });

    const refused = await atm({ session_id: 'dab-3', input: { digits: '12000#' } });
    expect(refused.receipt).toBeUndefined();
    expect(refused.screen).toContain('multiple de 5 000');
    expect(refused.gather).toMatchObject({ type: 'amount' });
  });

  it('refuse un retrait au-delà du solde, frais compris', async () => {
    const poor = '237677000001'; // 12 000 FCFA
    await atm({ session_id: 'dab-4', card: poor, input: { digits: '' } });
    await atm({ session_id: 'dab-4', input: { digits: '1234#' } });
    await atm({ session_id: 'dab-4', input: { digits: '1' } });

    const refused = await atm({ session_id: 'dab-4', input: { digits: '15000' } });
    expect(refused.receipt).toBeUndefined();
    expect(refused.screen).toContain('insuffisant');
    expect(refused.end).toBe(true);
  });

  it('imprime le solde en reçu', async () => {
    await atm({ session_id: 'dab-5', card: PHONE, input: { digits: '' } });
    await atm({ session_id: 'dab-5', input: { digits: '1234#' } });
    const balance = await atm({ session_id: 'dab-5', input: { digits: '2' } });
    expect(balance.receipt).toEqual({ kind: 'balance', balance: 250_000 });
    expect(balance.end).toBe(true);
  });

  it('décompose les coupures en 10 000 et 5 000', () => {
    expect(notesFor(5_000)).toEqual([5_000]);
    expect(notesFor(15_000)).toEqual([10_000, 5_000]);
    expect(notesFor(100_000)).toEqual(Array(10).fill(10_000));
  });
});

describe('surface HTTP des canaux locaux', () => {
  it('reste fermée par défaut et ne répond jamais sur le contrat SAFINUM', async () => {
    const server = createMiddlewareServer({ teamKey: DEMO_TEAM_KEY, bankUrl: 'http://127.0.0.1:1', log: () => undefined });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;

    try {
      const health = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(await health.json()).toMatchObject({ localChannels: [] });

      const closed = await fetch(`http://127.0.0.1:${address.port}/ivr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(closed.status).toBe(404);

      // Même en nommant le canal dans le corps, `/middleware/ussd` ne devient pas un tour ATM.
      const disguised = await fetch(`http://127.0.0.1:${address.port}/middleware/ussd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'atm', phone: PHONE, input: { digits: '2' } }),
      });
      expect(disguised.status).toBe(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('sert /ivr quand ENABLE_V2_CHANNELS=1, sans toucher au gateway SAFINUM', async () => {
    const server = createMiddlewareServer({
      teamKey: DEMO_TEAM_KEY,
      bankUrl: 'http://127.0.0.1:1',
      localChannels: true,
      log: () => undefined,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;

    try {
      const health = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(await health.json()).toMatchObject({ localChannels: ['ivr', 'atm'], channels: ['ussd', 'mobile', 'web'] });

      const reply = await fetch(`http://127.0.0.1:${address.port}/ivr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: 'appel-http', phone: PHONE, input: { digits: '' } }),
      });
      expect(reply.status).toBe(200);
      const body = (await reply.json()) as IvrReply;
      expect(body.channel).toBe('ivr');
      expect(body.say).toContain('1. Solde');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('le gateway SAFINUM ignore toujours les canaux locaux', async () => {
    const gateway = new Gateway({
      teamKey: 'sbx_test',
      bankUrl: 'http://127.0.0.1:1',
      sessions: new InMemorySessions(),
      bankFactory: () => ({
        account: async () => ({ ok: true, status: 200, data: { phone: PHONE, holder: 'Amina', balance: 1_000, currency: 'XAF' } }),
        fees: async () => ({ ok: false, status: 500, error: 'BANK_ERROR' }),
        history: async () => ({ ok: true, status: 200, data: [] }),
        beneficiaries: async () => ({ ok: true, status: 200, data: [] }),
        billers: async () => ({ ok: true, status: 200, data: [] }),
        create: async () => ({ ok: false, status: 500, error: 'BANK_ERROR' }),
        update: async () => ({ ok: false, status: 500, error: 'BANK_ERROR' }),
        confirm: async () => ({ ok: false, status: 500, error: 'BANK_ERROR' }),
        cancel: async () => ({ ok: false, status: 500, error: 'BANK_ERROR' }),
      }),
    });
    const reply = (await gateway.handle({ channel: 'ivr', phone: PHONE, input: { text: '1' } })) as unknown as IvrReply & {
      response?: { text: string };
    };
    // Normalisé en USSD : la sandbox ne voit jamais un tour IVR.
    expect(reply.response?.text).toContain('1 000 FCFA');
  });
});
