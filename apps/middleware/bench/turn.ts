/**
 * Latence d'un tour USSD « solde » (menu puis 1), mesurée côté passerelle.
 * Même banque simulée pour les deux. Usage : node bench/turn.ts <url> <n> [nom]
 */
import { Agent, request } from 'undici';

const url = process.argv[2] ?? 'http://127.0.0.1:8080/';
const n = Number(process.argv[3] ?? 300);
const name = process.argv[4] ?? url;
const agent = new Agent({ keepAliveTimeout: 60_000 });
const body = (session: string, text: string): string =>
  JSON.stringify({ trace_id: `b-${session}-${text}`, channel: 'ussd', session_id: session, phone: '237699000001', language: 'en', input: { type: 'text', text }, bank_api: { base_url: 'http://127.0.0.1:8788/api/v1' } });

async function post(payload: string): Promise<number> {
  const t = performance.now();
  const r = await request(url, { method: 'POST', dispatcher: agent, headers: { 'content-type': 'application/json' }, body: payload });
  await r.body.dump();
  return performance.now() - t;
}
const samples: number[] = [];
for (let i = 0; i < n + 30; i += 1) {
  await post(body(`${name}-${i}`, ''));
  const ms = await post(body(`${name}-${i}`, '1'));
  if (i >= 30) samples.push(ms);
}
samples.sort((a, b) => a - b);
const q = (p: number): number => Number((samples[Math.floor(p * (samples.length - 1))] ?? 0).toFixed(2));
console.log(JSON.stringify({ target: name, n, p50_ms: q(0.5), p95_ms: q(0.95), p99_ms: q(0.99) }));
await agent.close();
