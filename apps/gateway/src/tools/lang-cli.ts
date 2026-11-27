/**
 * Outil de la base de mots (langues et vocabulaire) — la porte d'entrée SANS code.
 *
 *   pnpm --filter @nkap/gateway lang                      → aide + état de la base
 *   pnpm --filter @nkap/gateway lang liste                → langues, mots reconnus, packs, repli
 *   pnpm --filter @nkap/gateway lang ajouter dua --nom Duala --alias douala
 *   pnpm --filter @nkap/gateway lang mot dua TRANSFER "loma" 3
 *   pnpm --filter @nkap/gateway lang mot-outil dua "na" 1
 *   pnpm --filter @nkap/gateway lang supprimer dua "loma"
 *   pnpm --filter @nkap/gateway lang alias dua "douala"
 *   pnpm --filter @nkap/gateway lang exporter dua         → la langue vient désormais du fichier
 *   pnpm --filter @nkap/gateway lang tester "mi yiɗi ceede am"
 *   pnpm --filter @nkap/gateway lang verifier             → code 1 si un problème
 *
 * Aucune commande n'écrit un fichier invalide : la base est vérifiée AVANT d'être enregistrée,
 * et un refus affiche la liste exacte des problèmes.
 */

import { INTENTS, LANGUAGES, LANGUAGE_INFO, type LanguageCode } from '@nkap/contracts';
import { clearWordBase, functionWordsOf, intentCuesOf, intentCuesTable, interpret, MAX_WEIGHT, MIN_WEIGHT } from '@nkap/core';
import {
  applyWordDb,
  checkDbProblems,
  emptyDb,
  readDb,
  toWordBase,
  wordDbPath,
  writeDb,
  type DbLanguage,
  type Word,
  type WordDb,
} from '../word-base.js';
import { languageCatalog } from '../language-catalog.js';

const USAGE = `Base de mots NkapLingua — ${wordDbPath()}

  lang liste                          état des langues (mots reconnus, pack, repli)
  lang ajouter <code> [--nom X] [--alias a,b]
  lang mot <code> <INTENTION> "<mot>" [poids ${MIN_WEIGHT}-${MAX_WEIGHT}]
  lang mot-outil <code> "<mot>" [poids ${MIN_WEIGHT}-${MAX_WEIGHT}]
  lang supprimer <code> "<mot>"
  lang alias <code> "<nom>" ["<nom>" …]
  lang exporter <code>                la langue vient de la base (remplace le lexique intégré)
  lang tester "<phrase>"              langue détectée + intention + paramètres
  lang verifier                       contrôles, code 1 si problème`;

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function fail(message: string): number {
  console.error(`✗ ${message}`);
  return 1;
}

function weightOf(raw: string | undefined): number | string {
  if (raw === undefined) return 3;
  const weight = Number(raw);
  if (!Number.isInteger(weight) || weight < MIN_WEIGHT || weight > MAX_WEIGHT) {
    return `poids invalide : « ${raw} » (attendu : entier ${MIN_WEIGHT}–${MAX_WEIGHT})`;
  }
  return weight;
}

function isLanguage(code: string): code is LanguageCode {
  return (LANGUAGES as readonly string[]).includes(code);
}

/** Refuse d'écrire une base que le moteur refuserait : le contrat est le même des deux côtés. */
function save(db: WordDb, action: string): number {
  const problems = checkDbProblems(db);
  if (problems.length > 0) return fail(`base refusée, rien n'a été écrit :\n- ${problems.join('\n- ')}`);
  const file = writeDb(db);
  console.log(`✓ ${action} → ${file}`);
  return 0;
}

function loadForWrite(): { db: WordDb } | { error: string } {
  const load = readDb();
  if (load.problems.length > 0) return { error: `base existante invalide :\n- ${load.problems.join('\n- ')}` };
  return { db: load.exists ? load.db : emptyDb() };
}

function entryOf(db: WordDb, code: string): DbLanguage {
  return db.langues[code] ?? {};
}

function withEntry(db: WordDb, code: string, entry: DbLanguage): WordDb {
  return { ...db, langues: { ...db.langues, [code]: entry } };
}

function liste(): number {
  const applied = applyWordDb();
  if (!applied.ok) console.log(`⚠ base de mots ignorée (${applied.problems.length} problème(s)) — lancez « lang verifier »`);
  const catalog = languageCatalog();
  console.log(pad('langue', 8) + pad('nom', 14) + pad('mots', 6) + pad('pack', 12) + pad('écrans', 10) + 'USSD');
  console.log('-'.repeat(60));
  for (const entry of catalog) {
    console.log(
      pad(entry.code, 8) +
        pad(entry.nom, 14) +
        pad(String(entry.mots), 6) +
        pad(entry.pack, 12) +
        pad(entry.ecrans, 10) +
        entry.ussd,
    );
  }
  const db = readDb().db;
  const codes = Object.keys(db.langues);
  console.log(
    codes.length === 0
      ? '\nBase vide : ajoutez une langue avec « lang ajouter <code> », puis des mots avec « lang mot ».'
      : `\nLangues dans la base : ${codes.join(', ')}`,
  );
  return 0;
}

function ajouter(args: readonly string[]): number {
  const code = args[0];
  if (code === undefined) return fail('code de langue manquant (ex. « lang ajouter dua »)');
  if (!isLanguage(code)) return fail(`langue inconnue : « ${code} » (connues : ${LANGUAGES.join(', ')})`);
  const loaded = loadForWrite();
  if ('error' in loaded) return fail(loaded.error);
  if (code in loaded.db.langues) return fail(`« ${code} » est déjà dans la base : utilisez « lang mot », « lang alias » ou « lang exporter »`);

  const nom = flag(args, '--nom');
  const alias = (flag(args, '--alias') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');
  const entry: DbLanguage = {
    nom: nom ?? LANGUAGE_INFO[code].nativeName,
    ...(alias.length === 0 ? {} : { alias }),
    remplace: false,
    sources: ['À compléter : locuteur, ville, date de la session'],
    mots_outils: [],
    mots: {},
  };
  return save(withEntry(loaded.db, code, entry), `langue « ${code} » ajoutée`);
}

function addMot(args: readonly string[], outil: boolean): number {
  const [code, intentionOrWord, wordOrWeight, maybeWeight] = args;
  if (code === undefined) return fail('code de langue manquant');
  if (!isLanguage(code)) return fail(`langue inconnue : « ${code} » (connues : ${LANGUAGES.join(', ')})`);
  const text = outil ? intentionOrWord : wordOrWeight;
  if (text === undefined || text.trim() === '') return fail('mot manquant');
  const rawWeight = outil ? wordOrWeight : maybeWeight;
  const weight = weightOf(rawWeight);
  if (typeof weight === 'string') return fail(weight);
  const intention: string | null = outil ? null : intentionOrWord ?? null;
  if (intention !== null && !(INTENTS as readonly string[]).includes(intention)) {
    return fail(`intention inconnue : « ${intention} » (connues : ${INTENTS.join(', ')})`);
  }

  const loaded = loadForWrite();
  if ('error' in loaded) return fail(loaded.error);
  const entry = entryOf(loaded.db, code);
  const cue: Word = [text.trim(), weight];

  if (outil) {
    const list = [...(entry.mots_outils ?? [])];
    if (list.some(([existing]) => existing.toLowerCase() === cue[0].toLowerCase())) return fail(`« ${cue[0]} » est déjà un mot-outil de ${code}`);
    const next: DbLanguage = { ...entry, mots_outils: [...list, cue] };
    return save(withEntry(loaded.db, code, next), `mot-outil « ${cue[0]} » (${weight}) ajouté à ${code}`);
  }

  const mots = { ...(entry.mots ?? {}) };
  const list = [...(mots[intention as string] ?? [])];
  if (list.some(([existing]) => existing.toLowerCase() === cue[0].toLowerCase())) {
    return fail(`« ${cue[0]} » est déjà un mot de ${intention} pour ${code}`);
  }
  mots[intention as string] = [...list, cue];
  const next: DbLanguage = { ...entry, mots };
  return save(withEntry(loaded.db, code, next), `${intention} ← « ${cue[0]} » (${weight}) pour ${code}`);
}

function supprimer(args: readonly string[]): number {
  const [code, text] = args;
  if (code === undefined || text === undefined) return fail('usage : lang supprimer <code> "<mot>"');
  const loaded = loadForWrite();
  if ('error' in loaded) return fail(loaded.error);
  const entry = entryOf(loaded.db, code);
  const target = text.toLowerCase();
  const motsOutils = (entry.mots_outils ?? []).filter(([existing]) => existing.toLowerCase() !== target);
  const mots: Record<string, readonly Word[]> = {};
  let removed = (entry.mots_outils?.length ?? 0) - motsOutils.length;
  for (const [intent, cues] of Object.entries(entry.mots ?? {})) {
    const kept = cues.filter(([existing]) => existing.toLowerCase() !== target);
    removed += cues.length - kept.length;
    if (kept.length > 0) mots[intent] = kept;
  }
  if (removed === 0) {
    return fail(
      `« ${text} » n'est pas dans la base pour ${code}. S'il vient du lexique intégré, lancez d'abord « lang exporter ${code} », puis supprimez-le.`,
    );
  }
  const next: DbLanguage = { ...entry, mots_outils: motsOutils, mots };
  return save(withEntry(loaded.db, code, next), `« ${text} » retiré de ${code} (${removed} entrée(s))`);
}

function alias(args: readonly string[]): number {
  const [code, ...names] = args;
  if (code === undefined) return fail('usage : lang alias <code> "<nom>" …');
  if (!isLanguage(code)) return fail(`langue inconnue : « ${code} »`);
  if (names.length === 0) return fail('aucun nom fourni');
  const loaded = loadForWrite();
  if ('error' in loaded) return fail(loaded.error);
  const entry = entryOf(loaded.db, code);
  const current = [...(entry.alias ?? [])];
  for (const name of names) {
    if (!current.some((existing) => existing.toLowerCase() === name.toLowerCase())) current.push(name);
  }
  const next: DbLanguage = { ...entry, alias: current };
  return save(withEntry(loaded.db, code, next), `alias de ${code} : ${current.join(', ')}`);
}

function exporter(args: readonly string[]): number {
  const code = args[0];
  if (code === undefined) return fail('usage : lang exporter <code>');
  if (!isLanguage(code)) return fail(`langue inconnue : « ${code} »`);

  // On exporte le lexique INTÉGRÉ, pas la base courante : c'est le point de départ complet.
  clearWordBase();
  const table = intentCuesTable();
  const mots: Record<string, Word[]> = {};
  for (const intent of INTENTS) {
    const list = table[intent]?.[code] ?? [];
    if (list.length > 0) mots[intent] = list.map(([text, weight]) => [text, weight] as Word);
  }
  const motsOutils = functionWordsOf(code).map(([text, weight]) => [text, weight] as Word);
  const total = motsOutils.length + Object.values(mots).reduce((n, list) => n + list.length, 0);
  if (total === 0) return fail(`le lexique intégré ne contient aucun mot pour ${code} : ajoutez-les avec « lang mot »`);

  const loaded = loadForWrite();
  if ('error' in loaded) return fail(loaded.error);
  const previous = entryOf(loaded.db, code);
  const next: DbLanguage = {
    nom: previous.nom ?? LANGUAGE_INFO[code].nativeName,
    alias: [...(previous.alias ?? [])],
    remplace: true,
    sources: previous.sources && previous.sources.length > 0 ? previous.sources : ['lexique intégré (packages/core/src/lexicon)'],
    mots_outils: motsOutils,
    mots,
  };
  return save(
    withEntry(loaded.db, code, next),
    `${code} exporté (${total} mot(s), ${intentCuesOf(code).length} indice(s) d'intention d'origine) — la base fait foi pour cette langue`,
  );
}

function tester(args: readonly string[]): number {
  const phrase = args.join(' ').trim();
  if (phrase === '') return fail('usage : lang tester "<phrase>"');
  const applied = applyWordDb();
  if (!applied.ok) {
    console.log(`⚠ base de mots ignorée :\n- ${applied.problems.join('\n- ')}`);
    console.log('  (essai avec le lexique intégré seulement)\n');
  }
  const result = interpret(phrase, { hintLang: 'fr', knownNames: [] });
  const slots = Object.entries(result.slots)
    .map(([key, value]) => `${key}=${typeof value === 'object' && value !== null && 'amount' in value ? String(value.amount) : String(value)}`)
    .join(' ');
  console.log(`« ${phrase} »`);
  console.log(`  langue     : ${result.lang} (confiance ${result.langConfidence})${applied.report === null ? '' : ` — base ${applied.file}`}`);
  console.log(`  intention  : ${result.intent} (confiance ${result.confidence})`);
  console.log(`  paramètres : ${slots === '' ? '—' : slots}`);
  console.log(`  indices    : ${result.cues.length === 0 ? '—' : result.cues.slice(0, 8).join(', ')}`);
  return result.intent === 'UNKNOWN' && applied.ok ? fail('aucune intention reconnue : ajoutez un mot avec « lang mot <code> <INTENTION> "<mot>" »') : 0;
}

function verifier(): number {
  let failures = 0;
  const load = readDb();
  console.log(`Base : ${load.file}${load.exists ? '' : ' (absente : rien d\'ajouté, lexique intégré seul)'}`);
  for (const problem of load.problems) {
    failures += 1;
    console.log(`✗ ${problem}`);
  }
  if (load.problems.length === 0) {
    const problems = checkDbProblems(load.db);
    failures += problems.length;
    for (const problem of problems) console.log(`✗ ${problem}`);
    for (const [code, entry] of Object.entries(load.db.langues)) {
      const mots = (entry.mots_outils?.length ?? 0) + Object.values(entry.mots ?? {}).reduce((n, list) => n + list.length, 0);
      const mode = entry.remplace === true ? 'remplace le lexique intégré' : 'ajoute au lexique intégré';
      const sources = entry.sources && entry.sources.length > 0 ? '' : ' — ⚠ provenance à remplir (sources)';
      console.log(`✓ ${code} (${entry.nom ?? LANGUAGE_INFO[code as LanguageCode]?.nativeName ?? code}) : ${mots} mot(s), ${mode}${sources}`);
    }
  }

  const applied = applyWordDb();
  if (!applied.ok) failures += applied.problems.length;
  const catalog = languageCatalog();
  console.log('\nLangues servies sur USSD : ' + catalog.filter((entry) => entry.ussd === 'servi').map((entry) => entry.code).join(', '));
  console.log('Repli français : ' + catalog.filter((entry) => entry.ussd === 'repli fr').map((entry) => entry.code).join(', '));

  return failures === 0 ? 0 : 1;
}

function flag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export function main(args: readonly string[]): number {
  const [command, ...rest] = args;
  switch (command) {
    case undefined:
    case 'aide':
    case '--help':
      console.log(USAGE);
      return liste();
    case 'liste':
      return liste();
    case 'ajouter':
      return ajouter(rest);
    case 'mot':
      return addMot(rest, false);
    case 'mot-outil':
      return addMot(rest, true);
    case 'supprimer':
      return supprimer(rest);
    case 'alias':
      return alias(rest);
    case 'exporter':
      return exporter(rest);
    case 'tester':
      return tester(rest);
    case 'verifier':
      return verifier();
    default:
      console.error(`✗ commande inconnue : « ${command} »\n`);
      console.log(USAGE);
      return 1;
  }
}
