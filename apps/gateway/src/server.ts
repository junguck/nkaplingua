/**
 * Serveur HTTP du middleware : une seule URL sert les six canaux ouverts par SAFINUM.
 *
 *   POST /middleware/ussd     POST /middleware/mobile     POST /middleware/web
 *   POST /                    (même chose, canal déduit du corps : sms, atm et ivr compris)
 *   POST /ivr  POST /atm      (vues locales des canaux v2, hors contrat)
 *   GET  /health              (pour vérifier que le tunnel arrive jusqu'ici)
 *   GET  /                     (compatibilité avec le kit officiel)
 *
 * Lancer : `pnpm build && node dist/server.js` (port 8080 par défaut).
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { Gateway } from './gateway.js';
import { SafinumBank } from './bank.js';
import { handleAtm } from './atm.js';
import { handleIvr, type IvrState } from './ivr.js';
import { handleSms } from './sms.js';
import { handleUi } from './ui.js';
import { adminAction, adminState } from './lang-admin.js';
import { audioDir, audioUrl, clipForText, loadAudioIndex, voiceModel, voiceSummary } from './voice.js';
import { TtlStore } from './session.js';
import { isSafinumLanguage, isUiTranslation, statusModeFrom, type InboundTurn, type StatusMode } from '@nkap/safinum';
import { loadEnv } from './env.js';
import { languageCatalog } from './language-catalog.js';
import { applyWordDb, lastWordBase } from './word-base.js';
import { RateLimiter, isAllowedBankUrl, routeHook } from './security.js';
import { installWarmBank } from './warm-bank.js';
import type { StudioSync } from './studio-sync.js';
import { studioVoiceFor } from './studio-catalog.js';

const MAX_BODY_BYTES = 512 * 1024;

/** Les six canaux acceptés par `POST /sandbox/endpoint` (vérifié le 27/11 : tous répondent 200). */
const KNOWN_CHANNELS: ReadonlySet<string> = new Set(['ussd', 'mobile', 'web', 'sms', 'atm', 'ivr']);

/** Canaux v2 qui gardent une session de dialogue sur la même URL que les trois du contrat. */
const V2_CHANNELS: ReadonlySet<string> = new Set(['sms', 'atm', 'ivr']);

export interface ServerOptions {
  readonly teamKey: string;
  readonly bankUrl: string;
  readonly statusMode?: StatusMode;
  /** Canaux locaux (`/ivr`) : désactivés par défaut, jamais exposés au contrat SAFINUM. */
  readonly localChannels?: boolean;
  readonly log?: (line: string) => void;
  /** Secret de l'URL déclarée : `/hook/<secret>`. Sans lui, `POST /` reste ouvert (développement). */
  readonly hookSecret?: string | null;
  /** Tours acceptés par numéro et par minute. */
  readonly rateLimitPerMinute?: number;
  /** Synchronisation avec le studio (facultative). */
  readonly studio?: StudioSync | null;
}

export function createMiddlewareServer(options: ServerOptions): http.Server {
  const gateway = new Gateway({
    teamKey: options.teamKey,
    bankUrl: options.bankUrl,
    ...(options.statusMode === undefined ? {} : { statusMode: options.statusMode }),
  });
  const log = options.log ?? ((line: string) => console.log(line));
  const limiter = new RateLimiter(options.rateLimitPerMinute ?? 60);
  const hookSecret = options.hookSecret ?? null;
  const ivrSessions = new TtlStore<IvrState>(300_000);
  const smsSessions = new TtlStore<import('./session.js').SessionState>(600_000);

  return http.createServer((req, res) => {
    void (async () => {
      const started = Date.now();
      const requested = new URL(req.url ?? '/', 'http://127.0.0.1');
      // Les tours du contrat passent par l'URL secrète ; les pages publiques (santé, audio) restent ouvertes.
      const routed = req.method === 'POST' ? routeHook(requested.pathname, hookSecret) : { ok: true as const, path: requested.pathname };
      if (!routed.ok) return json(res, 404, { error: 'Route inconnue' });
      const url = new URL(routed.path + requested.search, 'http://127.0.0.1');

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

      // Voix : page d'écoute, index des clips et fichiers WAV (lecture seule, sans clé).
      if (req.method === 'GET' && (url.pathname === '/voix' || url.pathname === '/voix/')) {
        const page = fs.readFileSync(fileURLToPath(new URL('../public/voix.html', import.meta.url)), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/audio/index.json') {
        const index = loadAudioIndex();
        if (index === null) return json(res, 404, { error: 'Aucun clip : lancez pnpm --filter @nkap/gateway tts' });
        return json(res, 200, index);
      }

      // Voix enregistrées et validées dans le studio (mp3, format attendu par l'IVR).
      const studioClip = url.pathname.match(/^\/voix\/([a-z]{2,3})\/([a-f0-9]{24})\.mp3$/);
      if (req.method === 'GET' && studioClip?.[2] !== undefined && options.studio) {
        const data = await options.studio.audio(studioClip[2]);
        if (data === null) return json(res, 404, { error: 'Audio introuvable' });
        res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'public, max-age=86400, immutable', 'content-length': data.length });
        return res.end(data);
      }

      const audioClip = url.pathname.match(/^\/audio\/([a-z]{2,3})\/([a-z0-9._-]+)\.wav$/i);
      if (req.method === 'GET' && audioClip) {
        const lang = audioClip[1] ?? '';
        const key = audioClip[2] ?? '';
        const dir = path.resolve(audioDir());
        const file = path.resolve(dir, lang, `${key}.wav`);
        // Aucune traversée possible : le motif ne contient ni `/` ni `..`, et on revérifie le chemin.
        if (!file.startsWith(dir + path.sep) || !fs.existsSync(file)) {
          return json(res, 404, { error: 'Clip inconnu' });
        }
        res.writeHead(200, {
          'Content-Type': 'audio/wav',
          'Content-Length': fs.statSync(file).size,
          'Cache-Control': 'public, max-age=3600',
        });
        fs.createReadStream(file).pipe(res);
        return;
      }

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        const words = lastWordBase();
        return json(res, 200, {
          ok: true,
          service: 'nkaplingua-safinum-middleware',
          channels: ['ussd', 'mobile', 'web', 'sms', 'atm', 'ivr'],
          localChannels: options.localChannels ? ['ivr', 'atm'] : [],
          teamKeyConfigured: options.teamKey.length > 0,
          bankUrl: options.bankUrl,
          wordBase: { file: words.file, ok: words.ok, languages: words.report?.languages ?? [], words: words.report?.cues ?? 0, problems: words.problems },
          voice: voiceSummary(),
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
        // Audio : on ne sert un clip que s'il correspond EXACTEMENT à la phrase prononcée.
        // Un clip humain (`model: "locuteurs"`) déclare sa propre voix ; sinon on se rabat sur le
        // modèle de synthèse de la langue. Une langue sans modèle reste `model: null`.
        const clip = clipForText(reply.language, reply.say);
        const model = clip?.model ?? voiceModel(reply.language);
        return json(res, 200, {
          ...reply,
          audio:
            clip === null
              ? null
              : { url: audioUrl(clip), duration_ms: clip.duration_ms, model: clip.model, engine: clip.engine, status: clip.status },
          voice:
            model === null
              ? { model: null, note: 'Aucun modèle MMS-TTS publié pour cette langue : pas de voix synthétique.' }
              : { model },
        });
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
      // Le chemin fait foi : nommer un AUTRE canal dans le corps ne transforme pas `/middleware/ussd`
      // en tour ATM/IVR — sinon un appel USSD contournerait le canal déclaré à la sandbox.
      if (pathChannel !== undefined && typeof payload.channel === 'string' && payload.channel !== pathChannel) {
        return json(res, 404, { error: 'CANAL_CONTRADICTOIRE' });
      }
      const requestChannel = pathChannel ?? payload.channel ?? (url.pathname === '/channel/ivr' ? 'ivr' : undefined);
      if (isUiTranslation(payload) && payload.strings) options.studio?.see(payload.strings, requestChannel ?? 'mobile');
      if (typeof payload.phone === 'string' && payload.phone !== '' && !limiter.allow(`${requestChannel ?? '-'}:${payload.phone}`)) {
        return json(res, 429, { error: 'RATE_LIMITED' });
      }
      const forgedBank = payload.bank_api?.base_url;
      if (typeof forgedBank === 'string' && forgedBank.replace(/\/+$/, '') !== options.bankUrl.replace(/\/+$/, '')) {
        log(`ALERTE bank_api.base_url du tour ignoré (seule l'URL configurée reçoit la clé)`);
      }
      // Kit officiel : la passerelle envoie l'identifiant du tour dans l'en-tête `X-Trace-Id`, le corps
      // n'est qu'un repli. Une trace erronée sur nos appels bancaires = NO_BANK_CALL (travail invisible).
      const traceId = traceFrom(req.headers['x-trace-id'], payload.trace_id);
      const turn: InboundTurn = {
        ...payload,
        ...(traceId === undefined ? {} : { trace_id: traceId }),
        ...(requestChannel ? { channel: payload.channel ?? requestChannel } : {}),
      };

      // Canaux v2 sur la même URL : SAFINUM les appelle comme les autres (vérifié : 200 à la
      // déclaration). On renvoie le contrat (response / interpretation / transaction) pour que le
      // journal du jury lise la même chose, plus la vue propre au canal pour nos démonstrations.
      if (requestChannel !== undefined && V2_CHANNELS.has(requestChannel) && url.pathname !== '/channel/ivr') {
        const v2Trace = traceFrom(req.headers['x-trace-id'], payload.trace_id) ?? '';
        const v2Bank = new SafinumBank({ baseUrl: options.bankUrl, teamKey: options.teamKey, traceId: v2Trace });
        if (requestChannel === 'sms') {
          const sms = await handleSms(turn, { bank: v2Bank, sessions: smsSessions });
          log(`trace=${v2Trace || '-'} channel=sms segments=${sms.sms.segments} ${sms.sms.encoding}`);
          return json(res, 200, sms);
        }
        if (requestChannel === 'ivr') {
          const reply = await handleIvr(
            {
              call_id: payload.session_id,
              session_id: payload.session_id,
              phone: payload.phone,
              language: payload.language ?? null,
              input: payload.input as { digits?: string; text?: string } | undefined,
            },
            { bank: v2Bank, sessions: ivrSessions },
          );
          log(`trace=${v2Trace || '-'} channel=ivr`);
          // Une voix humaine validée pour cette phrase EXACTE est jouée ; sinon la passerelle lit le texte.
          const voice = studioVoiceFor(reply.language, reply.say);
          const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '127.0.0.1');
          const scheme = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0] ?? 'http';
          return json(res, 200, {
            ...reply,
            response: {
              text: reply.say,
              end_session: reply.end,
              options: [],
              ...(voice === null ? {} : { audio: [{ url: `${scheme}://${host}/voix/${reply.language}/${voice}.mp3` }] }),
            },
            interpretation: { intent: 'UNKNOWN', parameters: {}, language: reply.language },
            transaction: {
              id: reply.state.pending_id ?? null,
              status: reply.state.pending_id === undefined ? 'none' : 'pending',
            },
          });
        }
        // Écrans ATM : la sandbox envoie les libellés de l'écran (`strings`) et attend la même
        // traduction clé par clé que mobile/web — pas notre dialogue local. Renvoyer `say`/`screen`
        // ici donne `INVALID_RESPONSE` et 47 clés `atm.*` marquées manquantes (mesuré le 27/11).
        // Le dialogue (carte, code, montant) reste servi par `POST /atm`, hors contrat.
        if (payload.strings !== undefined && payload.strings !== null) {
          const reply = handleUi(turn);
          log(
            `trace=${v2Trace || '-'} channel=atm screen=${payload.screen ?? '-'} strings=${Object.keys(payload.strings).length} language=${reply.language}`,
          );
          return json(res, 200, { screen: payload.screen, ...reply });
        }
        const atm = await handleAtm(
          {
            session_id: payload.session_id,
            language: payload.language ?? null,
            input: payload.input as { digits?: string; text?: string } | undefined,
          },
          { bank: v2Bank },
        );
        log(`trace=${v2Trace || '-'} channel=atm`);
        return json(res, 200, {
          ...atm,
          response: { text: atm.screen, end_session: atm.end, options: [] },
          interpretation: { intent: 'UNKNOWN', parameters: {}, language: atm.language },
          transaction: { id: null, status: 'none' },
        });
      }

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
  studio: StudioSync | null = null,
): Promise<{ url: string; close: () => Promise<void> }> {
  const { server } = { server: createMiddlewareServer({ ...defaultOptions(), studio }) };
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export function defaultOptions(): ServerOptions {
  const bankUrl = process.env.SAFINUM_BANK_URL || 'https://safinum.cm/api/v1';
  const extraHosts = (process.env.BANK_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter((h) => h !== '');
  if (!isAllowedBankUrl(bankUrl, extraHosts)) {
    throw new Error(`SAFINUM_BANK_URL refusée (${bankUrl}) : seule la sandbox SAFINUM ou la boucle locale reçoivent la clé d'équipe.`);
  }
  const hookSecret = process.env.HOOK_SECRET?.trim() || null;
  if (hookSecret !== null && hookSecret.length < 24) throw new Error('HOOK_SECRET doit faire au moins 24 caractères.');
  return {
    teamKey: process.env.SAFINUM_TEAM_KEY ?? '',
    bankUrl,
    hookSecret,
    rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MIN ?? 60),
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
  installWarmBank(defaultOptions().bankUrl);
  const studioConfigured = Boolean(process.env.MONGO_URL || process.env.REDIS_URL);
  const studioReady = studioConfigured
    ? import('./studio-sync.js').then((m) =>
        m.startStudioSync({ mongoUrl: process.env.MONGO_URL, mongoDb: process.env.MONGO_DB, redisUrl: process.env.REDIS_URL, log: (line) => console.log(line) }),
      )
    : Promise.resolve(null);
  void studioReady.then((studio) => startMiddleware(undefined, undefined, studio)).then(({ url }) => {
    const options = defaultOptions();
    console.log(`Middleware NkapLingua a l'ecoute sur ${url}`);
    console.log(`Banque : ${options.bankUrl}`);
    console.log(options.hookSecret ? 'Tours acceptés sur /hook/<secret> uniquement' : 'ATTENTION : HOOK_SECRET vide, POST / est ouvert (développement)');
    if (!options.teamKey) {
      console.warn('ATTENTION : SAFINUM_TEAM_KEY est vide. Copiez .env.example en .env et collez votre cle sbx_...');
    }
  });
}
