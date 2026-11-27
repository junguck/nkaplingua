/**
 * Serveur HTTP du middleware : une seule URL sert les trois canaux SAFINUM et l'adaptateur IVR.
 *
 *   POST /middleware/ussd     POST /middleware/mobile     POST /middleware/web     POST /middleware/ivr
 *   POST /                    (même chose, canal déduit du corps)
 *   GET  /health              (pour vérifier que le tunnel arrive jusqu'ici)
 *   GET  /                     (compatibilité avec le kit officiel)
 *
 * Lancer : `pnpm build && node dist/server.js` (port 8080 par défaut).
 */

import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { Gateway } from './gateway.js';
import { SafinumBank } from './bank.js';
import { handleAtm } from './atm.js';
import { handleIvr, type IvrState } from './ivr.js';
import { adminAction, adminState } from './lang-admin.js';
import { TtlStore } from './session.js';
import { isSafinumLanguage, isUiTranslation, statusModeFrom, type InboundTurn, type StatusMode } from '@nkap/safinum';
import { loadEnv } from './env.js';
import { languageCatalog } from './language-catalog.js';
import { applyWordDb, lastWordBase } from './word-base.js';

const MAX_BODY_BYTES = 512 * 1024;

/** Canaux servis par une même URL. `atm` et `ivr` sont locaux, hors contrat SAFINUM. */
const KNOWN_CHANNELS: ReadonlySet<string> = new Set(['ussd', 'mobile', 'web', 'ivr']);

export interface ServerOptions {
  readonly teamKey: string;
  readonly bankUrl: string;
  readonly statusMode?: StatusMode;
  /** Canaux locaux (`/ivr`) : désactivés par défaut, jamais exposés au contrat SAFINUM. */
  readonly localChannels?: boolean;
  readonly log?: (line: string) => void;
}

export function createMiddlewareServer(options: ServerOptions): http.Server {
  const gateway = new Gateway({
    teamKey: options.teamKey,
    bankUrl: options.bankUrl,
    ...(options.statusMode === undefined ? {} : { statusMode: options.statusMode }),
  });
  const log = options.log ?? ((line: string) => console.log(line));
  const ivrSessions = new TtlStore<IvrState>(300_000);

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

      // Page d'administration de la base de mots : locale uniquement (voir `isLoopback`).
      if (req.method === 'GET' && (url.pathname === '/langues-admin' || url.pathname === '/langues-admin/')) {
        if (!isLoopback(req)) return json(res, 403, { error: 'Page locale uniquement' });
        const page = fs.readFileSync(fileURLToPath(new URL('../public/langues.html', import.meta.url)), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page);
        return;
      }

      // API de la page : lecture de la base et écriture (ajout, correction, suppression, export).
      if (url.pathname === '/api/langues' || url.pathname.startsWith('/api/langues/')) {
        if (!isLoopback(req)) return json(res, 403, { error: 'Administration locale uniquement' });
        if (url.pathname === '/api/langues' || url.pathname === '/api/langues/') {
          if (req.method !== 'GET') return json(res, 405, { error: 'GET attendu' });
          return json(res, 200, adminState());
        }
        if (req.method !== 'POST') return json(res, 405, { error: 'POST attendu' });
        let body: unknown;
        try {
          body = await readJson(req);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return json(res, message === 'TOO_LARGE' ? 413 : 400, { error: message === 'TOO_LARGE' ? 'Corps trop volumineux' : 'JSON invalide' });
        }
        const action = url.pathname.split('/')[3] ?? '';
        const result = adminAction(action, typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {});
        log(`lang-admin ${action} HTTP ${result.status}`);
        return json(res, result.status, result.body);
      }

      // Catalogue des langues : ce que nous comprenons, ce que nous servons, où en sont les packs.
      // Sert la console de jury (statut + repli) et la vigie, sans exposer la clé d'équipe.
      if (req.method === 'GET' && (url.pathname === '/langues' || url.pathname === '/langues/')) {
        const words = lastWordBase();
        return json(res, 200, {
          languages: languageCatalog(),
          wordBase: {
            file: words.file,
            loaded: words.report !== null,
            ok: words.ok,
            languages: words.report?.languages ?? [],
            words: words.report?.cues ?? 0,
            problems: words.problems,
          },
        });
      }

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        const words = lastWordBase();
        return json(res, 200, {
          ok: true,
          service: 'nkaplingua-safinum-middleware',
          channels: ['ussd', 'mobile', 'web'],
          localChannels: options.localChannels ? ['ivr', 'atm'] : [],
          teamKeyConfigured: options.teamKey.length > 0,
          bankUrl: options.bankUrl,
          wordBase: { file: words.file, ok: words.ok, languages: words.report?.languages ?? [], words: words.report?.cues ?? 0, problems: words.problems },
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

      // Canal IVR local : uniquement si explicitement activé, jamais sur le contrat SAFINUM.
      if (req.method === 'POST' && url.pathname === '/ivr') {
        if (!options.localChannels) return json(res, 404, { error: 'Route inconnue' });
        let ivrBody: {
          call_id?: string;
          session_id?: string;
          phone?: string;
          language?: string | null;
          trace_id?: string;
          input?: { digits?: string; text?: string };
        };
        try {
          ivrBody = (await readJson(req)) as typeof ivrBody;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return json(res, message === 'TOO_LARGE' ? 413 : 400, { error: message === 'TOO_LARGE' ? 'Corps trop volumineux' : 'JSON invalide' });
        }
        const trace = traceFrom(req.headers['x-trace-id'], ivrBody.trace_id) ?? '';
        const bank = new SafinumBank({ baseUrl: options.bankUrl, teamKey: options.teamKey, traceId: trace });
        const reply = await handleIvr(
          {
            call_id: ivrBody.call_id,
            session_id: ivrBody.session_id,
            phone: ivrBody.phone,
            language: ivrBody.language ?? null,
            input: ivrBody.input,
          },
          { bank, sessions: ivrSessions },
        );
        log(`trace=${trace || '-'} channel=ivr`);
        return json(res, 200, reply);
      }

      // Canal ATM local : même règle que l'IVR, jamais sur le contrat SAFINUM.
      if (req.method === 'POST' && url.pathname === '/atm') {
        if (!options.localChannels) return json(res, 404, { error: 'Route inconnue' });
        let atmBody: {
          session_id?: string;
          card?: string;
          language?: string | null;
          input?: { digits?: string; text?: string };
        };
        try {
          atmBody = (await readJson(req)) as typeof atmBody;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return json(res, message === 'TOO_LARGE' ? 413 : 400, { error: message === 'TOO_LARGE' ? 'Corps trop volumineux' : 'JSON invalide' });
        }
        const trace = traceFrom(req.headers['x-trace-id'], undefined) ?? '';
        const bank = new SafinumBank({ baseUrl: options.bankUrl, teamKey: options.teamKey, traceId: trace });
        const reply = await handleAtm(
          {
            session_id: atmBody.session_id,
            card: atmBody.card,
            language: atmBody.language ?? null,
            input: atmBody.input,
          },
          { bank },
        );
        log(`trace=${trace || '-'} channel=atm`);
        return json(res, 200, reply);
      }

      if (req.method !== 'POST') return json(res, 405, { error: 'POST attendu' });
      if (url.pathname !== '/' && !url.pathname.startsWith('/middleware/') && url.pathname !== '/channel/ivr') {
        return json(res, 404, { error: 'Route inconnue' });
      }

      let payload: InboundTurn;
      try {
        payload = await readJson(req);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json(res, message === 'TOO_LARGE' ? 413 : 400, { error: message === 'TOO_LARGE' ? 'Corps trop volumineux' : 'JSON invalide' });
      }

      // Écran mobile/web : `language` et `strings` (un objet) sont obligatoires, sinon INVALID_RESPONSE.
      // Mais `language` peut valoir `null` : la sandbox annonce alors « non précisée » et la détection
      // (ou le repli français) nous revient — refuser `null` casserait tous les écrans de ce mode.
      // Seule l'absence de la clé, ou une langue inconnue, est une réponse invalide.
      const hasLanguageKey = Object.prototype.hasOwnProperty.call(payload, 'language');
      if (
        isUiTranslation(payload) &&
        (!hasLanguageKey ||
          (payload.language !== null && !isSafinumLanguage(payload.language)) ||
          typeof payload.strings !== 'object' ||
          payload.strings === null ||
          Array.isArray(payload.strings))
      ) {
        return json(res, 400, { error: 'INVALID_RESPONSE' });
      }

      const pathChannel = url.pathname.startsWith('/middleware/') ? url.pathname.split('/')[2] : undefined;
      // Un canal inconnu (`atm`, faute de frappe) n'est jamais servi par le contrat.
      if (
        (pathChannel !== undefined && !KNOWN_CHANNELS.has(pathChannel)) ||
        (typeof payload.channel === 'string' && !KNOWN_CHANNELS.has(payload.channel))
      ) {
        return json(res, 404, { error: 'Canal inconnu' });
      }
      const requestChannel = pathChannel ?? payload.channel ?? (url.pathname === '/channel/ivr' ? 'ivr' : undefined);
      // Kit officiel : la passerelle envoie l'identifiant du tour dans l'en-tête `X-Trace-Id`, le corps
      // n'est qu'un repli. Une trace erronée sur nos appels bancaires = NO_BANK_CALL (travail invisible).
      const traceId = traceFrom(req.headers['x-trace-id'], payload.trace_id);
      const turn: InboundTurn = {
        ...payload,
        ...(traceId === undefined ? {} : { trace_id: traceId }),
        ...(requestChannel ? { channel: payload.channel ?? requestChannel } : {}),
      };

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

/** En-tête `X-Trace-Id` d'abord (kit officiel), `trace_id` du corps en repli. */
export function traceFrom(header: string | string[] | undefined, body: string | undefined): string | undefined {
  const fromHeader = (Array.isArray(header) ? header[0] : header)?.trim();
  if (fromHeader) return fromHeader;
  const fromBody = body?.trim();
  return fromBody ? fromBody : undefined;
}

/**
 * Vrai seulement pour la boucle locale : l'administration écrit `data/langues.json` et ne doit
 * jamais être joignable à travers un tunnel public.
 */
function isLoopback(req: http.IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
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
    statusMode: statusModeFrom(process.env.SAFINUM_STATUS),
    localChannels: process.env.ENABLE_V2_CHANNELS === '1',
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // Le .env n'est lu qu'au démarrage du serveur, jamais à l'import de la bibliothèque :
  // sinon les tests héritent de la vraie clé et la banque de démonstration les refuse.
  loadEnv();
  const words = applyWordDb();
  if (!words.ok) {
    console.warn(`ATTENTION : base de mots ignorée (${words.problems.length} probleme(s)) :`);
    for (const problem of words.problems) console.warn(`  - ${problem}`);
    console.warn('  Corrigez data/langues.json (pnpm --filter @nkap/gateway lang verifier), puis redemarrez.');
  } else if (words.report !== null && words.report.languages.length > 0) {
    console.log(`Base de mots : ${words.report.languages.join(', ')} (${words.report.cues} indice(s)) depuis ${words.file}`);
  }
  void startMiddleware().then(({ url }) => {
    const options = defaultOptions();
    console.log(`Middleware NkapLingua a l'ecoute sur ${url}`);
    console.log(`Banque : ${options.bankUrl}`);
    if (!options.teamKey) {
      console.warn('ATTENTION : SAFINUM_TEAM_KEY est vide. Copiez .env.example en .env et collez votre cle sbx_...');
    }
  });
}
