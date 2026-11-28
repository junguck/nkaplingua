/**
 * Synchronisation avec le studio linguistique (facultative : MONGO_URL et/ou REDIS_URL).
 *
 *   Mongo (base définitive des traductions validées)
 *     -> Redis (instantané partagé, écrit en une transaction)
 *       -> catalogue en mémoire (`studio-catalog.ts`), lu à chaque tour
 *
 * Le studio publie chaque validation sur Redis : la phrase est servie aussitôt, sans redémarrage.
 * Les textes source des écrans vus en production alimentent la liste de travail du studio.
 * Sans configuration, rien n'est chargé et le gateway se comporte comme avant.
 */

import { COLLECTIONS, REDIS, cachedTranslationSchema, catalogEventSchema, type ReferenceDoc } from '@nkap/lingua-core';
import { deleteStudioTranslation, replaceStudioLanguage, setStudioTranslation, studioSize } from './studio-catalog.js';

export interface StudioSyncOptions {
  readonly mongoUrl?: string | undefined;
  readonly mongoDb?: string | undefined;
  readonly redisUrl?: string | undefined;
  readonly log: (line: string) => void;
}

export interface StudioSync {
  /** mp3 d'une voix validée (GridFS), ou `null`. */
  audio(id: string): Promise<Buffer | null>;
  /** Textes source d'un écran reçu : les clés inconnues rejoignent la liste de travail du studio. */
  see(strings: Readonly<Record<string, { readonly text?: unknown; readonly context?: unknown; readonly max_chars?: unknown }>>, channel: string): void;
  readonly source: 'mongo' | 'redis' | 'none';
  close(): Promise<void>;
}

interface Row {
  readonly key: string;
  readonly lang: string;
  readonly text: string;
  readonly audioId: string | null;
}

function parse(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function install(rows: readonly Row[]): void {
  const byLang = new Map<string, Array<readonly [string, string, string | null]>>();
  for (const row of rows) {
    const list = byLang.get(row.lang) ?? [];
    list.push([row.key, row.text, row.audioId]);
    byLang.set(row.lang, list);
  }
  for (const [lang, entries] of byLang) replaceStudioLanguage(lang, entries);
}

export async function startStudioSync(options: StudioSyncOptions): Promise<StudioSync> {
  const { log } = options;
  const closers: Array<() => Promise<void>> = [];
  let source: StudioSync['source'] = 'none';

  // Imports à la demande : sans configuration, ni mongodb ni ioredis ne sont chargés.
  const mongo = options.mongoUrl ? await import('mongodb').then((m) => new m.MongoClient(options.mongoUrl ?? '', { serverSelectionTimeoutMS: 2_000 })) : null;
  const db = mongo === null ? null : await mongo.connect().then((c) => c.db(options.mongoDb ?? 'nkaplingua')).catch((error: unknown) => {
    log(`studio : Mongo injoignable (${String(error)}), repli sur Redis`);
    return null;
  });
  if (mongo !== null) closers.push(() => mongo.close());

  const { Redis } = options.redisUrl ? await import('ioredis') : { Redis: null };
  const redis = Redis === null ? null : new Redis(options.redisUrl ?? '', { lazyConnect: true, maxRetriesPerRequest: 1 });
  const redisOk = redis === null ? false : await redis.connect().then(() => true).catch((error: unknown) => {
    log(`studio : Redis injoignable (${String(error)})`);
    return false;
  });
  if (redis !== null) closers.push(async () => redis.disconnect());

  // 1. Mongo, vérité : on charge, puis on publie l'instantané dans Redis.
  if (db !== null) {
    const docs = await db.collection(COLLECTIONS.translations).find({}, { projection: { _id: 0, key: 1, lang: 1, text: 1, audioId: 1 } }).toArray();
    const rows: Row[] = [];
    for (const doc of docs) {
      if (typeof doc.key === 'string' && typeof doc.lang === 'string' && typeof doc.text === 'string') {
        rows.push({ key: doc.key, lang: doc.lang, text: doc.text, audioId: typeof doc.audioId === 'string' ? doc.audioId : null });
      }
    }
    install(rows);
    source = 'mongo';
    if (redis !== null && redisOk) {
      const multi = redis.multi();
      for (const lang of await redis.smembers(REDIS.languages)) multi.del(REDIS.translations(lang));
      multi.del(REDIS.languages);
      for (const row of rows) {
        multi.hset(REDIS.translations(row.lang), row.key, JSON.stringify({ t: row.text, a: row.audioId }));
        multi.sadd(REDIS.languages, row.lang);
      }
      multi.incr(REDIS.version);
      await multi.exec();
    }
  } else if (redis !== null && redisOk) {
    // 2. Repli : l'instantané Redis laissé par une autre instance.
    const rows: Row[] = [];
    for (const lang of await redis.smembers(REDIS.languages)) {
      for (const [key, raw] of Object.entries(await redis.hgetall(REDIS.translations(lang)))) {
        const parsed = cachedTranslationSchema.safeParse(parse(raw));
        if (parsed.success) rows.push({ key, lang, text: parsed.data.t, audioId: parsed.data.a ?? null });
      }
    }
    install(rows);
    source = rows.length > 0 ? 'redis' : 'none';
  }
  log(`studio : ${studioSize()} phrase(s) validée(s) chargée(s) depuis ${source}`);

  // 3. Mises à jour à chaud publiées par le studio.
  if (redis !== null && redisOk) {
    const subscriber = redis.duplicate();
    await subscriber.subscribe(REDIS.channel);
    subscriber.on('message', (_channel: string, message: string) => {
      const event = catalogEventSchema.safeParse(parse(message));
      if (!event.success) return;
      const e = event.data;
      if (e.kind === 'delete') {
        deleteStudioTranslation(e.lang, e.key);
        return;
      }
      if (e.kind !== 'upsert') return;
      void redis.hget(REDIS.translations(e.lang), e.key).then((raw) => {
        const parsed = cachedTranslationSchema.safeParse(parse(raw));
        if (parsed.success && setStudioTranslation(e.lang, e.key, parsed.data.t, parsed.data.a ?? null)) log(`studio : ${e.lang} ${e.key} publié à chaud`);
      });
    });
    closers.push(async () => subscriber.disconnect());
  }

  // 4. Liste de travail : textes source des écrans, écrits par lots hors du chemin critique.
  const seen = new Set<string>();
  const pending = new Map<string, ReferenceDoc>();
  const flush = setInterval(() => {
    if (db === null || pending.size === 0) return;
    const batch = [...pending.values()];
    pending.clear();
    void db
      .collection<ReferenceDoc>(COLLECTIONS.references)
      .bulkWrite(
        batch.map((ref) => ({
          updateOne: {
            filter: { _id: ref._id },
            update: { $setOnInsert: { fr: ref.fr, context: ref.context, maxChars: ref.maxChars, discoveredAt: new Date() }, $addToSet: { channels: { $each: [...ref.channels] } } },
            upsert: true,
          },
        })),
        { ordered: false },
      )
      .catch((error: unknown) => log(`studio : références différées (${String(error)})`));
  }, 5_000);
  flush.unref();
  closers.push(async () => clearInterval(flush));

  const audioCache = new Map<string, Buffer>();
  return {
    source,
    async audio(id) {
      if (db === null || !/^[a-f0-9]{24}$/.test(id)) return null;
      const hit = audioCache.get(id);
      if (hit !== undefined) return hit;
      const { GridFSBucket, ObjectId } = await import('mongodb');
      const chunks: Buffer[] = [];
      try {
        for await (const chunk of new GridFSBucket(db, { bucketName: COLLECTIONS.audioBucket }).openDownloadStream(new ObjectId(id))) {
          if (Buffer.isBuffer(chunk)) chunks.push(chunk);
        }
      } catch {
        return null;
      }
      const data = Buffer.concat(chunks);
      audioCache.set(id, data);
      return data;
    },
    see(strings, channel) {
      for (const [key, entry] of Object.entries(strings)) {
        const id = `ui.${key}`;
        if (seen.has(id) || typeof entry.text !== 'string') continue;
        seen.add(id);
        pending.set(id, {
          _id: id,
          fr: entry.text,
          context: typeof entry.context === 'string' ? entry.context : null,
          maxChars: typeof entry.max_chars === 'number' ? entry.max_chars : null,
          channels: [channel],
        });
      }
    },
    async close() {
      for (const close of closers.reverse()) await close();
    },
  };
}
