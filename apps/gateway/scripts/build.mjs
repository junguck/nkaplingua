#!/usr/bin/env node
/**
 * Build déployable du middleware : un fichier par point d'entrée, paquets du monorepo inclus.
 * Les paquets `@nkap/*` sont publiés en TypeScript source ; `tsc` seul produirait un `dist/`
 * qui ne démarre pas. esbuild les compile et les embarque — aucune dépendance npm à l'exécution.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

await build({
  absWorkingDir: root,
  entryPoints: { server: 'src/server.ts', 'demo/server': 'src/demo/server.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
});
// `public/console.html` est lu à `../public` depuis `dist/` : rien à copier.
