/**
 * Outil des packs de langue (jour J) :
 *   pnpm --filter @nkap/gateway i18n modele     → translations/_modele.json (toutes les clés à remplir)
 *   pnpm --filter @nkap/gateway i18n fiche fub  → docs/relecture/fub.md (fiche à faire signer par 2 locuteurs)
 *   pnpm --filter @nkap/gateway i18n verifier   → couverture et problèmes de chaque pack ; code 1 si problème
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { intentCuesTable } from '@nkap/core';
import { PACK_LOAD, USSD_ENGLISH, USSD_REFERENCE, isServedLanguage, message, type GatewayLanguage } from '../i18n.js';
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

/**
 * Dossier des fiches de relecture : `docs/relecture/` à la racine du dépôt.
 * Le script est bundlé dans un dossier temporaire sous `apps/gateway/`, donc on remonte depuis le
 * répertoire courant jusqu'au dossier qui contient à la fois `docs/` et `packages/`.
 */
function sheetDir(): string {
  let current = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (fs.existsSync(path.join(current, 'docs')) && fs.existsSync(path.join(current, 'packages'))) {
      return path.join(current, 'docs', 'relecture');
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return fileURLToPath(new URL('../../../docs/relecture/', import.meta.url));
}

function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

/**
 * Fiche de relecture imprimable : ce que le middleware affiche aujourd'hui dans cette langue, avec
 * deux colonnes de verdict et une case de correction. Sert de support à la séance des deux locuteurs.
 * Aucune traduction n'est inventée ici : la fiche montre l'existant et laisse la décision aux locuteurs.
 */
export function fiche(language: GatewayLanguage): string {
  const dir = sheetDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${language}.md`);
  const pack = PACK_LOAD.packs.get(language);
  const catalog = (USSD_REFERENCE ?? {}) as Readonly<Record<string, string>>;
  const keys = Object.keys(catalog).sort();
  const phrases = keys.map((key) => ({
    key,
    fr: catalog[key] ?? '',
    texte: message(language, key as never),
  }));
  const traduites = phrases.filter((entry) => entry.texte !== entry.fr).length;

  const table = intentCuesTable();
  const mots: { intention: string; texte: string; poids: number }[] = [];
  for (const [intent, byLanguage] of Object.entries(table)) {
    for (const [texte, poids] of byLanguage[language as never] ?? []) {
      mots.push({ intention: intent, texte, poids });
    }
  }
  mots.sort((a, b) => a.intention.localeCompare(b.intention) || a.texte.localeCompare(b.texte));

  const lines: string[] = [];
  lines.push(`# Fiche de relecture — ${language}`);
  lines.push('');
  lines.push('> Document de travail à faire valider par **deux locuteurs distincts**, en séance, en présence du développeur.');
  lines.push('> Chaque ligne se lit à voix haute dans la langue ; les deux relecteurs donnent leur verdict séparément.');
  lines.push('> Une phrase refusée ou corrigée n’est **pas** publiée : elle revient en atelier, puis repasse en relecture.');
  lines.push('');
  lines.push('## Comment faire (30 à 45 minutes)');
  lines.push('');
  lines.push('1. Lire la colonne « texte proposé » sans l’accent français, et dire ce qu’un client comprendrait.');
  lines.push('2. Cocher **OK** si la phrase est naturelle et exacte ; sinon noter la correction dans la dernière colonne.');
  lines.push('3. Vérifier les **chiffres et les noms** : montants, numéros, frais ne doivent jamais être traduits.');
  lines.push('4. Une phrase USSD doit tenir en **182 caractères GSM-7** : pas de ɛ, ɔ, ŋ, ə ni d’apostrophe courbe à l’écran (le clavier ne les affiche pas).');
  lines.push('5. Signer en bas : nom, quartier/ville, date, et le nombre de phrases acceptées.');
  lines.push('');
  lines.push(`Statut du pack : ${pack === undefined ? 'aucun fichier `translations/' + language + '.json`' : '`' + pack.status + '`'}`);
  lines.push('');
  lines.push(`Provenance déclarée : ${pack === undefined || pack.sources.length === 0 ? 'à compléter' : pack.sources.join(' · ')}`);
  lines.push('');
  lines.push(`## 1. Phrases USSD (${traduites}/${phrases.length} déjà différentes du français)`);
  lines.push('');
  lines.push('| clé | français (référence) | texte proposé | L1 | L2 | correction retenue |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const phrase of phrases) {
    lines.push(`| \`${phrase.key}\` | ${cell(phrase.fr)} | ${cell(phrase.texte)} | OK / à corriger | OK / à corriger | |`);
  }
  lines.push('');
  lines.push(`## 2. Mots compris par le moteur (${mots.length})`);
  lines.push('');
  lines.push('| intention | mot | poids | L1 | L2 | correction retenue |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const mot of mots) {
    lines.push(`| ${mot.intention} | \`${cell(mot.texte)}\` | ${mot.poids} | OK / à corriger | OK / à corriger | |`);
  }
  lines.push('');
  lines.push('> Les mots s’ajoutent ou se corrigent ensuite sans code : `pnpm --filter @nkap/gateway lang mot ' + language + ' TRANSFER "<mot>" 3`.');
  lines.push('');
  lines.push('## 3. Signatures');
  lines.push('');
  lines.push('| | locuteur 1 | locuteur 2 |');
  lines.push('| --- | --- | --- |');
  lines.push('| nom | | |');
  lines.push('| ville / quartier | | |');
  lines.push('| téléphone | | |');
  lines.push('| date | | |');
  lines.push('| phrases acceptées / corrigées | | |');
  lines.push('| signature | | |');
  lines.push('');
  lines.push('Après la séance : reporter les corrections dans `translations/' + language + '.json` (ou dans la base de mots), passer `pnpm --filter @nkap/gateway i18n verifier`, puis `pnpm test`.');
  lines.push('');

  fs.writeFileSync(file, lines.join('\n'));
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
  if (args[0] === 'fiche') {
    const code = args[1];
    if (code === undefined) {
      console.error('usage : i18n fiche <code> (ex. i18n fiche fub)');
      return 1;
    }
    console.log(`Fiche écrite : ${fiche(code as GatewayLanguage)}`);
    return 0;
  }
  return verifier();
}
