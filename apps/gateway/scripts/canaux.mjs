#!/usr/bin/env node
/**
 * Preuve par canal : un parcours réel sur CHAQUE canal servi, par le vrai serveur HTTP.
 *
 *   pnpm --filter @nkap/gateway build
 *   PORT=8080 ENABLE_V2_CHANNELS=1 node apps/gateway/dist/server.js      # terminal 1
 *   node apps/gateway/scripts/canaux.mjs                                 # terminal 2
 *   node apps/gateway/scripts/canaux.mjs --out docs/preuves/canaux.json
 *
 * Le script ne simule rien : il appelle `/middleware/ussd`, `/middleware/mobile`,
 * `/middleware/web`, `/ivr` et `/atm`, et enregistre pour chaque tour l'entrée, le statut HTTP,
 * la langue servie et la réponse brute. Un canal qui échoue fait sortir le script en code 1.
 *
 * Variables : GATEWAY_URL (défaut http://127.0.0.1:8080), GATEWAY_LANGUAGE (défaut fub pour les écrans).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const base = (process.env.GATEWAY_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');
const uiLanguage = process.env.GATEWAY_LANGUAGE ?? 'fub';
const PHONE = '237699000003';
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile =
  outIndex === -1
    ? path.join(root, 'docs', 'preuves', `canaux-${new Date().toISOString().slice(0, 10)}.json`)
    : path.resolve(root, args[outIndex + 1] ?? '');

const trace = (() => {
  let n = 0;
  return () => `preuve-${Date.now().toString(36)}-${(n += 1)}`;
})();

const session = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const STRINGS = {
  'nav.home': { text: 'Accueil', context: 'Onglet', max_chars: 12 },
  'nav.transfer': { text: 'Envoyer', context: 'Onglet', max_chars: 12 },
  'shell.greeting': { text: 'Bonjour {name}', max_chars: null },
  'home.balance_label': { text: 'Solde disponible', max_chars: null },
  'home.quick_actions': { text: 'Que voulez-vous faire ?', max_chars: null },
  'common.cancel': { text: 'Annuler', max_chars: 20 },
};

const results = [];

async function call(canal, label, url, body, interpret) {
  const started = Date.now();
  const response = await fetch(`${base}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Trace-Id': trace() },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  const ms = Date.now() - started;
  const detail = interpret(json);
  const entry = { canal, tour: label, url, entree: body, http: response.status, ms, ...detail, reponse: json };
  results.push(entry);
  const ok = response.status === 200 && detail.ok !== false;
  console.log(
    `${ok ? '✓' : '✗'} ${canal.padEnd(7)} ${String(label).padEnd(18)} HTTP ${response.status} · ${ms} ms · ${detail.resume ?? ''}`,
  );
  return entry;
}

function ussd(input, options = {}) {
  return {
    trace_id: `console-${Date.now().toString(36)}`,
    team_id: 'nkaplingua',
    channel: 'ussd',
    session_id: options.session ?? session('ussd'),
    phone: PHONE,
    language: options.language ?? null,
    input: { type: 'menu', text: input, ussd_text: input },
    constraints: { max_chars: 182, charset: 'gsm7', mode: 'menu', timeout_ms: 3000 },
  };
}

function ui(channel, language) {
  return {
    trace_id: `console-ui-${Date.now().toString(36)}`,
    team_id: 'nkaplingua',
    channel,
    type: 'ui_translation',
    session_id: session(channel),
    phone: PHONE,
    language,
    source_language: 'fr',
    screen: 'home',
    strings: STRINGS,
    constraints: { max_chars: null, charset: 'utf8', mode: 'ui_translation', timeout_ms: 10000 },
  };
}

async function main() {
  console.log(`Canaux testés sur ${base}\n`);

  // 1. USSD : solde.
  await call('ussd', 'solde', '/middleware/ussd', ussd('1'), (json) => ({
    intention: json.interpretation?.intent,
    langue: json.interpretation?.language,
    resume: json.response?.text?.split('\n')[0],
    ok: json.interpretation?.intent === 'BALANCE_INQUIRY',
  }));

  // 2. USSD : transfert + changement de langue pendant la confirmation (le bug historique).
  const transferSession = session('ussd-lang');
  await call('ussd', 'transfert', '/middleware/ussd', ussd('Envoie 5000 à Aicha Njoya', { session: transferSession }), (json) => ({
    intention: json.interpretation?.intent,
    resume: json.interpretation?.intent,
    ok: json.interpretation?.intent === 'TRANSFER',
  }));
  await call('ussd', 'langue en confirm.', '/middleware/ussd', ussd('parle-moi en fulfulde', { session: transferSession }), (json) => ({
    intention: json.interpretation?.intent,
    langue: json.interpretation?.language,
    resume: json.response?.text?.split('\n')[0],
    ok: json.interpretation?.intent === 'LANGUAGE_SWITCH' && json.interpretation?.language === 'fub',
  }));

  // 3. Mobile et 4. Web : traduction d'écran.
  for (const channel of ['mobile', 'web']) {
    await call(channel, 'écran', `/middleware/${channel}`, ui(channel, uiLanguage), (json) => ({
      intention: 'UI_TRANSLATION',
      langue: json.language,
      resume: Object.keys(json.strings ?? {}).length + ' chaînes',
      ok: json.language === uiLanguage && Object.keys(json.strings ?? {}).length === Object.keys(STRINGS).length,
    }));
  }

  // 5. IVR : menu puis solde.
  const callId = session('ivr');
  await call('ivr', 'menu', '/ivr', { call_id: callId, phone: PHONE, input: { digits: '' } }, (json) => ({
    langue: json.language,
    resume: json.say?.split('\n')[0],
    ok: json.channel === 'ivr' && json.end === false,
  }));
  await call('ivr', 'solde', '/ivr', { call_id: callId, phone: PHONE, input: { digits: '1' } }, (json) => ({
    langue: json.language,
    resume: json.say,
    ok: json.say?.includes('solde'),
  }));

  // 6. ATM : carte, code, solde.
  const atmSession = session('atm');
  await call('atm', 'carte', '/atm', { session_id: atmSession, card: PHONE, language: 'fr', input: { digits: '' } }, (json) => ({
    langue: json.language,
    resume: json.screen,
    ok: json.state?.step === 'pin',
  }));
  await call('atm', 'code', '/atm', { session_id: atmSession, card: PHONE, language: 'fr', input: { digits: '1234' } }, (json) => ({
    langue: json.language,
    resume: json.screen?.split('\n')[0],
    ok: json.state?.step === 'menu',
  }));
  await call('atm', 'solde', '/atm', { session_id: atmSession, card: PHONE, language: 'fr', input: { digits: '2' } }, (json) => ({
    langue: json.language,
    resume: json.screen,
    ok: json.receipt?.kind === 'balance',
  }));

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const ok = results.every((entry) => entry.http === 200 && entry.ok !== false);
  fs.writeFileSync(
    outFile,
    `${JSON.stringify({ base, date: new Date().toISOString(), ok, tours: results }, null, 2)}\n`,
  );
  console.log(`\nPreuve écrite : ${path.relative(root, outFile)}`);
  if (!ok) {
    console.error('✗ au moins un canal a échoué : voir les tours marqués ✗ ci-dessus.');
    process.exit(1);
  }
  console.log(`✓ ${results.length} tours, ${new Set(results.map((entry) => entry.canal)).size} canaux, tous en HTTP 200`);
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
