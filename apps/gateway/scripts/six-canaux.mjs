#!/usr/bin/env node
/**
 * Preuve des six canaux : un tour réel par canal, à travers la sandbox SAFINUM.
 *
 *   SAFINUM_TEAM_KEY=sbx_… node scripts/six-canaux.mjs [--team 10] [--phone 2376…]
 *
 * Le script fait ce que le jury fera :
 *   1. déverrouille le simulateur de l'équipe (`POST /simulator/unlock`, PASS dans `apps/gateway/.env`) ;
 *   2. appelle `POST /channel/<canal>` pour les six canaux ouverts par la sandbox ;
 *   3. écrit `docs/preuves/six-canaux-<date>.json` (requête, statut, texte, intention, diagnostics).
 *
 * Le jeton du simulateur est un secret de session : il sert ici, il n'est jamais écrit sur disque
 * ni affiché. Le PASS n'est pas lu par ce script : il vient de `SAFINUM_SIMULATOR_PASS`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

loadEnvFile(new URL('../.env', import.meta.url));

const BASE = process.env.SAFINUM_API ?? 'https://safinum.cm/api/v1';
const KEY = process.env.SAFINUM_TEAM_KEY ?? '';
const PASS = process.env.SAFINUM_SIMULATOR_PASS ?? '';
const TEAM_ID = Number(process.env.SAFINUM_TEAM_PK ?? 10);
const PHONE = process.env.SAFINUM_PHONE ?? '237650626114';

if (!KEY) {
  console.error('SAFINUM_TEAM_KEY manquante (variable ou apps/gateway/.env).');
  process.exit(1);
}
if (!PASS) {
  console.error('SAFINUM_SIMULATOR_PASS manquante : le simulateur refuse les tours sans le PASS de l’équipe.');
  process.exit(1);
}

/** Un tour par canal, avec les paramètres que la sandbox attend réellement (vérifiés le 27/11). */
const TURNS = [
  { channel: 'ussd', body: { text: '', input_type: 'text' } },
  { channel: 'mobile', body: { screen: 'home', text: '', input_type: 'text', language: 'fr' } },
  { channel: 'web', body: { screen: 'home', text: '', input_type: 'text', language: 'fr' } },
  { channel: 'sms', body: { text: '', input_type: 'text' } },
  { channel: 'atm', body: { screen: 'atm_welcome', text: '' } },
  { channel: 'ivr', body: { text: '', input_type: 'text' } },
];

async function unlock() {
  const response = await fetch(`${BASE}/simulator/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ team_id: TEAM_ID, pass: PASS }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.token) {
    throw new Error(`déverrouillage ${response.status} : ${body.message ?? 'refusé'}`);
  }
  return body.token;
}

function summarize(channel, status, body) {
  const response = body.response ?? {};
  const text = response.text ?? body.say ?? body.screen ?? '';
  const strings = body.strings && typeof body.strings === 'object' ? Object.keys(body.strings).length : undefined;
  return {
    canal: channel,
    http: status,
    texte: String(text).replace(/\s+/g, ' ').trim().slice(0, 240),
    intention: body.interpretation?.intent ?? null,
    langue: body.interpretation?.language ?? body.language ?? null,
    statut: body.transaction?.status ?? null,
    sms: body.sms ?? null,
    strings,
    diagnostics: body.diagnostics ?? null,
    erreur: body.error ?? body.message ?? null,
    // Brut conservé pour diagnostiquer un 422 de la sandbox (champ manquant, écran inconnu).
    brut: JSON.stringify(body).slice(0, 1200),
  };
}

const token = await unlock();
const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'X-Team-Key': KEY,
  'X-Sandbox-Access': token,
};

const results = [];
for (const turn of TURNS) {
  const payload = { team_id: TEAM_ID, phone: PHONE, session_id: `six-${turn.channel}-${Date.now()}`, ...turn.body };
  try {
    const response = await fetch(`${BASE}/channel/${turn.channel}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    results.push({ ...summarize(turn.channel, response.status, body), requete: payload });
    console.log(
      `${turn.channel.padEnd(6)} ${String(response.status).padEnd(4)} ${summarize(turn.channel, response.status, body).texte.slice(0, 90)}`,
    );
  } catch (error) {
    results.push({ canal: turn.channel, http: 0, erreur: String(error), requete: payload });
    console.log(`${turn.channel.padEnd(6)} ERREUR ${String(error).slice(0, 90)}`);
  }
}

const now = new Date();
const stamp = now.toISOString().slice(0, 10);
const outDir = fileURLToPath(new URL('../../../docs/preuves/', import.meta.url));
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `six-canaux-${stamp}.json`);
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      genere_le: now.toISOString(),
      base: BASE,
      equipe: TEAM_ID,
      telephone: PHONE,
      canaux: results,
    },
    null,
    2,
  ),
);

const ok = results.filter((r) => r.http === 200).length;
console.log(`\n${ok}/${results.length} canaux ont répondu 200 · preuve écrite dans ${path.relative(process.cwd(), outFile)}`);
process.exit(ok === results.length ? 0 : 1);

/** Lit `apps/gateway/.env` sans dépendance : seules les variables absentes sont complétées. */
function loadEnvFile(url) {
  const file = fileURLToPath(url);
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!match || !match[1] || match[2] === undefined || line.trim().startsWith('#')) continue;
    if (process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
