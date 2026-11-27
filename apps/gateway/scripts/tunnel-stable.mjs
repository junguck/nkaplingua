#!/usr/bin/env node
/**
 * Tunnel supervisé pour la sandbox SAFINUM.
 *
 * Garde un tunnel cloudflared vivant, récupère l'URL publique, vérifie /health,
 * puis redéclare automatiquement cette URL sur les trois canaux (ussd, mobile, web).
 * Si le tunnel meurt (coupure, redémarrage), il est relancé et la nouvelle URL est
 * redéclarée : la sandbox n'a jamais à être mise à jour à la main.
 *
 * Usage :
 *   node scripts/tunnel-stable.mjs
 *
 * Variables optionnelles :
 *   SAFINUM_TEAM_KEY   sinon lue depuis ../.env
 *   SAFINUM_API        défaut https://safinum.cm/api/v1
 *   GATEWAY_URL        défaut http://127.0.0.1:8080
 *   TUNNEL_URL_FILE    fichier où écrire l'URL courante (défaut : $TEMP/nkaplingua-tunnel-url)
 *
 * Pour une URL *figée* (exigée le jour J), il faut un tunnel nommé Cloudflare
 * (cloudflared tunnel login + domaine) : voir docs/JOUR-J.md §2.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, '..', '.env');

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

const KEY = process.env.SAFINUM_TEAM_KEY || keyFromEnvFile(envPath);
const LOCAL = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8080';
const BASE = (process.env.SAFINUM_API ?? 'https://safinum.cm/api/v1').replace(/\/+$/, '');
const CHANNELS = ['ussd', 'mobile', 'web'];
const URL_FILE = process.env.TUNNEL_URL_FILE ?? path.join(process.env.TEMP ?? '/tmp', 'nkaplingua-tunnel-url');
const RESTART_DELAY_MS = 3_000;
const DECLARE_RETRY_MS = 10_000;

const log = (...parts) => console.log(new Date().toISOString(), ...parts);

if (!KEY) {
  console.error('SAFINUM_TEAM_KEY manquante (variable d’environnement ou app/gateway/.env).');
  process.exit(1);
}

let child = null;
let stopping = false;
let currentUrl = null;
const declaredFor = new Set();
let declaring = false;

async function localHealth() {
  const response = await fetch(`${LOCAL}/health`, { signal: AbortSignal.timeout(4_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function publicHealthy(url, attempts = 12) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) {
        const body = await response.json().catch(() => ({}));
        if (body.ok) return true;
      }
    } catch {
      /* tunnel encore en cours de montée */
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  return false;
}

/** Déclare l'URL sur les trois canaux. Renvoie true seulement si les trois sont acceptés. */
async function declare(url) {
  let allAccepted = true;
  for (const channel of CHANNELS) {
    try {
      const response = await fetch(`${BASE}/sandbox/endpoint`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Team-Key': KEY },
        body: JSON.stringify({ channel, url }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.json().catch(() => ({}));
      log(`declaration ${channel}: HTTP ${response.status} ${JSON.stringify(body).slice(0, 240)}`);
      if (!response.ok) allAccepted = false;
    } catch (error) {
      allAccepted = false;
      log(`declaration ${channel}: echec (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return allAccepted;
}

/**
 * Insiste jusqu'à ce que l'URL soit réellement enregistrée par la sandbox.
 * S'arrête si une nouvelle URL a pris la main entre-temps.
 */
async function ensureDeclared(url) {
  if (declaredFor.has(url) || declaring) return;
  declaring = true;
  try {
    for (let attempt = 1; !stopping; attempt += 1) {
      if (currentUrl !== url) {
        log('declaration abandonnee : une URL plus recente est arrivee');
        return;
      }
      log(`declaration tentative ${attempt} pour ${url}`);
      if (await declare(url)) {
        if (currentUrl !== url) return;
        declaredFor.add(url);
        log('URL declaree sur ussd, mobile et web');
        return;
      }
      log(`declaration incomplete, nouvel essai dans ${DECLARE_RETRY_MS / 1000} s`);
      await new Promise((resolve) => setTimeout(resolve, DECLARE_RETRY_MS));
    }
  } finally {
    declaring = false;
  }
}

async function onUrl(url) {
  currentUrl = url;
  log('URL publique :', url);
  try {
    fs.writeFileSync(URL_FILE, `${url}\n`, 'utf8');
    log('URL courante ecrite dans', URL_FILE);
  } catch (error) {
    log('impossible d’ecrire', URL_FILE, error instanceof Error ? error.message : String(error));
  }

  if (await publicHealthy(url)) {
    log('health OK via le tunnel');
    void ensureDeclared(url);
  } else {
    log('health KO via le tunnel : declaration reportee jusqu’a ce que le tunnel reponde');
    for (let attempt = 1; !stopping && currentUrl === url; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, DECLARE_RETRY_MS));
      if (stopping || currentUrl !== url) return;
      if (await publicHealthy(url, 4)) {
        log(`health OK apres ${attempt} nouvelle(s) tentative(s)`);
        void ensureDeclared(url);
        return;
      }
      log(`health toujours KO (essai ${attempt})`);
    }
  }
}

function startTunnel() {
  log('demarrage cloudflared…');
  child = spawn('cloudflared', ['tunnel', '--url', LOCAL, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';
  let handled = false;
  const onData = (chunk) => {
    buffer += chunk.toString();
    const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !handled) {
      handled = true;
      void onUrl(match[0]);
    }
  };

  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('error', (error) => {
    log('cloudflared introuvable ou impossible a lancer :', error.message);
  });

  child.on('exit', (code, signal) => {
    if (stopping) return;
    log(`cloudflared termine (code=${code} signal=${signal}) ; redemarrage dans ${RESTART_DELAY_MS} ms`);
    setTimeout(startTunnel, RESTART_DELAY_MS);
  });
}

function shutdown() {
  stopping = true;
  child?.kill('SIGTERM');
  log('arret demande');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  const health = await localHealth();
  log('gateway local OK', JSON.stringify(health));
} catch (error) {
  console.error(
    `Le middleware local ne repond pas sur ${LOCAL}/health (${error instanceof Error ? error.message : String(error)}).\n` +
      'Demarrez-le d’abord : cd apps/gateway && PORT=8080 HOST=127.0.0.1 node dist/server.js',
  );
  process.exit(1);
}

startTunnel();
