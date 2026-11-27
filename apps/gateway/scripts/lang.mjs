#!/usr/bin/env node
/**
 * Lance l'outil de la base de mots (src/tools/lang-cli.ts) sans étape de build :
 * esbuild le compile en mémoire, avec les paquets TypeScript du monorepo.
 *
 *   pnpm --filter @nkap/gateway lang liste
 *   pnpm --filter @nkap/gateway lang mot dua TRANSFER "loma" 3
 */
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/tools/lang-cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
});
// Un niveau sous apps/gateway, comme dist/ : `new URL('../data/langues.json', import.meta.url)` y pointe juste.
const dir = mkdtempSync(path.join(root, '.lang-'));
const file = path.join(dir, 'cli.mjs');
writeFileSync(file, result.outputFiles[0].text);
const { main } = await import(pathToFileURL(file).href);
const code = main(process.argv.slice(2));
rmSync(dir, { recursive: true, force: true });
process.exit(code);
