/**
 * Serveur HTTP du middleware : une seule URL sert les trois canaux.
 *
 *   POST /middleware/ussd     POST /middleware/mobile     POST /middleware/web
 *   POST /                    (même chose, canal déduit du corps)
 *   GET  /health              (pour vérifier que le tunnel arrive jusqu'ici)
 *
 * Lancer : `pnpm build && node dist/server.js` (port 8080 par défaut).
 */

import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { Gateway } from './gateway.js';
import type { InboundTurn } from './contract.js';
import { loadEnv } from './env.js';

loadEnv();

const MAX_BODY_BYTES = 512 * 1024;

export interface ServerOptions {
  readonly teamKey: string;
  readonly bankUrl: string;
  readonly strictStatus?: boolean;
  readonly log?: (line: string) => void;
}

export function createMiddlewareServer(options: ServerOptions): http.Server {
  const gateway = new Gateway({
    teamKey: options.teamKey,
    bankUrl: options.bankUrl,
    ...(options.strictStatus === undefined ? {} : { strictStatus: options.strictStatus }),
  });
  const log = options.log ?? ((line: string) => console.log(line));

  return http.createServer((req, res) => {
    void (async () => {
      const started = Date.now();
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');

      // Console de test : la même page sert de simulateur USSD / mobile / web en local.
      if (req.method === 'GET' && (url.pathname === '/console' || url.pathname === '/console/')) {
        const page = fs.readFileSync(fileURLToPath(new URL('../public/console.html', import.meta.url)), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page);
        return;
      }

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        return json(res, 200, {
          ok: true,
          service: 'nkaplingua-safinum-middleware',
          channels: ['ussd', 'mobile', 'web'],
          teamKeyConfigured: options.teamKey.length > 0,
          bankUrl: options.bankUrl,
        });
      }

      // Réponse du proche de confiance : POST /second-look/{id}/answer  { "text": "1" }
      const second = url.pathname.match(/^\/second-look\/([\w-]+)\/answer$/);
      if (req.method === 'POST' && second) {
        if (!gateway.secondLook) return json(res, 404, { error: 'Second regard désactivé' });
        let body: { text?: unknown };
        try {
          body = (await readJson(req)) as { text?: unknown };
        } catch {
          return json(res, 400, { error: 'JSON invalide' });
        }
        const outcome = await gateway.secondLook.answer(second[1] ?? '', typeof body.text === 'string' ? body.text : '');
        return json(res, outcome === 'unknown' ? 404 : 200, { decision: outcome });
      }

      if (req.method !== 'POST') return json(res, 405, { error: 'POST attendu' });
      if (url.pathname !== '/' && !url.pathname.startsWith('/middleware/')) {
        return json(res, 404, { error: 'Route inconnue' });
      }

      let payload: InboundTurn;
      try {
        payload = await readJson(req);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json(res, message === 'TOO_LARGE' ? 413 : 400, { error: message === 'TOO_LARGE' ? 'Corps trop volumineux' : 'JSON invalide' });
      }

      const pathChannel = url.pathname.split('/')[2];
      const turn: InboundTurn = pathChannel ? { ...payload, channel: payload.channel ?? pathChannel } : payload;

      try {
        const handled = await gateway.handleWithMeta(turn);
        const elapsed = Date.now() - started;
        log(
          [
            `trace=${handled.traceId || '-'}`,
            `channel=${handled.channel}`,
            `intent=${'interpretation' in handled.reply ? handled.reply.interpretation.intent : 'UI_TRANSLATION'}`,
            `ms=${elapsed}`,
          ].join(' '),
        );
        return json(res, 200, handled.reply);
      } catch (error) {
        // Un vrai bug reste visible : statut 500 et message dans le journal, jamais masqué.
        const message = error instanceof Error ? error.message : String(error);
        log(`ERREUR trace=${turn.trace_id ?? '-'} ${message}`);
        return json(res, 500, { error: message });
      }
    })();
  });
}

function readJson(req: http.IncomingMessage): Promise<InboundTurn> {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('TOO_LARGE'));
        req.destroy();
        return;
      }
      raw += chunk.toString('utf8');
    });
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as InboundTurn) : {});
      } catch {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export async function startMiddleware(
  port = Number(process.env.PORT ?? 8080),
  host = process.env.HOST ?? '127.0.0.1',
): Promise<{ url: string; close: () => Promise<void> }> {
  const { server } = { server: createMiddlewareServer(defaultOptions()) };
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export function defaultOptions(): ServerOptions {
  const bankUrl = process.env.SAFINUM_BANK_URL || 'https://safinum.cm/api/v1';
  return {
    teamKey: process.env.SAFINUM_TEAM_KEY ?? '',
    bankUrl,
    strictStatus: process.env.SAFINUM_STATUS_STRICT === '1',
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void startMiddleware().then(({ url }) => {
    const options = defaultOptions();
    console.log(`Middleware NkapLingua a l'ecoute sur ${url}`);
    console.log(`Banque : ${options.bankUrl}`);
    if (!options.teamKey) {
      console.warn('ATTENTION : SAFINUM_TEAM_KEY est vide. Copiez .env.example en .env et collez votre cle sbx_...');
    }
  });
}
