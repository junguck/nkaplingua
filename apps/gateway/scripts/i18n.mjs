#!/usr/bin/env node
/**
 * Lance l'outil des packs de langue (src/tools/i18n-cli.ts) sans étape de build :
 * esbuild le compile en mémoire, avec les paquets TypeScript du monorepo.
 */
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/tools/i18n-cli.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
});
// Un niveau sous apps/gateway, comme dist/ : `new URL('../translations/', import.meta.url)` y pointe juste.
const dir = mkdtempSync(path.join(root, '.i18n-'));
const file = path.join(dir, 'cli.mjs');
writeFileSync(file, result.outputFiles[0].text);
const { main } = await import(pathToFileURL(file).href);
const code = main(process.argv.slice(2));
const { rmSync } = await import('node:fs');
rmSync(dir, { recursive: true, force: true });
process.exit(code);
