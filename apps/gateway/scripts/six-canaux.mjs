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

/** Bénéficiaire de test pour les parcours (compte documenté de la sandbox). */
const BENEF = process.env.SAFINUM_BENEF ?? '237653397927';

/**
 * Parcours par fonctionnalité, rejoués avec `--parcours`. Chaque parcours garde sa session ;
 * `balanceAvant`/`balance` relisent le solde dans une session neuve, jamais dans une valeur supposée.
 */
const PARCOURS = [
  { id: 'solde', canal: 'ussd', tours: ['1'] },
  { id: 'frais', canal: 'ussd', tours: ['3', '25000'] },
  { id: 'historique', canal: 'ussd', tours: ['4'] },
  { id: 'aide', canal: 'ussd', tours: ['7', '1'] },
  { id: 'langue', canal: 'ussd', tours: ['8', '3'] },
  { id: 'credit', canal: 'ussd', tours: ['5', '1', '1000', '1'] },
  { id: 'facture', canal: 'ussd', tours: ['6', '1', '123456789', '1000', '1'] },
  { id: 'transfert-confirme', canal: 'ussd', tours: ['2', BENEF, '5000', '1'], balanceAvant: true, balance: true },
  { id: 'transfert-annule', canal: 'ussd', tours: ['2', BENEF, '5000', '2'], balanceAvant: true, balance: true },
  { id: 'sms-solde', canal: 'sms', tours: ['1'] },
  { id: 'ivr-solde', canal: 'ivr', tours: ['1'] },
];

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
  for (let essai = 0; essai < 6; essai += 1) {
    const response = await fetch(`${BASE}/simulator/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ team_id: TEAM_ID, pass: PASS }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.token) return body.token;
    if (response.status !== 429) {
      throw new Error(`déverrouillage ${response.status} : ${body.message ?? 'refusé'}`);
    }
    console.log('   429 déverrouillage, reprise dans 3 s');
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error('déverrouillage 429 : quota du simulateur toujours épuisé après plusieurs reprises');
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

let parcoursOk = 0;
let parcoursTotal = 0;
let parcoursLances = false;
if (process.argv.includes('--parcours')) {
  parcoursLances = true;
  const parcoursResults = [];
  for (const scenario of PARCOURS) {
    const session = `parcours-${scenario.id}-${Date.now()}`;
    const tours = [];
    const soldeAvant = scenario.balanceAvant ? await lireSolde(headers) : null;
    for (const text of scenario.tours) {
      tours.push(await jouer(headers, scenario.canal, text, session));
    }
    const solde = scenario.balance ? await lireSolde(headers) : null;
    parcoursResults.push({
      id: scenario.id,
      canal: scenario.canal,
      entrees: scenario.tours,
      solde_avant: soldeAvant,
      solde_apres: solde,
      tours,
    });
    const dernier = tours[tours.length - 1];
    console.log(
      `${scenario.id.padEnd(20)} ${String(dernier?.http ?? 0).padEnd(4)} ` +
        `${String(dernier?.texte ?? '').slice(0, 80)}` +
        (soldeAvant !== null || solde !== null ? `  (${soldeAvant ?? '?'} → ${solde ?? '?'})` : ''),
    );
    // Laisse respirer la fenêtre de quota du simulateur entre deux parcours.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  parcoursOk = parcoursResults.filter((p) => p.tours.every((t) => t.http === 200)).length;
  parcoursTotal = parcoursResults.length;
  const parcoursFile = path.join(outDir, `parcours-${stamp}.json`);
  fs.writeFileSync(
    parcoursFile,
    JSON.stringify(
      { genere_le: now.toISOString(), base: BASE, equipe: TEAM_ID, telephone: PHONE, beneficiaire: BENEF, parcours: parcoursResults },
      null,
      2,
    ),
  );
  console.log(
    `\n${parcoursOk}/${parcoursTotal} parcours ont répondu 200 · preuve écrite dans ${path.relative(process.cwd(), parcoursFile)}`,
  );
}

process.exit(ok === results.length && (!parcoursLances || parcoursOk === parcoursTotal) ? 0 : 1);

/** Un tour de parcours, même contrat que les canaux, avec le résumé qui sert à la capture. */
async function jouer(headers, channel, text, session) {
  const payload = { team_id: TEAM_ID, phone: PHONE, session_id: session, text, input_type: 'text', language: 'fr' };
  // Le simulateur limite les appels par fenêtre (`429`). On attend la fenêtre suivante au lieu de
  // perdre le parcours : la preuve doit être complète, pas trouée.
  let response;
  let body = {};
  for (let essai = 0; essai < 16; essai += 1) {
    response = await fetch(`${BASE}/channel/${channel}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    body = await response.json().catch(() => ({}));
    if (response.status !== 429) break;
    console.log(`   429 ${channel}, reprise dans 3 s`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return {
    entree: text,
    http: response.status,
    texte: String(body.response?.text ?? body.say ?? body.screen ?? body.error ?? '').replace(/\s+/g, ' ').trim(),
    intention: body.interpretation?.intent ?? null,
    langue: body.interpretation?.language ?? body.language ?? null,
    statut: body.transaction?.status ?? null,
    reference: body.transaction?.id ?? null,
    sms: body.sms ?? null,
    code: body.diagnostics?.error_code ?? null,
    ms: body.diagnostics?.duration_ms ?? null,
  };
}

/** Solde relu par un vrai tour USSD dans une session neuve. */
async function lireSolde(headers) {
  const tour = await jouer(headers, 'ussd', '1', `parcours-solde-${Date.now()}`);
  const found = tour.texte.match(/([\d\s]+)\s*FCFA/);
  return found ? Number(found[1].replace(/\s/g, '')) : null;
}

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
