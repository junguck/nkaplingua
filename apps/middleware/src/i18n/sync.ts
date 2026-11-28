/**
 * Pipeline du catalogue au démarrage puis en continu.
 *
 *   Mongo (vérité, traductions validées)
 *     -> Redis (instantané partagé par toutes les instances, amorçage en millisecondes)
 *       -> L1 en mémoire (lu pendant les tours)
 *
 * Repli : si Mongo est absent, on démarre sur l'instantané Redis ; si les deux le sont,
 * sur la graine embarquée (français + anglais). Le service répond toujours.
 */

import type { Redis } from 'ioredis';
import type { Db } from 'mongodb';
import {
  COLLECTIONS,
  REDIS,
  cachedTranslationSchema,
  catalogEventSchema,
  foldRuleDocSchema,
  isLanguage,
  withOverrides,
  type FoldRules,
  type Language,
} from '@nkap/lingua-core';
import { Catalog, defaultRules, type TranslationRecord } from './catalog.ts';
import { EN, REFERENCES } from './messages.ts';

export type CatalogSource = 'mongo' | 'redis' | 'seed';

export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

export function seedRecords(): TranslationRecord[] {
  const fr = REFERENCES.map((ref): TranslationRecord => ({ key: ref.key, lang: 'fr', text: ref.fr }));
  const en = Object.entries(EN).map(([key, text]): TranslationRecord => ({ key, lang: 'en', text }));
  return [...fr, ...en];
}

interface MongoTranslation {
  readonly key: string;
  readonly lang: string;
  readonly text: string;
  readonly audioUrl?: string | null;
}

async function fromMongo(db: Db): Promise<{ records: TranslationRecord[]; rules: Map<Language, FoldRules> }> {
  const docs = await db
    .collection<MongoTranslation>(COLLECTIONS.translations)
    .find({}, { projection: { _id: 0, key: 1, lang: 1, text: 1, audioUrl: 1 } })
    .toArray();
  const records: TranslationRecord[] = [];
  for (const doc of docs) {
    if (isLanguage(doc.lang)) records.push({ key: doc.key, lang: doc.lang, text: doc.text, audioUrl: doc.audioUrl ?? null });
  }
  const rules = new Map<Language, FoldRules>();
  for (const raw of await db.collection(COLLECTIONS.foldRules).find({}, { projection: { _id: 0 } }).toArray()) {
    const parsed = foldRuleDocSchema.safeParse(raw);
    if (parsed.success) rules.set(parsed.data.lang, withOverrides(defaultRules(parsed.data.lang), parsed.data.letters, parsed.data.tones));
  }
  return { records, rules };
}

/** Écrit l'instantané dans Redis en une seule transaction (MULTI) : jamais d'état à moitié. */
async function publishSnapshot(redis: Redis, records: readonly TranslationRecord[], rulesDocs: readonly object[]): Promise<void> {
  const byLang = new Map<Language, Record<string, string>>();
  for (const record of records) {
    const hash = byLang.get(record.lang) ?? {};
    hash[record.key] = JSON.stringify({ t: record.text, a: record.audioUrl ?? null });
    byLang.set(record.lang, hash);
  }
  const multi = redis.multi();
  const previous = await redis.smembers(REDIS.languages);
  for (const lang of previous) multi.del(REDIS.translations(lang));
  multi.del(REDIS.languages, REDIS.rules);
  for (const [lang, hash] of byLang) {
    multi.hset(REDIS.translations(lang), hash);
    multi.sadd(REDIS.languages, lang);
  }
  for (const doc of rulesDocs) {
    const parsed = foldRuleDocSchema.safeParse(doc);
    if (parsed.success) multi.hset(REDIS.rules, parsed.data.lang, JSON.stringify(parsed.data));
  }
  multi.incr(REDIS.version);
  await multi.exec();
}

async function readLanguage(redis: Redis, lang: Language): Promise<TranslationRecord[]> {
  const hash = await redis.hgetall(REDIS.translations(lang));
  const out: TranslationRecord[] = [];
  for (const [key, raw] of Object.entries(hash)) {
    const parsed = cachedTranslationSchema.safeParse(safeJson(raw));
    if (parsed.success) out.push({ key, lang, text: parsed.data.t, audioUrl: parsed.data.a ?? null });
  }
  return out;
}

async function readRules(redis: Redis, lang: Language): Promise<FoldRules | null> {
  const raw = await redis.hget(REDIS.rules, lang);
  if (raw === null) return null;
  const parsed = foldRuleDocSchema.safeParse(safeJson(raw));
  return parsed.success ? withOverrides(defaultRules(lang), parsed.data.letters, parsed.data.tones) : null;
}

async function fromRedis(redis: Redis): Promise<Catalog | null> {
  const langs = (await redis.smembers(REDIS.languages)).filter(isLanguage);
  if (langs.length === 0) return null;
  const rules = new Map<Language, FoldRules>();
  const records: TranslationRecord[] = [];
  for (const lang of langs) {
    const rule = await readRules(redis, lang);
    if (rule !== null) rules.set(lang, rule);
    records.push(...(await readLanguage(redis, lang)));
  }
  return Catalog.from(records, rules);
}

export interface BootResult {
  readonly catalog: Catalog;
  readonly source: CatalogSource;
  readonly elapsedMs: number;
}

export async function bootCatalog(deps: { db: Db | null; redis: Redis | null; logger: Logger }): Promise<BootResult> {
  const started = performance.now();
  const { db, redis, logger } = deps;

  if (db !== null) {
    try {
      const { records, rules } = await fromMongo(db);
      if (records.length > 0) {
        if (redis !== null) {
          const rulesDocs = await db.collection(COLLECTIONS.foldRules).find({}, { projection: { _id: 0 } }).toArray();
          await publishSnapshot(redis, records, rulesDocs);
        }
        return { catalog: Catalog.from(records, rules), source: 'mongo', elapsedMs: performance.now() - started };
      }
      logger.warn({}, 'Mongo ne contient aucune traduction : lancez `pnpm seed`.');
    } catch (error) {
      logger.warn({ err: String(error) }, 'Mongo indisponible, repli sur Redis');
    }
  }

  if (redis !== null) {
    try {
      const catalog = await fromRedis(redis);
      if (catalog !== null) return { catalog, source: 'redis', elapsedMs: performance.now() - started };
    } catch (error) {
      logger.warn({ err: String(error) }, 'Redis indisponible, repli sur la graine');
    }
  }

  return { catalog: Catalog.from(seedRecords()), source: 'seed', elapsedMs: performance.now() - started };
}

/** Applique les validations du studio au L1, sans redémarrage. Renvoie la fonction d'arrêt. */
export async function followCatalog(subscriber: Redis, reader: Redis, catalog: Catalog, logger: Logger): Promise<() => Promise<void>> {
  await subscriber.subscribe(REDIS.channel);
  subscriber.on('message', (channel: string, message: string) => {
    if (channel !== REDIS.channel) return;
    const event = catalogEventSchema.safeParse(safeJson(message));
    if (!event.success) {
      logger.warn({ message: message.slice(0, 120) }, 'Événement catalogue ignoré (format)');
      return;
    }
    void apply(event.data);
  });

  async function apply(event: ReturnType<typeof catalogEventSchema.parse>): Promise<void> {
    switch (event.kind) {
      case 'upsert': {
        const raw = await reader.hget(REDIS.translations(event.lang), event.key);
        const parsed = cachedTranslationSchema.safeParse(safeJson(raw ?? ''));
        if (parsed.success) catalog.set({ key: event.key, lang: event.lang, text: parsed.data.t, audioUrl: parsed.data.a ?? null });
        break;
      }
      case 'delete':
        catalog.delete(event.lang, event.key);
        break;
      case 'reload':
        catalog.replaceLanguage(event.lang, await readLanguage(reader, event.lang));
        break;
      case 'rules': {
        const rules = await readRules(reader, event.lang);
        catalog.setRules(event.lang, rules ?? defaultRules(event.lang));
        break;
      }
    }
    logger.info({ event }, 'Catalogue mis à jour à chaud');
  }

  return async () => {
    await subscriber.unsubscribe(REDIS.channel);
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
