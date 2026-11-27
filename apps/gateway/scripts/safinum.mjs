#!/usr/bin/env node
/**
 * Petit outil pour brancher le middleware sur la sandbox SAFINUM, sans dépendance.
 *
 *   SAFINUM_TEAM_KEY=sbx_... SAFINUM_TEAM_ID=shun-and-co \
 *   node scripts/safinum.mjs declare https://mon-tunnel.example
 *
 *   node scripts/safinum.mjs status                # ce que la sandbox a enregistré
 *   node scripts/safinum.mjs turn ussd ""          # premier tour USSD
 *   node scripts/safinum.mjs turn ussd "1"         # choix 1 du menu
 *   node scripts/safinum.mjs ui web                # écran web (ui_translation)
 *
 * Les commandes `turn` réutilisent SAFINUM_SESSION_ID (ou une session stable dérivée du numéro)
 * afin que plusieurs invocations puissent poursuivre le même dialogue USSD.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

loadLocalEnv();

const BASE = process.env.SAFINUM_API ?? 'https://safinum.cm/api/v1';
const KEY = process.env.SAFINUM_TEAM_KEY ?? '';
const TEAM = process.env.SAFINUM_TEAM_ID ?? '';
const PHONE = process.env.SAFINUM_PHONE ?? '';
const SESSION_ID = process.env.SAFINUM_SESSION_ID ?? `nkaplingua-cli-${PHONE}`;
const CHANNELS = ['ussd', 'mobile', 'web'];

const [command, ...args] = process.argv.slice(2);

if (!KEY) {
  console.error('SAFINUM_TEAM_KEY manquante. Exemple : SAFINUM_TEAM_KEY=sbx_... node scripts/safinum.mjs status');
  process.exit(1);
}

if (['turn', 'ui'].includes(command) && (!TEAM || !PHONE)) {
  console.error('SAFINUM_TEAM_ID et SAFINUM_PHONE doivent être définis dans apps/gateway/.env ou dans l’environnement.');
  process.exit(1);
}

function loadLocalEnv() {
  const file = fileURLToPath(new URL('../.env', import.meta.url));
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!match || match[1] === undefined || match[2] === undefined || line.trim().startsWith('#')) continue;
    if (process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function call(method, path, body) {
  return fetch(BASE + path, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Team-Key': KEY },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => ({})) }));
}

async function declare(url) {
  for (const channel of CHANNELS) {
    const result = await call('POST', '/sandbox/endpoint', { channel, url });
    console.log(`${channel.padEnd(6)} ${result.status} ${JSON.stringify(result.body)}`);
  }
}

async function status() {
  const result = await call('GET', '/sandbox/endpoint');
  console.log(result.status, JSON.stringify(result.body, null, 2));
}

async function turn(channel, text) {
  const payload = {
    team_id: TEAM,
    session_id: SESSION_ID,
    phone: PHONE,
    language: process.env.SAFINUM_LANGUAGE ?? null,
    text,
    input_type: 'text',
    scenario_key: process.env.SAFINUM_SCENARIO,
    strict_gsm7: channel === 'ussd',
  };
  const result = await call('POST', `/channel/${channel}`, payload);
  console.log(result.status, JSON.stringify(result.body, null, 2));
}

async function ui(channel) {
  const payload = {
    team_id: TEAM,
    session_id: `cli-ui-${Date.now()}`,
    phone: PHONE,
    language: process.env.SAFINUM_LANGUAGE ?? 'fub',
    screen: 'home',
    scenario_key: process.env.SAFINUM_SCENARIO,
  };
  const result = await call('POST', `/channel/${channel}`, payload);
  console.log(result.status, JSON.stringify(result.body, null, 2));
}

switch (command) {
  case 'declare':
    if (!args[0]) {
      console.error('URL publique manquante : node scripts/safinum.mjs declare https://…');
      process.exit(1);
    }
    await declare(args[0]);
    break;
  case 'status':
    await status();
    break;
  case 'turn':
    await turn(args[0] ?? 'ussd', args[1] ?? '');
    break;
  case 'ui':
    await ui(args[0] ?? 'web');
    break;
  default:
    console.log('Commandes : declare <url> | status | turn <ussd|mobile|web> <texte> | ui <mobile|web>');
}
