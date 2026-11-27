#!/usr/bin/env node
/**
 * Tunnel NOMMÉ (URL figée) pour le jour J.
 *
 * Contrairement au quick tunnel (`tunnel-stable.mjs`), l'URL ne change jamais : elle est
 * attachée à un tunnel Cloudflare créé une fois pour toutes, sur un domaine que vous possédez.
 * Le jour J, il suffit donc de lancer ce script : aucune redéclaration manuelle, et un
 * redémarrage ne casse pas le lien déjà envoyé au jury.
 *
 * Ce que le script fait :
 *   1. vérifie que le middleware local répond sur GATEWAY_URL ;
 *   2. lance `cloudflared tunnel run` (jeton ou nom + configuration) ;
 *   3. vérifie que l'URL PUBLIQUE répond sur /health ;
 *   4. déclare cette URL sur les trois canaux (ussd, mobile, web) — une seule fois, puisque
 *      l'URL ne bouge pas — et s'arrête si l'un des trois est refusé.
 *
 * Préparation (une fois, par un humain) : voir docs/TUNNEL-NOMME.md.
 *
 * Usage :
 *   CLOUDFLARE_TUNNEL_TOKEN=… node scripts/tunnel-named.mjs
 *   CLOUDFLARE_TUNNEL=mon-tunnel PUBLIC_URL=https://nkap.exemple.cm node scripts/tunnel-named.mjs
 *
 * Variables :
 *   PUBLIC_URL               URL publique figée (obligatoire pour la déclaration)
 *   CLOUDFLARE_TUNNEL_TOKEN  jeton du tunnel (Cloudflare → Zero Trust → Tunnels)
 *   CLOUDFLARE_TUNNEL        nom du tunnel (si vous utilisez un certificat local, pas un jeton)
 *   GATEWAY_URL              défaut http://127.0.0.1:8080
 *   SAFINUM_TEAM_KEY         sinon lue depuis ../.env
 *   DECLARE=0                lance le tunnel sans toucher aux canaux
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function keyFromEnvFile(file) {
  try {
    const line = fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('SAFINUM_TEAM_KEY='));
    return line ? line.slice('SAFINUM_TEAM_KEY='.length).trim() : '';
  } catch {
    return '';
  }
}

const KEY = process.env.SAFINUM_TEAM_KEY || keyFromEnvFile(path.join(here, '..', '.env'));
const LOCAL = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8080';
const PUBLIC = (process.env.PUBLIC_URL ?? '').replace(/\/+$/, '');
const TOKEN = process.env.CLOUDFLARE_TUNNEL_TOKEN ?? '';
const NAME = process.env.CLOUDFLARE_TUNNEL ?? '';
const BASE = (process.env.SAFINUM_API ?? 'https://safinum.cm/api/v1').replace(/\/+$/, '');
const DECLARE = process.env.DECLARE !== '0';
const CHANNELS = ['ussd', 'mobile', 'web'];

const log = (...parts) => console.log(new Date().toISOString(), ...parts);

if (!TOKEN && !NAME) {
  console.error(
    'Aucun tunnel fourni.\n' +
      '  · jeton : CLOUDFLARE_TUNNEL_TOKEN=… node scripts/tunnel-named.mjs\n' +
      '  · nom   : CLOUDFLARE_TUNNEL=mon-tunnel node scripts/tunnel-named.mjs\n' +
      'Préparation complète : docs/TUNNEL-NOMME.md',
  );
  process.exit(1);
}
if (DECLARE && !PUBLIC) {
  console.error('PUBLIC_URL manquante : c’est l’URL figée du tunnel (ex. https://nkap.exemple.cm).');
  process.exit(1);
}
if (DECLARE && !KEY) {
  console.error('SAFINUM_TEAM_KEY manquante (variable d’environnement ou apps/gateway/.env).');
  process.exit(1);
}

async function localHealth() {
  const response = await fetch(`${LOCAL}/health`, { signal: AbortSignal.timeout(4_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function publicHealthy(attempts = 20) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${PUBLIC}/health`, { signal: AbortSignal.timeout(6_000) });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok) return true;
    } catch {
      /* le tunnel monte encore, ou le DNS se propage */
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return false;
}

async function declare() {
  let failures = 0;
  for (const channel of CHANNELS) {
    try {
      const response = await fetch(`${BASE}/sandbox/endpoint`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Team-Key': KEY },
        body: JSON.stringify({ channel, url: PUBLIC }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json().catch(() => ({}));
      log(`declaration ${channel}: HTTP ${response.status} ${JSON.stringify(body).slice(0, 200)}`);
      if (!response.ok) failures += 1;
    } catch (error) {
      failures += 1;
      log(`declaration ${channel}: echec (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return failures === 0;
}

try {
  log('tunnel nomme :', NAME || '(jeton)');
  log('middleware local :', LOCAL);
  log('health local', JSON.stringify(await localHealth()));
} catch (error) {
  console.error(
    `Le middleware local ne repond pas sur ${LOCAL}/health (${error instanceof Error ? error.message : String(error)}).\n` +
      'Demarrez-le d’abord : cd apps/gateway && PORT=8080 HOST=127.0.0.1 node dist/server.js',
  );
  process.exit(1);
}

const args = TOKEN
  ? ['tunnel', '--no-autoupdate', 'run', '--token', TOKEN]
  : ['tunnel', '--no-autoupdate', 'run', NAME];

log('demarrage cloudflared…');
const child = spawn('cloudflared', args, { stdio: ['ignore', 'inherit', 'inherit'] });

let stopping = false;
const shutdown = () => {
  stopping = true;
  child.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

child.on('error', (error) => {
  console.error('cloudflared introuvable ou impossible a lancer :', error.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  log(`cloudflared termine (code=${code} signal=${signal})`);
  if (!stopping) process.exit(code ?? 1);
});

if (DECLARE) {
  if (await publicHealthy()) {
    log('health OK via', PUBLIC);
    const ok = await declare();
    if (ok) log('URL figee declaree sur ussd, mobile et web — plus rien a faire');
    else {
      log('declaration incomplete : relancez ce script (l’URL ne change pas, rien n’est casse)');
      process.exitCode = 2;
    }
  } else {
    log(`health KO via ${PUBLIC} : verifiez le DNS et la route du tunnel (docs/TUNNEL-NOMME.md)`);
    process.exitCode = 2;
  }
}

log('tunnel en cours — Ctrl+C pour arreter');
