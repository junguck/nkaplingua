#!/usr/bin/env node
/**
 * Petit outil pour brancher le middleware sur la sandbox SAFINUM, sans dépendance.
 *
 *   SAFINUM_TEAM_KEY=sbx_... SAFINUM_TEAM_ID=nkaplingua \
 *   node scripts/safinum.mjs declare https://mon-tunnel.example
 *
 *   node scripts/safinum.mjs status                # ce que la sandbox a enregistré
 *   node scripts/safinum.mjs turn ussd ""          # premier tour USSD
 *   node scripts/safinum.mjs turn ussd "1"         # choix 1 du menu
 *   node scripts/safinum.mjs ui web                # écran web (ui_translation)
 */

const BASE = process.env.SAFINUM_API ?? 'https://safinum.cm/api/v1';
const KEY = process.env.SAFINUM_TEAM_KEY ?? '';
const TEAM = process.env.SAFINUM_TEAM_ID ?? 'nkaplingua';
const PHONE = process.env.SAFINUM_PHONE ?? '237699000003';
const CHANNELS = ['ussd', 'mobile', 'web'];

const [command, ...args] = process.argv.slice(2);

if (!KEY) {
  console.error('SAFINUM_TEAM_KEY manquante. Exemple : SAFINUM_TEAM_KEY=sbx_... node scripts/safinum.mjs status');
  process.exit(1);
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
    trace_id: `local-${Date.now()}`,
    team_id: TEAM,
    channel,
    session_id: `cli-${Date.now()}`,
    phone: PHONE,
    language: process.env.SAFINUM_LANGUAGE ?? null,
    input: { type: 'text', text, ussd_text: text },
    constraints: { max_chars: 182, charset: 'gsm7', mode: 'menu', timeout_ms: 3000 },
  };
  const result = await call('POST', `/channel/${channel}`, payload);
  console.log(result.status, JSON.stringify(result.body, null, 2));
}

async function ui(channel) {
  const payload = {
    trace_id: `local-ui-${Date.now()}`,
    team_id: TEAM,
    channel,
    type: 'ui_translation',
    session_id: `cli-ui-${Date.now()}`,
    phone: PHONE,
    language: process.env.SAFINUM_LANGUAGE ?? 'fub',
    source_language: 'fr',
    screen: 'home',
    strings: {
      'nav.home': { text: 'Accueil', context: 'Onglet', max_chars: 12 },
      'home.balance_label': { text: 'Solde disponible', max_chars: null },
      'home.quick_actions': { text: 'Que voulez-vous faire ?', max_chars: null },
      'shell.greeting': { text: 'Bonjour {name}', max_chars: null },
    },
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
