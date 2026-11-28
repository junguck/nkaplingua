#!/usr/bin/env node
/**
 * Build déployable du middleware : un fichier par point d'entrée, paquets du monorepo inclus.
 * Les paquets `@nkap/*` sont publiés en TypeScript source ; `tsc` seul produirait un `dist/`
 * qui ne démarre pas. esbuild les compile et les embarque — aucune dépendance npm à l'exécution.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

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
  // Chargés à la demande, seulement si MONGO_URL / REDIS_URL sont définis.
  external: ['mongodb', 'ioredis'],
  // undici (connexion bancaire chaude) est en CommonJS : on lui fournit un `require` natif.
  banner: { js: "import { createRequire as __nkapRequire } from 'node:module'; const require = __nkapRequire(import.meta.url);" },
  logLevel: 'info',
});
// Garde les packs de langues avec l'artefact : le gateway peut ainsi être déployé depuis dist seul.
const translations = path.join(root, 'translations');
if (fs.existsSync(translations)) {
  const packagedTranslations = path.join(root, 'dist', 'translations');
  fs.rmSync(packagedTranslations, { recursive: true, force: true });
  fs.cpSync(translations, packagedTranslations, { recursive: true });
}
// `public/console.html` est une ressource de l'interface et reste servie depuis le paquet source.
