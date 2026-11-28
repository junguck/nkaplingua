/**
 * Latence réseau réelle vers la sandbox, tours espacés comme un vrai utilisateur USSD.
 *
 *   kit   : réglage par défaut d'undici (celui du fetch global) : keep-alive 4 s.
 *   warm  : notre pool : keep-alive 60 s + ping de maintien toutes les 20 s.
 *   cold  : connexion neuve à chaque appel (référence : DNS + TCP + TLS à chaque fois).
 *
 * Usage : node bench/network.ts [appels=8] [ecart_ms=6000]
 * Les réponses 401 suffisent : on mesure le transport, pas la logique bancaire.
 */

import { EnvHttpProxyAgent, Agent, request, type Dispatcher } from 'undici';
import { createWarmPool } from '../src/bank/dispatcher.ts';

const URL_UNDER_TEST = 'https://safinum.cm/api/v1/fees?type=transfer&amount=5000';
const calls = Number(process.argv[2] ?? 8);
const gapMs = Number(process.argv[3] ?? 6000);
const proxied = Boolean(process.env.HTTPS_PROXY ?? process.env.https_proxy);

function make(opts: ConstructorParameters<typeof Agent>[0]): Dispatcher {
  return proxied ? new EnvHttpProxyAgent(opts) : new Agent(opts);
}

async function once(dispatcher: Dispatcher): Promise<number> {
  const started = performance.now();
  const res = await request(URL_UNDER_TEST, { dispatcher, headers: { 'x-team-key': 'sbx_bench_only', accept: 'application/json' } });
  await res.body.dump();
  return performance.now() - started;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function stats(label: string, samples: readonly number[]): Record<string, string | number> {
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  return { mode: label, n: sorted.length, p50_ms: Math.round(pick(0.5)), p95_ms: Math.round(pick(0.95)), mean_ms: Math.round(mean), min_ms: Math.round(sorted[0] ?? 0) };
}

async function run(): Promise<void> {
  const kit = make({ keepAliveTimeout: 4_000 });
  const pool = createWarmPool({ origin: 'https://safinum.cm', keepAliveMs: 60_000, warmIntervalMs: 2_000 });
  await pool.warm();
  await once(kit);

  const kitSamples: number[] = [];
  const warmSamples: number[] = [];
  const coldSamples: number[] = [];

  for (let i = 0; i < calls; i += 1) {
    await sleep(gapMs);
    kitSamples.push(await once(kit));
    warmSamples.push(await once(pool.dispatcher));
    const fresh = make({});
    coldSamples.push(await once(fresh));
    await fresh.close();
  }

  const report = {
    target: URL_UNDER_TEST,
    proxied,
    gap_ms: gapMs,
    at: new Date().toISOString(),
    results: [stats('kit (keep-alive 4 s)', kitSamples), stats('warm (pool chaud)', warmSamples), stats('cold (connexion neuve)', coldSamples)],
    raw: { kit: kitSamples.map(Math.round), warm: warmSamples.map(Math.round), cold: coldSamples.map(Math.round) },
  };
  console.log(JSON.stringify(report, null, 2));
  await kit.close();
  await pool.close();
}

await run();
