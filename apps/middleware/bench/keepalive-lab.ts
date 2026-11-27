/**
 * Labo keep-alive : serveur HTTPS local derrière un relais TCP qui ajoute un délai fixe
 * dans chaque sens (RTT simulé). Tours espacés de 6 s comme un utilisateur USSD qui lit.
 *   kit  : keep-alive 4 s (défaut undici / fetch global) -> reconnexion TCP + TLS à chaque tour
 *   warm : pool NkapLingua (keep-alive 60 s + ping de maintien)
 * Usage : node bench/keepalive-lab.ts <rtt_ms> <tours> <ecart_ms>
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer as createHttps } from 'node:https';
import { createServer as createTcp, connect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent, request, type Dispatcher } from 'undici';

const rtt = Number(process.argv[2] ?? 100);
const turns = Number(process.argv[3] ?? 6);
const gap = Number(process.argv[4] ?? 6000);

const dir = mkdtempSync(join(tmpdir(), 'nkap-tls-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'ignore' });
const cert = readFileSync(join(dir, 'c.pem'));

const https = createHttps({ key: readFileSync(join(dir, 'k.pem')), cert }, (_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
});
await new Promise<void>((r) => https.listen(9443, '127.0.0.1', () => r()));

// Relais : chaque paquet attend rtt/2 dans chaque direction.
const half = rtt / 2;
const pipeDelayed = (from: Socket, to: Socket): void => {
  from.on('data', (chunk) => setTimeout(() => to.write(chunk), half));
  from.on('end', () => setTimeout(() => to.end(), half));
  from.on('error', () => to.destroy());
};
const relay = createTcp((client) => {
  const upstream = connect(9443, '127.0.0.1');
  pipeDelayed(client, upstream);
  pipeDelayed(upstream, client);
});
await new Promise<void>((r) => relay.listen(9444, '127.0.0.1', () => r()));

const tls = { ca: cert, servername: 'localhost' };
const kit: Dispatcher = new Agent({ keepAliveTimeout: 4_000, connect: tls });
const warm: Dispatcher = new Agent({ keepAliveTimeout: 60_000, connect: tls });
const URL_ = 'https://127.0.0.1:9444/api/v1/accounts/x';

async function once(d: Dispatcher): Promise<number> {
  const t = performance.now();
  const r = await request(URL_, { dispatcher: d });
  await r.body.dump();
  return performance.now() - t;
}
const ping = setInterval(() => void once(warm).catch(() => undefined), 2_000);
await once(kit);
await once(warm);

const k: number[] = [];
const w: number[] = [];
for (let i = 0; i < turns; i += 1) {
  await new Promise((r) => setTimeout(r, gap));
  k.push(await once(kit));
  w.push(await once(warm));
}
clearInterval(ping);
const med = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
console.log(JSON.stringify({ rtt_ms: rtt, turns, gap_ms: gap, kit_median_ms: Math.round(med(k)), warm_median_ms: Math.round(med(w)), saved_ms: Math.round(med(k) - med(w)), kit: k.map(Math.round), warm: w.map(Math.round) }));
await kit.close();
await warm.close();
relay.close();
https.close();
process.exit(0);
