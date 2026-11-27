#!/usr/bin/env node
/**
 * Rejoue tous les écrans mobile, web et ATM sur la sandbox SAFINUM.
 *
 *   SAFINUM_TEAM_KEY=sbx_… node scripts/ecrans.mjs [--langue en] [--canal atm]
 *
 * Le script fait ce que le jury fera : déverrouille le simulateur une seule fois (quota de
 * tentatives), puis appelle `POST /channel/<canal>` avec le `screen` attendu. Il écrit
 * `docs/preuves/ecrans-<langue>-<date>.json` : statut, langue rendue, rapport de traduction de la sandbox
 * (`translated`, `missing`, `over_limit`, `placeholder_errors`) et textes source, pour que chaque
 * clé manquante soit une preuve et non une impression.
 *
 * Le jeton du simulateur n'est jamais écrit ni affiché ; le PASS vient de l'environnement.
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

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
}
const LANGUAGE = option('langue', 'en');
const ONLY = option('canal', '');

if (!KEY) {
  console.error('SAFINUM_TEAM_KEY manquante (variable ou apps/gateway/.env).');
  process.exit(1);
}
if (!PASS) {
  console.error('SAFINUM_SIMULATOR_PASS manquante : le simulateur refuse les tours sans le PASS.');
  process.exit(1);
}

/** Écrans déclarés par la sandbox (docs/SANDBOX-SAFINUM.md §11). */
const UI_SCREENS = ['home', 'transfer', 'pay', 'review', 'receipt', 'history'];
const ATM_SCREENS = [
  'atm_welcome',
  'atm_pin',
  'atm_menu',
  'atm_amount',
  'atm_confirm',
  'atm_cash',
  'atm_receipt',
  'atm_statement',
  'atm_balance',
  'atm_other',
  'atm_end',
];

const TURNS = [
  ...['mobile', 'web'].flatMap((channel) =>
    UI_SCREENS.map((screen) => ({ channel, screen, body: { screen, text: '', input_type: 'text', language: LANGUAGE } })),
  ),
  ...ATM_SCREENS.map((screen) => ({ channel: 'atm', screen, body: { screen, text: '', language: LANGUAGE } })),
].filter((turn) => ONLY === '' || turn.channel === ONLY);

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

/** Le rapport de traduction de la sandbox est la seule mesure qui compte. */
function reportOf(body) {
  const report = body.translation?.report;
  return report === undefined
    ? null
    : {
        total: report.total ?? null,
        translated: report.translated ?? null,
        missing: report.missing ?? [],
        untranslated: report.untranslated ?? [],
        over_limit: report.over_limit ?? [],
        placeholder_errors: report.placeholder_errors ?? [],
        unknown_keys: report.unknown_keys ?? [],
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
  const payload = {
    team_id: TEAM_ID,
    phone: PHONE,
    session_id: `ecrans-${turn.channel}-${turn.screen}-${Date.now()}`,
    ...turn.body,
  };
  try {
    const response = await fetch(`${BASE}/channel/${turn.channel}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    const report = reportOf(body);
    results.push({
      canal: turn.channel,
      ecran: turn.screen,
      http: response.status,
      langue: body.translation?.language ?? body.language ?? null,
      erreur: body.error ?? body.message ?? null,
      code: body.diagnostics?.error_code ?? null,
      detail: body.diagnostics?.error_detail ?? null,
      rapport: report,
      source: body.translation?.source ?? null,
      textes: body.translation?.strings ?? null,
      requete: payload,
    });
    const line =
      `${turn.channel.padEnd(6)} ${turn.screen.padEnd(14)} ${String(response.status).padEnd(4)} ` +
      `langue=${String(body.translation?.language ?? body.language ?? '-')} ` +
      `traduit=${report ? `${report.translated}/${report.total}` : '-'} ` +
      `manquant=${report ? report.missing.length : '-'} ` +
      `code=${body.diagnostics?.error_code ?? '-'}`;
    console.log(line);
    // La sandbox renvoie parfois des objets (`{key, length, max}`) : les afficher lisibles.
    const lisible = (list) =>
      list.map((entry) => (typeof entry === 'string' ? entry : `${entry.key} (${entry.length}>${entry.max})`)).join(', ');
    if (report && report.missing.length > 0) console.log(`   missing: ${lisible(report.missing)}`);
    if (report && report.over_limit.length > 0) console.log(`   over_limit: ${lisible(report.over_limit)}`);
    if (report && report.placeholder_errors.length > 0) console.log(`   placeholders: ${lisible(report.placeholder_errors)}`);
  } catch (error) {
    results.push({ canal: turn.channel, ecran: turn.screen, http: 0, erreur: String(error), requete: payload });
    console.log(`${turn.channel.padEnd(6)} ${turn.screen.padEnd(14)} ERREUR ${String(error).slice(0, 120)}`);
  }
}

const now = new Date();
const stamp = now.toISOString().slice(0, 10);
const outDir = fileURLToPath(new URL('../../../docs/preuves/', import.meta.url));
fs.mkdirSync(outDir, { recursive: true });
// La langue fait partie du nom : une campagne `en` ne doit pas écraser une campagne `fub`.
const outFile = path.join(outDir, `ecrans-${LANGUAGE}-${stamp}.json`);
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      genere_le: now.toISOString(),
      base: BASE,
      equipe: TEAM_ID,
      telephone: PHONE,
      langue_demandee: LANGUAGE,
      ecrans: results,
    },
    null,
    2,
  ),
);

const ok = results.filter((r) => r.http === 200).length;
const complete = results.filter((r) => r.rapport !== null && r.rapport.missing.length === 0).length;
console.log(
  `\n${ok}/${results.length} écrans en 200 · ${complete} sans clé manquante · ` +
    `preuve écrite dans ${path.relative(process.cwd(), outFile)}`,
);
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
