/**
 * Outil des packs de langue (jour J) :
 *   pnpm --filter @nkap/gateway i18n modele     → translations/_modele.json (toutes les clés à remplir)
 *   pnpm --filter @nkap/gateway i18n verifier   → couverture et problèmes de chaque pack ; code 1 si problème
 */
import fs from 'node:fs';
import path from 'node:path';
import { PACK_LOAD, USSD_ENGLISH, USSD_REFERENCE, isServedLanguage } from '../i18n.js';
import { auditPack, DEFAULT_PACK_DIR } from '../packs.js';
import { UI_DICTIONARIES } from '../ui-dictionaries.js';

const UI_REFERENCE: Readonly<Record<string, string>> = UI_DICTIONARIES.en ?? {};

export function modele(dir: string): string {
  const file = path.join(dir, '_modele.json');
  const body = {
    _lisez_moi:
      "Copiez ce fichier en <code>.json (dua, ewo, bas, bbj, byv), remplissez les valeurs vides. Gardez EXACTEMENT les emplacements {x}. " +
      "Une valeur vide = pas encore traduite. Puis : pnpm --filter @nkap/gateway i18n verifier",
    language: 'xxx',
    status: 'proposed',
    sources: ['Nom des locuteurs, ville, date de la session'],
    ui: Object.fromEntries(Object.keys(UI_REFERENCE).sort().map((k) => [k, ''])),
    ussd: Object.fromEntries(Object.keys(USSD_REFERENCE).sort().map((k) => [k, ''])),
    _reference_ui_anglais: UI_REFERENCE,
    _reference_ussd: Object.fromEntries(
      Object.entries(USSD_REFERENCE).map(([k, fr]) => [k, { fr, en: USSD_ENGLISH[k as keyof typeof USSD_ENGLISH] }]),
    ),
  };
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  return file;
}

export function verifier(): number {
  let failures = 0;
  for (const { file, reason } of PACK_LOAD.rejected) {
    failures += 1;
    console.log(`✗ ${file} refusé : ${reason}`);
  }
  for (const pack of PACK_LOAD.packs.values()) {
    const report = auditPack(pack, { ui: UI_REFERENCE, ussd: USSD_REFERENCE });
    const served = isServedLanguage(pack.language) ? 'SERVIE sur USSD' : 'USSD incomplet → réponses en fr';
    console.log(
      `${report.problems.length === 0 ? '✓' : '✗'} ${pack.language} (${pack.status}) — écrans ${report.ui.translated}/${report.ui.total}, ` +
        `USSD ${report.ussd.translated}/${report.ussd.total} : ${served}`,
    );
    for (const problem of report.problems) console.log(`    · ${problem}`);
    failures += report.problems.length;
  }
  if (PACK_LOAD.packs.size === 0 && PACK_LOAD.rejected.length === 0) console.log('Aucun pack dans translations/ (seuls fr, en, fub intégrés).');
  return failures === 0 ? 0 : 1;
}

export function main(args: readonly string[]): number {
  if (args[0] === 'modele') {
    console.log(`Modèle écrit : ${modele(DEFAULT_PACK_DIR)}`);
    return 0;
  }
  return verifier();
}
