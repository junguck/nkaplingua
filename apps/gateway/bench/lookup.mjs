#!/usr/bin/env node
/** Traduction d'un écran mobile de 40 clés par le gateway (dictionnaires + couche studio en mémoire). */
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const entry = `
import { translate } from './src/ui.js';
import { UI_DICTIONARIES } from './src/ui-dictionaries.js';
import { setStudioTranslation } from './src/studio-catalog.js';
export function run(iterations) {
  const keys = Object.keys(UI_DICTIONARIES.en ?? {}).slice(0, 40);
  const screen = Object.fromEntries(keys.map((k) => [k, { text: 'Texte source ' + k, context: 'bench', max_chars: null }]));
  for (const k of keys.slice(0, 10)) setStudioTranslation('en', 'ui.' + k, 'Validated ' + k);
  for (let i = 0; i < 500; i += 1) translate(screen, 'en');
  const t = performance.now();
  for (let i = 0; i < iterations; i += 1) translate(screen, 'en');
  return { keys_per_screen: keys.length, iterations, per_screen_us: Number((((performance.now() - t) / iterations) * 1000).toFixed(2)) };
}`;
const result = await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error' });
const dir = mkdtempSync(path.join(root, '.lang-bench-'));
const file = path.join(dir, 'bench.mjs');
writeFileSync(file, result.outputFiles[0].text);
try {
  const { run } = await import(pathToFileURL(file).href);
  console.log(JSON.stringify({ ...run(Number(process.argv[2] ?? 5000)), at: new Date().toISOString() }));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
