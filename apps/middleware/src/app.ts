/**
 * Application HTTP. Toutes les dépendances sont injectées : les tests montent la vraie
 * application avec une banque simulée, sans Mongo ni Redis.
 */

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isLanguage, turnSchema, uiTranslationSchema, type Language } from '@nkap/lingua-core';
import type { BankPort } from './bank/client.ts';
import type { Catalog } from './i18n/catalog.ts';
import type { SessionStore } from './session/store.ts';
import type { Lexicon } from './understand.ts';
import { handleTurn } from './channels/turn.ts';
import { handleUi, uiKey } from './channels/ui.ts';
import { CHANNELS, conversationLanguages, languageAvailability } from './i18n/availability.ts';
import { isForeignBankUrl, maskPhone, secretMatches, type RateLimiter } from './security/guard.ts';

export interface ReferenceSink {
  /** Texte source vu en production : alimente la liste de travail du studio. */
  see(key: string, text: string, context: string | null, maxChars: number | null, channel: string): void;
}

export interface AudioStore {
  get(lang: Language, key: string): Promise<Buffer | null>;
  has(lang: Language, key: string): boolean;
}

export interface AppDeps {
  readonly bank: BankPort;
  readonly catalog: Catalog;
  readonly lexicon: Lexicon;
  readonly sessions: SessionStore;
  readonly rateLimiter: RateLimiter;
  readonly references: ReferenceSink;
  readonly audio: AudioStore;
  readonly hookSecret: string | null;
  readonly allowedBankOrigins: readonly string[];
  readonly publicBaseUrl: string | null;
  readonly catalogSource: string;
  readonly logger?: boolean;
}


const envelopeSchema = z.object({ type: z.string().optional(), trace_id: z.string().optional() }).passthrough();

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    bodyLimit: 2 * 1024 * 1024,
    logger:
      deps.logger === false
        ? false
        : {
            level: 'info',
            redact: ['req.headers["x-team-key"]', 'req.headers.authorization', 'req.headers.cookie'],
            serializers: {
              req: (req: FastifyRequest) => ({ method: req.method, url: req.url.replace(/^\/hook\/[^/?]+/, '/hook/***') }),
            },
          },
  });

  // Menu Langue : seules les langues qui couvrent TOUT le parcours conversationnel.
  // (Avant, 40 clés d'écran suffisaient : le menu proposait une langue qui répondait en français.)
  const servedLanguages = (): Language[] => [...conversationLanguages(deps.catalog)];

  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('cache-control', reply.getHeader('cache-control') ?? 'no-store');
    reply.header('referrer-policy', 'no-referrer');
  });

  const health = async (): Promise<object> => ({
    ok: true,
    service: 'nkaplingua-middleware',
    catalog: { source: deps.catalogSource, version: deps.catalog.version, keys: Object.fromEntries(deps.catalog.coverage()) },
    served: servedLanguages(),
  });
  app.get('/', health);
  app.get('/health', health);
  /** Langues × canaux : état réel, lisible par le jury et par les écrans. */
  app.get('/langues', async () => ({
    canaux: CHANNELS,
    langues: languageAvailability(deps.catalog),
    servi: servedLanguages(),
  }));

  const dispatch = async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
    const startedAt = performance.now();
    const traceHeader = request.headers['x-trace-id'];
    const body: unknown = request.body;
    const envelope = envelopeSchema.safeParse(body);
    const record = envelope.success ? envelope.data : {};
    const traceId = typeof traceHeader === 'string' ? traceHeader : (record.trace_id ?? null);

    if (record.type === 'ui_translation') {
      const parsed = uiTranslationSchema.safeParse(body);
      if (!parsed.success) return reply.code(422).send({ error: 'INVALID_REQUEST', field: parsed.error.issues[0]?.path.join('.') ?? null });
      for (const [key, entry] of Object.entries(parsed.data.strings)) {
        deps.references.see(uiKey(key), entry.text, entry.context ?? null, entry.max_chars ?? null, parsed.data.channel);
      }
      const result = handleUi(parsed.data, deps.catalog);
      request.log.info({ channel: parsed.data.channel, screen: parsed.data.screen, lang: result.body.language, coverage: Number(result.coverage.toFixed(2)), ms: Math.round(performance.now() - startedAt) }, 'ui');
      return result.body;
    }

    const parsed = turnSchema.safeParse(body);
    if (!parsed.success) return reply.code(422).send({ error: 'INVALID_REQUEST', field: parsed.error.issues[0]?.path.join('.') ?? null });
    const turn = parsed.data;

    // Le payload ne choisit jamais où part notre clé d'équipe.
    if (isForeignBankUrl(turn.bank_api?.base_url, deps.allowedBankOrigins)) {
      request.log.warn({ phone: maskPhone(turn.phone) }, 'bank_api.base_url étranger ignoré (tentative d’exfiltration de clé ?)');
    }
    if (!(await deps.rateLimiter.hit(`${turn.channel}:${turn.phone}`))) {
      return reply.code(429).send({ error: 'RATE_LIMITED' });
    }

    const result = await handleTurn(turn, {
      bank: deps.bank,
      lexicon: deps.lexicon,
      servedLanguages,
      catalog: deps.catalog,
      sessions: deps.sessions,
      audioUrl: (lang, key) => (deps.audio.has(lang, key) ? audioUrl(request, deps.publicBaseUrl, lang, key) : null),
    }, { traceId, startedAt });

    request.log.info(
      {
        channel: turn.channel,
        phone: maskPhone(turn.phone),
        intent: result.body.interpretation.intent,
        lang: result.body.interpretation.language,
        septets: result.septets,
        gsm7: result.gsm7,
        tx: result.body.transaction.status,
        ms: Math.round(performance.now() - startedAt),
      },
      'turn',
    );
    return result.body;
  };

  if (deps.hookSecret === null) app.post('/', dispatch);
  app.post<{ Params: { secret: string } }>('/hook/:secret', async (request, reply) => {
    if (deps.hookSecret === null || !secretMatches(deps.hookSecret, request.params.secret)) return reply.code(404).send({ error: 'NOT_FOUND' });
    return dispatch(request, reply);
  });

  app.get<{ Params: { lang: string; file: string } }>('/voix/:lang/:file', async (request, reply) => {
    const { lang, file } = request.params;
    const match = /^([a-z0-9_.]{1,96})\.mp3$/.exec(file);
    if (match?.[1] === undefined || !isLanguage(lang)) return reply.code(404).send();
    const audio = await deps.audio.get(lang, match[1]);
    if (audio === null) return reply.code(404).send();
    return reply.header('content-type', 'audio/mpeg').header('cache-control', 'public, max-age=86400, immutable').send(audio);
  });

  return app;
}

function audioUrl(request: FastifyRequest, base: string | null, lang: Language, key: string): string {
  const root = base ?? `${request.protocol}://${request.headers['x-forwarded-host'] ?? request.headers.host ?? 'localhost'}`;
  return `${root.replace(/\/+$/, '')}/voix/${lang}/${key}.mp3`;
}
