import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gsm7Length, isGsm7, toGsm7 } from '@nkap/core';
import { SAFINUM_INTENTS, officialFee, officialTotal, type InboundTurn, type UssdReply } from '@nkap/safinum';
import {
  Gateway,
  detectLanguage,
  DEMO_TEAM_KEY,
  InMemorySessions,
  createDemoServer,
  createMiddlewareServer,
  type BankPort,
  type DemoCall,
} from '../src/index.js';

const SAMPLES = path.join(process.cwd(), 'apps/gateway/samples');
const PHONE = '237699000003';
const OTHER = '237690000002';

function sample(name: string): InboundTurn {
  return JSON.parse(fs.readFileSync(path.join(SAMPLES, name), 'utf8')) as InboundTurn;
}

function turn(overrides: Partial<InboundTurn>): InboundTurn {
  return {
    trace_id: 'trace-test',
    team_id: 'nkaplingua',
    channel: 'ussd',
    session_id: 'session-test',
    phone: PHONE,
    language: null,
    input: { type: 'menu', text: '' },
    constraints: { max_chars: 182, charset: 'gsm7', mode: 'menu', timeout_ms: 3000 },
    ...overrides,
  };
}

/** Vérifie ce que la sandbox vérifierait : intention officielle, statut connu, GSM-7 et 182 septets. */
function assertContract(reply: UssdReply): void {
  expect(SAFINUM_INTENTS).toContain(reply.interpretation.intent);
  // Mode contrat (défaut) : seules les valeurs observées sur la sandbox sortent (SANDBOX-SAFINUM §8).
  expect(['none', 'pending']).toContain(reply.transaction.status);
  expect(typeof reply.response.text).toBe('string');
  expect(reply.response.text.length).toBeGreaterThan(0);
  expect(isGsm7(reply.response.text)).toBe(true);
  expect(gsm7Length(reply.response.text)).toBeLessThanOrEqual(182);
  expect(isGsm7(reply.response.options.join(''))).toBe(true);
  expect(['fr', 'en', 'fub']).toContain(reply.interpretation.language);
}

describe('banque de démonstration et middleware (chaîne HTTP réelle)', () => {
  let bankUrl = '';
  let demo: ReturnType<typeof createDemoServer>;
  let gateway: Gateway;
  const calls: DemoCall[] = [];

  beforeAll(async () => {
    demo = createDemoServer({ onCall: (call) => calls.push(call) });
    await new Promise<void>((resolve) => demo.server.listen(0, '127.0.0.1', resolve));
    const address = demo.server.address() as AddressInfo;
    bankUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => demo.server.close(() => resolve()));
  });

  beforeEach(() => {
    demo.bank.reset();
    calls.length = 0;
    gateway = new Gateway({ teamKey: DEMO_TEAM_KEY, bankUrl, sessions: new InMemorySessions() });
  });

  it('sert le menu du kit officiel sans erreur de contrat', async () => {
    const reply = (await gateway.handle(sample('ussd-1-menu.json'))) as UssdReply;
    assertContract(reply);
    expect(reply.interpretation.intent).toBe('UNKNOWN');
    expect(reply.response.end_session).toBe(false);
    expect(reply.response.text).toContain('1. Mon solde');
  });

  it('répond au solde depuis GET /accounts et recopie X-Team-Key et X-Trace-Id', async () => {
    const reply = (await gateway.handle(sample('ussd-2-solde.json'))) as UssdReply;
    assertContract(reply);
    expect(reply.interpretation.intent).toBe('BALANCE_INQUIRY');
    expect(reply.response.text).toContain('250 000 FCFA');
    expect(reply.response.end_session).toBe(true);

    const accountCall = calls.find((call) => call.path.includes('/accounts/'));
    expect(accountCall?.traceId).toBe('essai-local-0002');
    expect(accountCall?.teamKey).toBe(DEMO_TEAM_KEY);
  });

  it('n’affiche jamais une erreur bancaire brute quand la clé est refusée', async () => {
    const wrongKey = new Gateway({ teamKey: 'sbx_fausse_cle', bankUrl, sessions: new InMemorySessions() });
    const reply = (await wrongKey.handle(sample('ussd-2-solde.json'))) as UssdReply;
    assertContract(reply);
    expect(reply.response.text).toContain('indisponible');
    expect(reply.response.text).not.toContain('UNAUTHORIZED');
  });

  it('crée la transaction en pending, puis la confirme dans un tour séparé', async () => {
    const session = 'session-transfert';

    await gateway.handle(turn({ session_id: session, input: { type: 'menu', text: '2' } }));
    const target = (await gateway.handle(
      turn({ session_id: session, trace_id: 'trace-2', input: { type: 'menu', text: OTHER } }),
    )) as UssdReply;
    assertContract(target);
    expect(target.interpretation.intent).toBe('CLARIFICATION_NEEDED');

    const summary = (await gateway.handle(
      turn({ session_id: session, trace_id: 'trace-3', input: { type: 'menu', text: '5 000' } }),
    )) as UssdReply;
    assertContract(summary);
    expect(summary.interpretation.intent).toBe('TRANSFER');
    expect(summary.transaction.status).toBe('pending');
    expect(summary.transaction.id).toMatch(/^MBP/);
    expect(summary.interpretation.parameters).toMatchObject({ amount: 5000, fee: 50, total: 5050 });

    const createdCall = calls.find((call) => call.method === 'POST' && call.path.endsWith('/transactions'));
    expect(createdCall?.traceId).toBe('trace-3');

    const confirmed = (await gateway.handle(
      turn({ session_id: session, trace_id: 'trace-4', input: { type: 'menu', text: '1' } }),
    )) as UssdReply;
    assertContract(confirmed);
    expect(confirmed.interpretation.intent).toBe('CONFIRM');
    // §8 : exécutée = `pending` + id de la transaction confirmée.
    expect(confirmed.transaction).toEqual({ id: summary.transaction.id, status: 'pending' });
    expect(confirmed.response.text).toContain('244 950 FCFA');

    const confirmCall = calls.find((call) => call.path.endsWith('/confirm'));
    expect(confirmCall?.traceId).toBe('trace-4');
    // Deux tours différents, deux traces différentes : règle du jury respectée.
    expect(confirmCall?.traceId).not.toBe(createdCall?.traceId);
  });

  it('annule une opération en attente sans débiter', async () => {
    const session = 'session-annulation';
    await gateway.handle(turn({ session_id: session, input: { type: 'menu', text: '2' } }));
    await gateway.handle(turn({ session_id: session, input: { type: 'menu', text: OTHER } }));
    await gateway.handle(turn({ session_id: session, input: { type: 'menu', text: '2000' } }));

    const cancelled = (await gateway.handle(
      turn({ session_id: session, trace_id: 'trace-annule', input: { type: 'menu', text: '2' } }),
    )) as UssdReply;
    assertContract(cancelled);
    expect(cancelled.interpretation.intent).toBe('CANCEL');
    expect(cancelled.transaction.status).toBe('none');
    expect(cancelled.transaction.id).toMatch(/^MBP/);

    const balance = (await gateway.handle(turn({ input: { type: 'menu', text: '1' } }))) as UssdReply;
    expect(balance.response.text).toContain('250 000 FCFA');
  });

  it('corrige le montant d’une transaction en attente (CORRECTION)', async () => {
    const session = 'session-correction';
    await gateway.handle(turn({ session_id: session, input: { type: 'menu', text: '2' } }));
    await gateway.handle(turn({ session_id: session, input: { type: 'menu', text: OTHER } }));
    await gateway.handle(turn({ session_id: session, input: { type: 'menu', text: '5000' } }));

    const corrected = (await gateway.handle(
      turn({ session_id: session, trace_id: 'trace-correction', input: { type: 'menu', text: '3' } }),
    )) as UssdReply;
    expect(corrected.interpretation.intent).toBe('CORRECTION');
    expect(corrected.transaction.status).toBe('pending');

    const updated = (await gateway.handle(
      turn({ session_id: session, trace_id: 'trace-correction-2', input: { type: 'menu', text: '20000' } }),
    )) as UssdReply;
    assertContract(updated);
    expect(updated.interpretation.intent).toBe('CORRECTION');
    expect(updated.interpretation.parameters).toMatchObject({ amount: 20000, fee: 150, total: 20150 });
    expect(calls.some((call) => call.path.endsWith('/update'))).toBe(true);
  });

  it('demande une clarification plutôt que de choisir un homonyme', async () => {
    const session = 'session-homonymes';
    await gateway.handle(turn({ session_id: session, input: { type: 'menu', text: '2' } }));
    const reply = (await gateway.handle(
      turn({ session_id: session, input: { type: 'menu', text: 'a' } }),
    )) as UssdReply;
    assertContract(reply);
    expect(reply.interpretation.intent).toBe('CLARIFICATION_NEEDED');
    expect(reply.response.options.length).toBeGreaterThan(1);
  });

  it('répond aux frais avec GET /fees (25 000 → 150)', async () => {
    const session = 'session-frais';
    await gateway.handle(turn({ session_id: session, input: { type: 'menu', text: '3' } }));
    const reply = (await gateway.handle(
      turn({ session_id: session, trace_id: 'trace-frais', input: { type: 'menu', text: '25000' } }),
    )) as UssdReply;
    assertContract(reply);
    expect(reply.interpretation.intent).toBe('FEE_INQUIRY');
    expect(reply.response.text).toContain('150 FCFA');
    expect(reply.response.text).toContain('25 150 FCFA');
    expect(calls.some((call) => call.path.includes('/fees'))).toBe(true);
  });

  it('achète du crédit et paie une facture avec les intentions officielles', async () => {
    const airtimeSession = 'session-credit';
    await gateway.handle(turn({ session_id: airtimeSession, input: { type: 'menu', text: '5' } }));
    await gateway.handle(turn({ session_id: airtimeSession, input: { type: 'menu', text: '1' } }));
    const airtime = (await gateway.handle(
      turn({ session_id: airtimeSession, trace_id: 'trace-credit', input: { type: 'menu', text: '1000' } }),
    )) as UssdReply;
    assertContract(airtime);
    expect(airtime.interpretation.intent).toBe('AIRTIME_PURCHASE');
    expect(airtime.interpretation.parameters).toMatchObject({ amount: 1000, fee: 0, total: 1000 });

    const billSession = 'session-facture';
    await gateway.handle(turn({ session_id: billSession, input: { type: 'menu', text: '6' } }));
    await gateway.handle(turn({ session_id: billSession, input: { type: 'menu', text: '1' } }));
    await gateway.handle(turn({ session_id: billSession, input: { type: 'menu', text: '123456789' } }));
    const bill = (await gateway.handle(
      turn({ session_id: billSession, trace_id: 'trace-facture', input: { type: 'menu', text: '10000' } }),
    )) as UssdReply;
    assertContract(bill);
    expect(bill.interpretation.intent).toBe('BILL_PAYMENT');
    expect(bill.interpretation.parameters).toMatchObject({ amount: 10000, fee: 100, total: 10100 });
    expect(bill.interpretation.parameters.biller).toBe('ENEO');
  });

  it('bascule en fulfulde et reste en GSM-7 (translittération ɓ ɗ ŋ ƴ)', async () => {
    const session = 'session-fulfulde';
    await gateway.handle(turn({ session_id: session, language: 'fub', input: { type: 'menu', text: '' } }));
    const reply = (await gateway.handle(
      turn({ session_id: session, language: 'fub', input: { type: 'menu', text: '1' } }),
    )) as UssdReply;
    assertContract(reply);
    expect(reply.interpretation.language).toBe('fub');
    expect(reply.response.text).toContain('Ceede');
    expect(reply.response.text).not.toMatch(/[ɓɗŋƴɛɔə]/);
  });

  it('traduit l’écran d’accueil du kit officiel en anglais', async () => {
    const reply = (await gateway.handle(sample('ui-accueil-en.json'))) as { language: string; strings: Record<string, string> };
    expect(reply.language).toBe('en');
    expect(Object.keys(reply.strings)).toHaveLength(Object.keys(sample('ui-accueil-en.json').strings ?? {}).length);
    expect(reply.strings['nav.home']).toBe('Home');
    expect(reply.strings['shell.greeting']).toBe('Hello {name}');
    expect(reply.strings['tx.status.confirmed']).toBe('Completed');
  });

  it('traduit le même écran en fulfulde, emplacements et max_chars respectés', async () => {
    const payload = { ...sample('ui-accueil-en.json'), language: 'fub' };
    const reply = (await gateway.handle(payload)) as { language: string; strings: Record<string, string> };
    expect(reply.language).toBe('fub');
    expect(reply.strings['home.balance_label']).toBe('Ceede keddiiɗe');
    expect(reply.strings['shell.greeting']).toBe('A jaɓɓaama {name}');
    expect((reply.strings['nav.history'] ?? '').length).toBeLessThanOrEqual(12);
  });

  it('replie tout l’écran en français plutôt que de mélanger deux langues', async () => {
    const payload = { ...sample('ui-accueil-en.json'), language: 'dua' };
    const reply = (await gateway.handle(payload)) as { language: string; strings: Record<string, string> };
    expect(reply.language).toBe('fr');
    expect(reply.strings['nav.home']).toBe('Accueil');
    expect(reply.strings['shell.greeting']).toBe('Bonjour {name}');
  });

  it('expose le contrat par HTTP sur /middleware/ussd', async () => {
    const server = createMiddlewareServer({
      teamKey: DEMO_TEAM_KEY,
      bankUrl,
      log: () => undefined,
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;

    try {
      const health = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ ok: true, teamKeyConfigured: true });

      const response = await fetch(`http://127.0.0.1:${address.port}/middleware/ussd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Trace-Id': 'trace-http' },
        body: JSON.stringify({ ...sample('ussd-2-solde.json'), channel: 'ussd' }),
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as UssdReply;
      assertContract(body);
      expect(body.interpretation.intent).toBe('BALANCE_INQUIRY');
      expect(calls.some((call) => call.traceId === 'essai-local-0002')).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('accepte un port injecté pour les tests', async () => {
    const fake: BankPort = {
      account: async () => ({ ok: true, status: 200, data: { phone: PHONE, holder: 'Test', balance: 1000, currency: 'XAF' } }),
      fees: async () => ({ ok: true, status: 200, data: { amount: 0, fee: 0, total: 0, currency: 'XAF' } }),
      history: async () => ({ ok: true, status: 200, data: [] }),
      beneficiaries: async () => ({ ok: true, status: 200, data: [] }),
      billers: async () => ({ ok: true, status: 200, data: [] }),
      create: async () => ({ ok: false, status: 500, error: 'BANK_ERROR' }),
      update: async () => ({ ok: false, status: 500, error: 'BANK_ERROR' }),
      confirm: async () => ({ ok: false, status: 500, error: 'BANK_ERROR' }),
      cancel: async () => ({ ok: false, status: 500, error: 'BANK_ERROR' }),
    };
    const local = new Gateway({ teamKey: 'sbx_test', bankUrl, sessions: new InMemorySessions(), bankFactory: () => fake });
    const reply = (await local.handle(turn({ input: { type: 'menu', text: '1' } }))) as UssdReply;
    expect(reply.response.text).toContain('1 000 FCFA');
  });
});

describe('règles de la sandbox', () => {
  it('applique la grille officielle des frais', () => {
    expect(officialFee('transfer', 5_000)).toBe(50);
    expect(officialFee('transfer', 5_001)).toBe(150);
    expect(officialFee('transfer', 25_000)).toBe(150);
    expect(officialFee('transfer', 25_001)).toBe(400);
    expect(officialFee('transfer', 100_000)).toBe(400);
    expect(officialFee('transfer', 100_001)).toBe(1_000);
    expect(officialFee('transfer', 500_000)).toBe(5_000);
    expect(officialFee('airtime', 10_000)).toBe(0);
    expect(officialFee('bill', 10_000)).toBe(100);
    expect(officialFee('transfer', 500_001)).toBeNull();
    expect(officialTotal('transfer', 5_000)).toBe(5_050);
    expect(officialTotal('transfer', 500_000)).toBe(505_000);
  });

  it('translittère et compte en septets', () => {
    expect(toGsm7('Ceede ɓennuɗe ŋaaƴi')).toBe('Ceede bennude ngaayi');
    expect(toGsm7('« 5 000 FCFA » …')).toBe('" 5 000 FCFA " ...');
    expect(gsm7Length('€')).toBe(2);
    expect(gsm7Length('Ceede')).toBe(5);
    expect(isGsm7(toGsm7('A jaɓɓaama'))).toBe(true);
    expect(isGsm7('A jaɓɓaama')).toBe(false);
  });

  it('détecte le fulfulde, l’anglais, et ne devine pas les langues sans lexique', () => {
    expect(detectLanguage('Mi yiɗi anndude ceede am keddiiɗe').language).toBe('fub');
    expect(detectLanguage('What is my balance?').language).toBe('en');
    expect(detectLanguage('Quel est mon solde ?').language).toBe('fr');
    expect(detectLanguage('2').confidence).toBe(0);
    // Pas de lexique fiable pour dua, ewo, bas, bbj, byv : on ne devine pas.
    expect(detectLanguage('Mbolo, na banga njangi').confidence).toBe(0);
  });

  it('respecte 182 septets avec les options comprises', async () => {
    const reply = (await new Gateway({ teamKey: 'sbx_x', bankUrl: 'http://127.0.0.1:1', sessions: new InMemorySessions() }).handle(
      turn({ language: 'fub', input: { type: 'menu', text: '' } }),
    )) as UssdReply;
    expect(gsm7Length(reply.response.text)).toBeLessThanOrEqual(182);
    expect(reply.response.text).toContain('8. Demngal');
  });
});

describe('language: null — la détection revient au middleware', () => {
  const fake: BankPort = {
    account: async () => ({ ok: true, status: 200, data: { phone: PHONE, holder: 'Amina', balance: 1000, currency: 'XAF' } }),
    fees: async () => ({ ok: true, status: 200, data: { amount: 0, fee: 0, total: 0, currency: 'XAF' } }),
    history: async () => ({ ok: true, status: 200, data: [] }),
    beneficiaries: async () => ({ ok: true, status: 200, data: [] }),
    billers: async () => ({ ok: true, status: 200, data: [] }),
    create: async () => ({ ok: false, status: 500, error: 'BANK_ERROR' }),
    update: async () => ({ ok: false, status: 500, error: 'BANK_ERROR' }),
    confirm: async () => ({ ok: false, status: 500, error: 'BANK_ERROR' }),
    cancel: async () => ({ ok: false, status: 500, error: 'BANK_ERROR' }),
  };
  const local = () =>
    new Gateway({ teamKey: 'sbx_test', bankUrl: 'http://127.0.0.1:1', sessions: new InMemorySessions(), bankFactory: () => fake });

  it('reconnaît le fulfulde, comprend la demande et répond dans cette langue', async () => {
    const reply = (await local().handle(
      turn({ session_id: 'detect-fub', language: null, input: { type: 'text', text: 'Mi yiɗi anndude ceede am keddiiɗe' } }),
    )) as UssdReply;
    assertContract(reply);
    expect(reply.interpretation).toMatchObject({ language: 'fub', intent: 'BALANCE_INQUIRY' });
    // ɗ → d au rendu GSM-7 : « keddiiɗe » s'affiche « keddiide ».
    expect(reply.response.text).toContain('Ceede maa keddiide: 1 000 FCFA.');
    // Le solde clôt la session USSD : rien n'est gardé pour le tour suivant.
    expect(reply.response.end_session).toBe(true);
  });

  it('reconnaît l’anglais', async () => {
    const reply = (await local().handle(
      turn({ language: null, input: { type: 'text', text: 'What is my balance?' } }),
    )) as UssdReply;
    expect(reply.interpretation.language).toBe('en');
    expect(reply.interpretation.intent).toBe('BALANCE_INQUIRY');
    expect(reply.response.text).toContain('Your balance is 1 000 FCFA.');
  });

  it('reste en français sans indice, et une langue explicite gagne toujours', async () => {
    const gateway = local();
    const neutral = (await gateway.handle(turn({ language: null, input: { type: 'text', text: '2' } }))) as UssdReply;
    expect(neutral.interpretation.language).toBe('fr');

    const explicit = (await local().handle(
      turn({ language: 'en', input: { type: 'text', text: 'Mi yiɗi ceede am' } }),
    )) as UssdReply;
    expect(explicit.interpretation.language).toBe('en');
  });

  it('le choix du menu 8 prime sur la détection suivante', async () => {
    const gateway = local();
    const session = 'detect-pin';
    await gateway.handle(turn({ session_id: session, input: { type: 'text', text: '8' } }));
    const chosen = (await gateway.handle(
      turn({ session_id: session, input: { type: 'text', text: '3' } }),
    )) as UssdReply;
    expect(chosen.interpretation.intent).toBe('LANGUAGE_SWITCH');
    expect(chosen.interpretation.language).toBe('fub');

    const balance = (await gateway.handle(
      turn({ session_id: session, language: null, input: { type: 'text', text: '1' } }),
    )) as UssdReply;
    expect(balance.interpretation.language).toBe('fub');
  });
});

describe('texte libre sur USSD : compris par le moteur partagé', () => {
  let bankUrl = '';
  let demo: ReturnType<typeof createDemoServer>;
  const calls: DemoCall[] = [];

  beforeAll(async () => {
    demo = createDemoServer({ onCall: (call) => calls.push(call) });
    await new Promise<void>((resolve) => demo.server.listen(0, '127.0.0.1', resolve));
    bankUrl = `http://127.0.0.1:${(demo.server.address() as AddressInfo).port}/api/v1`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => demo.server.close(() => resolve()));
  });

  beforeEach(() => {
    demo.bank.reset();
    calls.length = 0;
  });

  it('« Neldu ujineere jowi ka Aicha » : bénéficiaire et montant en une phrase, confirmation au tour suivant', async () => {
    const gateway = new Gateway({ teamKey: DEMO_TEAM_KEY, bankUrl, sessions: new InMemorySessions() });
    const session = 'libre-fub';
    const summary = (await gateway.handle(
      turn({ session_id: session, trace_id: 'libre-1', input: { type: 'text', text: 'Neldu ujineere jowi ka Aicha' } }),
    )) as UssdReply;
    assertContract(summary);
    expect(summary.interpretation).toMatchObject({ intent: 'TRANSFER', language: 'fub' });
    expect(summary.interpretation.parameters).toMatchObject({ amount: 5000, fee: 50, total: 5050, beneficiary_phone: '690000002' });
    expect(summary.transaction.status).toBe('pending');
    expect(calls.some((c) => c.path.includes('/beneficiaries') && c.traceId === 'libre-1')).toBe(true);
    // Un écran = une langue : les options suivent la langue de la réponse.
    expect(summary.response.options).toEqual(['Tabbitin', 'Haaytu', 'Waylu']);

    const done = (await gateway.handle(turn({ session_id: session, trace_id: 'libre-2', input: { type: 'text', text: '1' } }))) as UssdReply;
    expect(done.interpretation.intent).toBe('CONFIRM');
    expect(calls.find((c) => c.path.endsWith('/confirm'))?.traceId).toBe('libre-2');
  });

  it('montant sans bénéficiaire : on demande, sans deviner, et le jury voit le montant extrait', async () => {
    const gateway = new Gateway({ teamKey: DEMO_TEAM_KEY, bankUrl, sessions: new InMemorySessions() });
    const reply = (await gateway.handle(turn({ session_id: 'libre-2', input: { type: 'text', text: 'Envoie 3000' } }))) as UssdReply;
    assertContract(reply);
    expect(reply.interpretation.intent).toBe('CLARIFICATION_NEEDED');
    expect(reply.interpretation.parameters).toMatchObject({ amount: 3000, currency: 'XAF' });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('une saisie incomprise renvoie le menu, jamais une intention inventée', async () => {
    const gateway = new Gateway({ teamKey: DEMO_TEAM_KEY, bankUrl, sessions: new InMemorySessions() });
    const reply = (await gateway.handle(turn({ session_id: 'libre-3', input: { type: 'text', text: 'blabla' } }))) as UssdReply;
    assertContract(reply);
    expect(reply.interpretation.intent).toBe('CLARIFICATION_NEEDED');
    expect(reply.response.text).toContain('1. ');
  });

  it('choix de langue invalide : on reste sur la question de langue', async () => {
    const gateway = new Gateway({ teamKey: DEMO_TEAM_KEY, bankUrl, sessions: new InMemorySessions() });
    const session = 'libre-langue';
    await gateway.handle(turn({ session_id: session, input: { type: 'menu', text: '8' } }));
    await gateway.handle(turn({ session_id: session, input: { type: 'menu', text: '9' } }));
    const chosen = (await gateway.handle(turn({ session_id: session, input: { type: 'menu', text: '2' } }))) as UssdReply;
    expect(chosen.interpretation).toMatchObject({ intent: 'LANGUAGE_SWITCH', language: 'en' });
  });

  it('mode `lifecycle` : le cycle bancaire brut, à n’activer qu’après validation sur la sandbox', async () => {
    const gateway = new Gateway({ teamKey: DEMO_TEAM_KEY, bankUrl, sessions: new InMemorySessions(), statusMode: 'lifecycle' });
    const session = 'libre-cycle';
    await gateway.handle(turn({ session_id: session, input: { type: 'text', text: 'Neldu ujineere jowi ka Aicha' } }));
    const done = (await gateway.handle(turn({ session_id: session, input: { type: 'text', text: '1' } }))) as UssdReply;
    expect(done.transaction.status).toBe('confirmed');
  });

  it('choix du crédit : la liste traduite n’apparaît qu’une fois', async () => {
    const gateway = new Gateway({ teamKey: DEMO_TEAM_KEY, bankUrl, sessions: new InMemorySessions() });
    const reply = (await gateway.handle(turn({ session_id: 'libre-credit', language: 'en', input: { type: 'menu', text: '5' } }))) as UssdReply;
    assertContract(reply);
    expect(reply.response.text.match(/My number/g)).toHaveLength(1);
    expect(reply.response.text).not.toContain('Mon numero');
  });
});
