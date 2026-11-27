#!/usr/bin/env node
/**
 * Rejoue les dix scénarios standardisés du règlement (§7) sur la banque SIMULÉE, par le vrai
 * serveur HTTP du middleware, et produit une PREUVE par tour :
 *
 *   entrée · canal · intention · paramètres · statut · trace · temps de réponse
 *
 *   pnpm --filter @nkap/gateway build
 *   node apps/gateway/scripts/scenarios.mjs
 *   node apps/gateway/scripts/scenarios.mjs --out docs/preuves/jour-j.json
 *
 * Aucune clé réelle n'est utilisée : la banque de démonstration accepte `sbx_demo_local`.
 * Chaque scénario a sa propre session, donc les scénarios ne se marchent pas dessus.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const { createDemoServer } = await import(new URL('../dist/demo/server.js', import.meta.url).href);
const { createMiddlewareServer } = await import(new URL('../dist/server.js', import.meta.url).href);

const PHONE = '237699000003';
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? path.join(root, 'docs', 'preuves', `scenarios-${new Date().toISOString().slice(0, 10)}.json`) : path.resolve(root, args[outIndex + 1] ?? '');

const scenarios = [
  {
    id: '1-solde',
    titre: 'Consultation du solde (fulfulde, langue non précisée)',
    tours: [{ channel: 'ussd', language: null, text: 'Mi yiɗi anndude ceede am keddiiɗe' }],
  },
  {
    id: '2-transfert',
    titre: 'Transfert : récapitulatif puis confirmation au tour suivant',
    tours: [
      { channel: 'ussd', language: 'fr', text: 'Envoie 5000 à Aicha' },
      { channel: 'ussd', language: 'fr', text: '1' },
    ],
  },
  {
    id: '3-frais',
    titre: 'Frais pour 25 000 (valeur lue, pas devinée)',
    tours: [{ channel: 'ussd', language: 'fr', text: 'Combien de frais pour 25 000 ?' }],
  },
  {
    id: '4-correction',
    titre: 'Correction du montant avant exécution',
    tours: [
      { channel: 'ussd', language: 'fr', text: 'Envoie 5000 à Aicha' },
      { channel: 'ussd', language: 'fr', text: 'Non, 3000' },
    ],
  },
  {
    id: '5-beneficiaire-inconnu',
    titre: 'Bénéficiaire inconnu : on demande le numéro, rien n’est inventé',
    tours: [
      { channel: 'ussd', language: 'fr', text: 'Envoie 2000 à Moussa' },
      { channel: 'ussd', language: 'fr', text: '690000002' },
    ],
  },
  {
    id: '6-solde-insuffisant',
    titre: 'Solde insuffisant : explication, aucun débit',
    tours: [{ channel: 'ussd', language: 'fr', text: 'Envoie 300000 à Aicha' }],
  },
  {
    id: '7-changement-langue',
    titre: 'Changement de langue en cours d’opération',
    tours: [
      { channel: 'ussd', language: 'fr', text: 'Envoie 5000 à Aicha' },
      { channel: 'ussd', language: 'fr', text: 'Parle-moi en fulfulde' },
    ],
  },
  {
    id: '8-multicanal',
    titre: 'Même demande sur les trois canaux : même interprétation',
    // Une session par canal : on compare la COMPRÉHENSION, pas la continuité du dialogue.
    tours: [
      { channel: 'ussd', language: 'fr', text: 'Envoie 5000 à Aicha', session: 'preuve-8-ussd' },
      { channel: 'mobile', language: 'fr', text: 'Envoie 5000 à Aicha', session: 'preuve-8-mobile' },
      { channel: 'web', language: 'fr', text: 'Envoie 5000 à Aicha', session: 'preuve-8-web' },
    ],
  },
  {
    id: '9-historique',
    titre: 'Historique des opérations',
    tours: [{ channel: 'ussd', language: 'fr', text: 'Montre-moi mon historique' }],
  },
  {
    id: '10-terminologie',
    titre: 'Explication d’un terme (pidgin)',
    tours: [{ channel: 'ussd', language: 'wes', text: 'Wetin be charges?' }],
  },
];

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

const { server: bank } = createDemoServer({ teamKey: 'sbx_demo_local' });
const bankPort = await listen(bank);
const middleware = createMiddlewareServer({
  teamKey: 'sbx_demo_local',
  bankUrl: `http://127.0.0.1:${bankPort}/api/v1`,
  log: () => undefined,
});
const port = await listen(middleware);

async function turn({ channel, language, text, session: override }, scenarioId, index) {
  const trace = `${scenarioId}-t${index + 1}-${Math.random().toString(36).slice(2, 8)}`;
  const session = override ?? `preuve-${scenarioId}`;
  const body = {
    trace_id: trace,
    team_id: 'nkaplingua',
    channel,
    session_id: session,
    phone: PHONE,
    language,
    input: { type: 'text', text, ussd_text: text },
    constraints: { max_chars: 182, charset: 'gsm7', mode: 'menu', timeout_ms: 3000 },
  };
  const started = Date.now();
  const response = await fetch(`http://127.0.0.1:${port}/middleware/${channel}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Trace-Id': trace },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  const ms = Date.now() - started;
  return {
    tour: index + 1,
    entree: text,
    canal: channel,
    langue_demandee: language ?? 'null (détection)',
    http: response.status,
    intention: json.interpretation?.intent ?? '—',
    parametres: json.interpretation?.parameters ?? {},
    statut: (json.transaction?.status ?? '—') + (json.interpretation?.parameters?.error ? ` (${json.interpretation.parameters.error})` : ''),
    langue_reponse: json.interpretation?.language ?? '—',
    trace,
    ms,
    reponse: json.response?.text ?? JSON.stringify(json),
  };
}

const results = [];
for (const scenario of scenarios) {
  const tours = [];
  for (const [index, spec] of scenario.tours.entries()) tours.push(await turn(spec, scenario.id, index));
  results.push({ ...scenario, tours });
}

middleware.close();
bank.close();

const pad = (value, width) => (String(value).length >= width ? String(value) : String(value) + ' '.repeat(width - String(value).length));
const paramText = (params) => {
  const entries = Object.entries(params).filter(([key]) => key !== 'error' || true);
  return entries.length === 0 ? '—' : entries.map(([key, value]) => `${key}=${typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}`).join(' ');
};

console.log(pad('scénario', 26) + pad('entrée', 30) + pad('intention', 20) + pad('statut', 12) + pad('trace', 20) + 'ms');
console.log('-'.repeat(120));
let failures = 0;
for (const scenario of results) {
  for (const tour of scenario.tours) {
    if (tour.http !== 200) failures += 1;
    console.log(
      pad(scenario.id, 26) +
        pad(tour.entree.slice(0, 28), 30) +
        pad(String(tour.intention), 20) +
        pad(String(tour.statut), 12) +
        pad(String(tour.trace).slice(0, 18), 20) +
        String(tour.ms),
    );
  }
}

console.log('\nParamètres extraits (preuve que rien n’est deviné) :');
for (const scenario of results) {
  for (const tour of scenario.tours) console.log(`  ${scenario.id} t${tour.tour} : ${paramText(tour.parametres)}`);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify({ genere_le: new Date().toISOString(), banque: 'démonstration locale (sbx_demo_local)', telephone: PHONE, scenarios: results }, null, 2)}\n`);
console.log(`\nPreuve écrite : ${path.relative(root, outFile)}`);
console.log(failures === 0 ? '✓ 10 scénarios rejoués, tous les tours en HTTP 200' : `✗ ${failures} tour(s) hors HTTP 200`);
process.exit(failures === 0 ? 0 : 1);
