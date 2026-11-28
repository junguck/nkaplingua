/**
 * Délai entre la publication d'une validation (ce que fait le studio : HSET + PUBLISH sur Redis)
 * et le moment où le gateway sert la phrase sur un écran. 50 essais.
 *
 * Prérequis : gateway démarré avec REDIS_URL. Usage : node bench/publish.ts [url_du_gateway]
 */
import { Redis } from 'ioredis';
import { request } from 'undici';
import { z } from 'zod';

const gateway = process.argv[2] ?? 'http://127.0.0.1:8080/';
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
const replySchema = z.object({ language: z.string(), strings: z.record(z.string()) });
const KEY = 'common.back';

async function served(): Promise<string | undefined> {
  const res = await request(gateway, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trace_id: 'bench', channel: 'mobile', type: 'ui_translation', screen: 'bench', language: 'bas', source_language: 'fr', strings: { [KEY]: { text: 'Retour', context: 'Bouton', max_chars: 20 } } }),
  });
  const parsed = replySchema.safeParse(await res.body.json());
  return parsed.success && parsed.data.language === 'bas' ? parsed.data.strings[KEY] : undefined;
}

const samples: number[] = [];
for (let i = 0; i < 50; i += 1) {
  const text = `essai ${i}`;
  const started = performance.now();
  await redis
    .multi()
    .hset('i18n:t:bas', `ui.${KEY}`, JSON.stringify({ t: text, a: null }))
    .publish('i18n:changed', JSON.stringify({ kind: 'upsert', lang: 'bas', key: `ui.${KEY}` }))
    .exec();
  while ((await served()) !== text) {
    // Attente active bornée : on mesure le délai réel de diffusion, sans jamais boucler sans fin.
    if (performance.now() - started > 5_000) throw new Error('phrase non servie en 5 s : diffusion en panne');
  }
  samples.push(performance.now() - started);
}
await redis.hdel('i18n:t:bas', `ui.${KEY}`);
await redis.publish('i18n:changed', JSON.stringify({ kind: 'delete', lang: 'bas', key: `ui.${KEY}` }));
samples.sort((a, b) => a - b);
const q = (p: number): number => Number((samples[Math.floor(p * (samples.length - 1))] ?? 0).toFixed(2));
console.log(JSON.stringify({ n: samples.length, p50_ms: q(0.5), p95_ms: q(0.95), max_ms: q(1), at: new Date().toISOString() }));
redis.disconnect();
