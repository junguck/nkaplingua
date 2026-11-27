/**
 * Coût de lecture des traductions pour UN écran mobile de 40 clés.
 *   kit     : readFileSync + JSON.parse à chaque requête (comportement du kit officiel)
 *   redis   : un HGET par clé (Redis local, le meilleur cas réseau)
 *   redis-m : un HMGET pour tout l'écran
 *   l1      : notre catalogue en mémoire
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Redis } from 'ioredis';
import { Catalog } from '../src/i18n/catalog.ts';

const KEYS = Array.from({ length: 40 }, (_, i) => `ui.key.${i}`);
const DICT = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`ui.key.${i}`, `Texte traduit numéro ${i} avec {amount}`]));
const ITER = Number(process.argv[2] ?? 2000);

const dir = mkdtempSync(join(tmpdir(), 'nkap-'));
const file = join(dir, 'en.json');
writeFileSync(file, JSON.stringify(DICT));
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
await redis.del('bench:en');
await redis.hset('bench:en', DICT);
const catalog = Catalog.from(Object.entries(DICT).map(([key, text]) => ({ key, lang: 'en' as const, text })));

async function time(label: string, fn: () => Promise<number> | number): Promise<{ mode: string; per_screen_us: number }> {
  for (let i = 0; i < 50; i += 1) await fn();
  const start = performance.now();
  let sink = 0;
  for (let i = 0; i < ITER; i += 1) sink += await fn();
  const us = ((performance.now() - start) / ITER) * 1000;
  if (sink < 0) console.log(sink);
  return { mode: label, per_screen_us: Number(us.toFixed(2)) };
}

const results = [
  await time('kit (readFileSync + JSON.parse)', () => {
    const d: Record<string, string> = JSON.parse(readFileSync(file, 'utf8'));
    return KEYS.filter((k) => d[k] !== undefined).length;
  }),
  await time('redis (HGET par clé)', async () => {
    let n = 0;
    for (const k of KEYS) if ((await redis.hget('bench:en', k)) !== null) n += 1;
    return n;
  }),
  await time('redis (HMGET groupé)', async () => (await redis.hmget('bench:en', ...KEYS)).filter((v) => v !== null).length),
  await time('L1 mémoire (NkapLingua v3)', () => KEYS.filter((k) => catalog.text('en', k, false) !== undefined).length),
];
console.log(JSON.stringify({ keys_per_screen: KEYS.length, iterations: ITER, at: new Date().toISOString(), results }, null, 2));
await redis.del('bench:en');
redis.disconnect();
