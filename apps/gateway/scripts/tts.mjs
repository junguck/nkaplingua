#!/usr/bin/env node
/**
 * Voix du canal téléphonique : catalogue des phrases puis synthèse MMS-TTS.
 *
 *   pnpm --filter @nkap/gateway tts              # tout : catalogue + WAV + index.json
 *   pnpm --filter @nkap/gateway tts catalogue    # seulement le catalogue (aucun téléchargement)
 *
 * Prérequis : Python avec `torch` et `transformers` (voir docs/VOIX-MMS.md). Le premier appel
 * télécharge `facebook/mms-tts-fra` et `facebook/mms-tts-eng` (~150 Mo chacun, mis en cache).
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);

const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/tools/tts-cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
});

// Un niveau sous apps/gateway, comme dist/ : `../audio` y pointe juste.
const dir = mkdtempSync(path.join(root, '.tts-'));
const file = path.join(dir, 'cli.mjs');
writeFileSync(file, result.outputFiles[0].text);
const { main } = await import(pathToFileURL(file).href);
const code = main(args);
rmSync(dir, { recursive: true, force: true });

if (code !== 0 || args[0] === 'catalogue') process.exit(code);

const python = process.env.PYTHON ?? 'python';
const audio = path.join(root, 'audio');
const run = spawnSync(python, [path.join(root, 'scripts', 'tts_mms.py'), path.join(audio, '_jobs.json'), audio], {
  stdio: 'inherit',
});
if (run.error) {
  console.error(`\nImpossible de lancer « ${python} » : ${run.error.message}`);
  console.error('Installez torch + transformers (docs/VOIX-MMS.md) ou renseignez PYTHON=…');
  process.exit(1);
}
process.exit(run.status ?? 1);
