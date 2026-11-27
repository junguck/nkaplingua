/** Délai « validation publiée » -> « phrase servie par le middleware » (Redis pub/sub), 50 essais. */
import { Redis } from 'ioredis';
import { request } from 'undici';
import { z } from 'zod';

const healthSchema = z.object({ catalog: z.object({ keys: z.record(z.number()) }) });

const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
const samples: number[] = [];
const keysOf = async (): Promise<number> => {
  const r = await request('http://127.0.0.1:8080/health');
  const parsed = healthSchema.safeParse(await r.body.json());
  return parsed.success ? (parsed.data.catalog.keys.ybb ?? 0) : 0;
};
for (let i = 0; i < 50; i += 1) {
  const before = await keysOf();
  const t = performance.now();
  await redis.multi().hset('i18n:t:ybb', `bench.${i}`, JSON.stringify({ t: 'bench' })).publish('i18n:changed', JSON.stringify({ kind: 'upsert', lang: 'ybb', key: `bench.${i}` })).exec();
  while ((await keysOf()) === before) { /* attente active */ }
  samples.push(performance.now() - t);
}
for (let i = 0; i < 50; i += 1) await redis.publish('i18n:changed', JSON.stringify({ kind: 'delete', lang: 'ybb', key: `bench.${i}` }));
await redis.del('i18n:t:ybb');
samples.sort((a, b) => a - b);
console.log(JSON.stringify({ n: 50, p50_ms: Number(samples[25]?.toFixed(2)), p95_ms: Number(samples[47]?.toFixed(2)), max_ms: Number(samples[49]?.toFixed(2)) }));
redis.disconnect();
