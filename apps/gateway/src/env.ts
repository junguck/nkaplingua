/**
 * Lecture minimale du fichier .env (même format que le kit officiel, aucune dépendance).
 *
 * Deux emplacements sont lus : le répertoire courant (utile quand on lance `node dist/server.js`
 * depuis `apps/gateway`) et le dossier du paquet (utile depuis la racine du monorepo). Les
 * variables déjà définies dans l'environnement gardent la priorité.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadEnv(file?: string): void {
  const candidates = file
    ? [file]
    : [path.join(process.cwd(), '.env'), fileURLToPath(new URL('../.env', import.meta.url))];

  for (const candidate of candidates) read(candidate);
}

function read(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!match) continue;
    const key = match[1];
    const raw = match[2];
    if (key === undefined || raw === undefined) continue;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
  }
}
