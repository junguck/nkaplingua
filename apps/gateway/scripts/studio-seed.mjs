#!/usr/bin/env node
/** Amorce la base du studio depuis les catalogues du gateway : pnpm --filter @nkap/gateway studio:seed */
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/tools/studio-seed.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  external: ['mongodb'],
  logLevel: 'error',
});
const dir = mkdtempSync(path.join(root, '.seed-'));
const file = path.join(dir, 'seed.mjs');
writeFileSync(file, result.outputFiles[0].text);
try {
  const { main } = await import(pathToFileURL(file).href);
  process.exitCode = await main();
} finally {
  rmSync(dir, { recursive: true, force: true });
}
