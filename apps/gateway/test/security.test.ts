import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_TEAM_KEY, createMiddlewareServer } from '../src/index.js';
import { startDemoServer } from '../src/demo/server.js';
import { RateLimiter, isAllowedBankUrl, routeHook } from '../src/security.js';

const SECRET = 'secret-de-test-assez-long-0001';
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) await closers.pop()?.();
});

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function middleware(extra: { hookSecret?: string; rateLimitPerMinute?: number } = {}): Promise<string> {
  const bank = await startDemoServer(0);
  closers.push(bank.close);
  return listen(createMiddlewareServer({ teamKey: DEMO_TEAM_KEY, bankUrl: bank.url, log: () => undefined, ...extra }));
}

const turn = (text: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({
    trace_id: 'sec',
    channel: 'ussd',
    session_id: `sec-${text}-${Math.random()}`,
    phone: '237699000003',
    language: null,
    input: { type: 'text', text, ussd_text: '' },
    ...extra,
  });

async function post(url: string, body: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  return { status: res.status, json: await res.json() };
}

describe('sécurité du gateway', () => {
  it('URL secrète : seuls les tours sous /hook/<secret> sont servis', async () => {
    const base = await middleware({ hookSecret: SECRET });
    expect((await post(`${base}/`, turn(''))).status).toBe(404);
    expect((await post(`${base}/hook/mauvais-secret`, turn(''))).status).toBe(404);
    expect((await post(`${base}/hook/${SECRET}`, turn(''))).status).toBe(200);
    expect((await post(`${base}/hook/${SECRET}/middleware/ussd`, turn(''))).status).toBe(200);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it('la clé ne part jamais vers un bank_api.base_url forgé', async () => {
    const received: string[] = [];
    const attacker = http.createServer((req, res) => {
      received.push(String(req.headers['x-team-key'] ?? ''));
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"balance":1}');
    });
    const evil = await listen(attacker);
    const base = await middleware();
    const session = 'forge';
    const forged = { session_id: session, bank_api: { base_url: `${evil}/api/v1` } };
    await post(`${base}/`, turn('', forged));
    const reply = await post(`${base}/`, turn('1', forged));
    expect(reply.status).toBe(200);
    expect(JSON.stringify(reply.json)).toContain('FCFA');
    expect(received).toEqual([]);
  });

  it('limite de débit par numéro', async () => {
    const base = await middleware({ rateLimitPerMinute: 2 });
    expect((await post(`${base}/`, turn(''))).status).toBe(200);
    expect((await post(`${base}/`, turn(''))).status).toBe(200);
    expect((await post(`${base}/`, turn(''))).status).toBe(429);
  });

  it('seules la sandbox et la boucle locale peuvent recevoir la clé', () => {
    expect(isAllowedBankUrl('https://safinum.cm/api/v1')).toBe(true);
    expect(isAllowedBankUrl('http://127.0.0.1:8788/api/v1')).toBe(true);
    expect(isAllowedBankUrl('https://safinum.cm.evil.example/api')).toBe(false);
    expect(isAllowedBankUrl('pas une url')).toBe(false);
  });

  it('routage du secret', () => {
    expect(routeHook('/', null)).toEqual({ ok: true, path: '/' });
    expect(routeHook(`/hook/${SECRET}`, SECRET)).toEqual({ ok: true, path: '/' });
    expect(routeHook('/', SECRET)).toEqual({ ok: false });
    const limiter = new RateLimiter(1);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 1)).toBe(false);
    expect(limiter.allow('a', 61_000)).toBe(true);
  });
});
