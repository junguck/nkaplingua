import type { Server } from 'node:http';
import { Agent } from 'undici';
import type { FastifyInstance } from 'fastify';
import type { Language, TurnResponse } from '@nkap/lingua-core';
import { buildApp, type AppDeps } from '../src/app.ts';
import { BankClient } from '../src/bank/client.ts';
import { FakeBank, startFakeBankServer } from '../src/bank/fake.ts';
import { Catalog } from '../src/i18n/catalog.ts';
import { seedRecords } from '../src/i18n/sync.ts';
import { MemoryRateLimiter } from '../src/security/guard.ts';
import { MemorySessionStore } from '../src/session/store.ts';
import { Lexicon, SEED_LEXICON } from '../src/understand.ts';

export interface Harness {
  readonly app: FastifyInstance;
  readonly bank: FakeBank;
  readonly catalog: Catalog;
  turn(body: Partial<TurnBody>, headers?: Record<string, string>): Promise<TurnResponse>;
  close(): Promise<void>;
}

export interface TurnBody {
  trace_id: string;
  channel: 'ussd' | 'sms' | 'ivr';
  session_id: string;
  phone: string;
  language: Language | null;
  input: { type: string; text: string };
  bank_api?: { base_url: string };
}

let traceSeq = 0;

export async function harness(overrides: Partial<AppDeps> = {}): Promise<Harness> {
  const bank = new FakeBank();
  const server: Server = await startFakeBankServer(bank, 0);
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('adresse de la banque simulée inattendue');
  const port = address.port;
  const dispatcher = new Agent({ keepAliveTimeout: 60_000 });
  const catalog = Catalog.from(seedRecords());
  const app = buildApp({
    bank: new BankClient({ baseUrl: `http://127.0.0.1:${port}/api/v1`, teamKey: 'sbx_test_key_0001', dispatcher }),
    catalog,
    lexicon: new Lexicon(SEED_LEXICON),
    sessions: new MemorySessionStore(),
    rateLimiter: new MemoryRateLimiter(1000),
    references: { see: () => undefined },
    audio: { get: async () => null, has: () => false },
    hookSecret: null,
    allowedBankOrigins: [`http://127.0.0.1:${port}`],
    publicBaseUrl: null,
    catalogSource: 'seed',
    logger: false,
    ...overrides,
  });

  return {
    app,
    bank,
    catalog,
    async turn(body, headers = {}) {
      traceSeq += 1;
      const payload: TurnBody = {
        trace_id: `t-${traceSeq}`,
        channel: 'ussd',
        session_id: 's-1',
        phone: '237699000001',
        language: null,
        input: { type: 'text', text: '' },
        ...body,
      };
      const res = await app.inject({ method: 'POST', url: '/', payload, headers: { 'x-trace-id': payload.trace_id, ...headers } });
      if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}: ${res.body}`);
      return res.json<TurnResponse>();
    },
    async close() {
      await app.close();
      await dispatcher.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export const say = (text: string): { input: { type: string; text: string } } => ({ input: { type: 'text', text } });
