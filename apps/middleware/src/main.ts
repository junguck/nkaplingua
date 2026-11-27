/**
 * Démarrage réel : Mongo -> Redis -> L1, pool bancaire chaud, abonnement aux validations.
 */

import { Redis } from 'ioredis';
import { GridFSBucket, MongoClient, ObjectId, type Db } from 'mongodb';
import { COLLECTIONS, type Language, type LexiconDoc, type ReferenceDoc } from '@nkap/lingua-core';
import { buildApp, type AudioStore, type ReferenceSink } from './app.ts';
import { BankClient } from './bank/client.ts';
import { createWarmPool } from './bank/dispatcher.ts';
import { loadConfig } from './config.ts';
import type { Catalog } from './i18n/catalog.ts';
import { bootCatalog, followCatalog, type Logger } from './i18n/sync.ts';
import { MemoryRateLimiter, RedisRateLimiter } from './security/guard.ts';
import { MemorySessionStore, RedisSessionStore } from './session/store.ts';
import { Lexicon, SEED_LEXICON } from './understand.ts';

const config = loadConfig();

const consoleLogger: Logger = {
  info: (obj, msg) => console.log(JSON.stringify({ level: 'info', msg, ...obj })),
  warn: (obj, msg) => console.warn(JSON.stringify({ level: 'warn', msg, ...obj })),
};

async function connectMongo(): Promise<{ client: MongoClient; db: Db } | null> {
  const client = new MongoClient(config.MONGO_URL, { serverSelectionTimeoutMS: 1_500 });
  try {
    await client.connect();
    return { client, db: client.db(config.MONGO_DB) };
  } catch (error) {
    consoleLogger.warn({ err: String(error) }, 'Mongo injoignable au démarrage');
    await client.close().catch(() => undefined);
    return null;
  }
}

async function connectRedis(): Promise<Redis | null> {
  const redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1_500 });
  try {
    await redis.connect();
    return redis;
  } catch (error) {
    consoleLogger.warn({ err: String(error) }, 'Redis injoignable au démarrage');
    redis.disconnect();
    return null;
  }
}

async function loadLexicon(db: Db | null): Promise<Lexicon> {
  if (db === null) return new Lexicon(SEED_LEXICON);
  const docs = await db.collection<LexiconDoc>(COLLECTIONS.lexicon).find({}, { projection: { _id: 0 } }).toArray().catch(() => []);
  return new Lexicon(docs.length > 0 ? docs : SEED_LEXICON);
}

/** Textes source vus en production -> `references` (liste de travail du studio), hors du chemin critique. */
function referenceSink(db: Db | null): { sink: ReferenceSink; stop: () => void } {
  const seen = new Set<string>();
  const pending = new Map<string, { text: string; context: string | null; maxChars: number | null; channel: string }>();
  const timer = setInterval(() => {
    if (db === null || pending.size === 0) return;
    const batch = [...pending.entries()];
    pending.clear();
    const ops = batch.map(([key, ref]) => ({
      updateOne: {
        filter: { _id: key },
        update: {
          $setOnInsert: { fr: ref.text, context: ref.context, maxChars: ref.maxChars, discoveredAt: new Date() },
          $addToSet: { channels: ref.channel },
        },
        upsert: true,
      },
    }));
    db.collection<ReferenceDoc>(COLLECTIONS.references).bulkWrite(ops, { ordered: false }).catch((error: unknown) => {
      consoleLogger.warn({ err: String(error) }, 'Écriture des références différée');
    });
  }, 5_000).unref();
  return {
    sink: {
      see(key, text, context, maxChars, channel) {
        if (seen.has(key)) return;
        seen.add(key);
        pending.set(key, { text, context, maxChars, channel });
      },
    },
    stop: () => clearInterval(timer),
  };
}

function audioStore(db: Db | null, catalog: Catalog): AudioStore {
  const cache = new Map<string, Buffer>();
  const bucket = db === null ? null : new GridFSBucket(db, { bucketName: COLLECTIONS.audioBucket });
  return {
    has: (lang: Language, key: string) => catalog.audio(lang, key) !== undefined,
    async get(lang: Language, key: string): Promise<Buffer | null> {
      const id = catalog.audio(lang, key);
      if (id === undefined || bucket === null || !ObjectId.isValid(id)) return null;
      const hit = cache.get(id);
      if (hit !== undefined) return hit;
      const chunks: Buffer[] = [];
      try {
        for await (const chunk of bucket.openDownloadStream(new ObjectId(id))) if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      } catch {
        return null;
      }
      const buffer = Buffer.concat(chunks);
      cache.set(id, buffer);
      return buffer;
    },
  };
}

async function main(): Promise<void> {
  const mongo = await connectMongo();
  const redis = await connectRedis();
  const db = mongo?.db ?? null;

  const boot = await bootCatalog({ db, redis, logger: consoleLogger });
  consoleLogger.info({ source: boot.source, ms: Math.round(boot.elapsedMs), keys: Object.fromEntries(boot.catalog.coverage()) }, 'Catalogue chargé');

  let stopFollow: (() => Promise<void>) | null = null;
  let subscriber: Redis | null = null;
  if (redis !== null) {
    subscriber = redis.duplicate();
    stopFollow = await followCatalog(subscriber, redis, boot.catalog, consoleLogger);
  }

  const bankOrigin = new URL(config.SAFINUM_BANK_URL).origin;
  const pool = createWarmPool({ origin: bankOrigin, keepAliveMs: config.BANK_KEEPALIVE_MS, warmIntervalMs: config.BANK_WARM_INTERVAL_MS });
  const warmMs = await pool.warm();
  consoleLogger.info({ origin: bankOrigin, ms: Math.round(warmMs) }, 'Connexion bancaire préchauffée');

  const references = referenceSink(db);

  const app = buildApp({
    bank: new BankClient({ baseUrl: config.SAFINUM_BANK_URL, teamKey: config.SAFINUM_TEAM_KEY, dispatcher: pool.dispatcher }),
    catalog: boot.catalog,
    lexicon: await loadLexicon(db),
    sessions: redis !== null ? new RedisSessionStore(redis) : new MemorySessionStore(),
    rateLimiter: redis !== null ? new RedisRateLimiter(redis, config.RATE_LIMIT_PER_MIN) : new MemoryRateLimiter(config.RATE_LIMIT_PER_MIN),
    references: references.sink,
    audio: audioStore(db, boot.catalog),
    hookSecret: config.HOOK_SECRET ?? null,
    allowedBankOrigins: config.BANK_ALLOWED_ORIGINS,
    publicBaseUrl: config.PUBLIC_BASE_URL ?? null,
    catalogSource: boot.source,
  });

  await app.listen({ host: config.HOST, port: config.PORT });
  consoleLogger.info({ hook: config.HOOK_SECRET ? '/hook/<secret>' : '/' }, 'Middleware prêt');

  const shutdown = async (): Promise<void> => {
    references.stop();
    await app.close();
    await stopFollow?.();
    subscriber?.disconnect();
    redis?.disconnect();
    await pool.close();
    await mongo?.client.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}

await main();
