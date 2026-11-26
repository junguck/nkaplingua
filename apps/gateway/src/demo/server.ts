/**
 * Serveur HTTP de la banque de démonstration.
 *
 * Il expose les mêmes routes que l'API bancaire SAFINUM pour que le middleware puisse être
 * testé sans clé d'équipe : `GET /accounts/{phone}`, `GET /fees`, `POST /transactions`…
 * La clé attendue est `sbx_demo_local` (ou toute valeur de `SAFINUM_TEAM_KEY` fournie).
 *
 *   node dist/demo/server.js      # http://127.0.0.1:8788/api/v1
 */

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { DemoBank, DEMO_BILLERS, digits } from './demo-bank.js';

export const DEMO_TEAM_KEY = 'sbx_demo_local';

export interface DemoCall {
  readonly method: string;
  readonly path: string;
  readonly traceId: string | null;
  readonly teamKey: string | null;
}

export interface DemoServerOptions {
  readonly teamKey?: string;
  /** Observateur de test : vérifie ce que le middleware envoie réellement. */
  readonly onCall?: (call: DemoCall) => void;
}

export function createDemoServer(options: DemoServerOptions = {}): { server: http.Server; bank: DemoBank } {
  const bank = new DemoBank();
  const expectedKey = options.teamKey || process.env.SAFINUM_TEAM_KEY || DEMO_TEAM_KEY;

  const server = http.createServer((req, res) => {
    options.onCall?.({
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      traceId: headerValue(req.headers['x-trace-id']),
      teamKey: headerValue(req.headers['x-team-key']),
    });
    void handle(req, res, bank, expectedKey);
  });

  return { server, bank };
}

function headerValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? (value[0] ?? null) : null;
}

async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bank: DemoBank,
  expectedKey: string,
): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const path = url.pathname.replace(/^\/api\/v1/, '').replace(/\/+$/, '') || '/';

  if (method === 'GET' && path === '/health') return send(res, 200, { ok: true, service: 'demo-safinum-bank' });

  // La vraie API refuse tout appel sans clé : on reproduit le 401 pour tester le middleware.
  if (req.headers['x-team-key'] !== expectedKey) {
    return send(res, 401, { error: 'UNAUTHORIZED', message: 'Cle d equipe absente ou invalide.' });
  }

  let body: Record<string, unknown> = {};
  if (method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return send(res, 400, { error: 'INVALID_REQUEST', message: 'JSON invalide.' });
    }
  }

  const segments = path.split('/').filter((segment) => segment.length > 0);
  const traceId = req.headers['x-trace-id'];

  if (method === 'GET' && segments[0] === 'accounts' && segments[1]) {
    const phone = decodeURIComponent(segments[1]);
    if (segments[2] === 'transactions') {
      return reply(res, await bank.history(phone, Number(url.searchParams.get('limit') ?? 5)), traceId);
    }
    return reply(res, await bank.account(phone), traceId);
  }

  if (method === 'GET' && segments[0] === 'fees') {
    const type = url.searchParams.get('type') ?? 'transfer';
    const amount = Number(url.searchParams.get('amount'));
    return reply(res, await bank.fees(type as 'transfer' | 'airtime' | 'bill', amount), traceId);
  }

  if (method === 'GET' && segments[0] === 'beneficiaries') {
    return reply(res, await bank.beneficiaries(url.searchParams.get('q') ?? ''), traceId);
  }

  if (method === 'GET' && segments[0] === 'billers') {
    const result = await bank.billers();
    if (!result.ok) return reply(res, result, traceId);
    return send(res, 200, { billers: DEMO_BILLERS, operators: result.data.filter((b) => b.kind === 'airtime') });
  }

  if (method === 'POST' && segments[0] === 'transactions') {
    if (segments.length === 1) {
      const amount = Number(body.amount);
      const created = await bank.create({
        type: (body.type as 'transfer' | 'airtime' | 'bill') ?? 'transfer',
        from: String(body.from ?? ''),
        to: String(body.to ?? ''),
        amount,
        biller: body.biller ? String(body.biller) : undefined,
        reference: body.reference ? String(body.reference) : undefined,
      });
      return reply(res, created, traceId, 201);
    }
    const id = decodeURIComponent(segments[1] ?? '');
    const action = segments[2];
    if (action === 'update') {
      return reply(
        res,
        await bank.update(id, {
          amount: body.amount === undefined ? undefined : Number(body.amount),
          to: body.to ? digits(String(body.to)) : undefined,
        }),
        traceId,
      );
    }
    if (action === 'confirm') return reply(res, await bank.confirm(id), traceId);
    if (action === 'cancel') return reply(res, await bank.cancel(id), traceId);
  }

  if (method === 'POST' && path === '/sandbox/reset') {
    bank.reset();
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'NOT_FOUND', message: `Route ${method} ${path} inconnue.` });
}

function reply(
  res: http.ServerResponse,
  result: { ok: true; data: unknown } | { ok: false; status: number; error: string; message?: string },
  traceId?: string | string[],
  status = 200,
): void {
  const header = typeof traceId === 'string' ? { 'X-Trace-Id': traceId } : undefined;
  if (!result.ok) return send(res, result.status, { error: result.error, message: result.message }, header);
  send(res, status, result.data, header);
}

function send(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}

export async function startDemoServer(port = Number(process.env.DEMO_PORT ?? 8788)): Promise<{ url: string; close: () => Promise<void> }> {
  const { server } = createDemoServer();
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/api/v1`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void startDemoServer().then(({ url }) => {
    console.log(`Banque de demonstration : ${url}`);
    console.log(`Cle acceptee : ${process.env.SAFINUM_TEAM_KEY || DEMO_TEAM_KEY}`);
  });
}
