/**
 * La « petite base de données » des langues et des mots : `data/langues.json`.
 *
 * Un humain (linguiste, développeur, juré curieux) peut ajouter une langue, corriger un alias,
 * ajouter un mot-clé ou changer son poids SANS toucher au TypeScript :
 *
 *   pnpm --filter @nkap/gateway lang ajouter bas --nom Basaa --alias bassa
 *   pnpm --filter @nkap/gateway lang mot bas CHECK_BALANCE "ndap" 3
 *   pnpm --filter @nkap/gateway lang tester "ndap am"
 *
 * Le fichier est relu au démarrage du middleware. Une base invalide n'est JAMAIS appliquée à moitié :
 * elle est refusée en entier, les problèmes sont journalisés et publiés dans `/health` et `/langues`.
 * Le lexique TypeScript reste la référence ; la base s'y ajoute, ou la remplace langue par langue
 * (`remplace: true`, produit par `lang exporter <code>`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkWordBase, installWordBase, type WordBase, type WordBaseReport } from '@nkap/core';

/** Un indice : [mot, poids 1–5]. */
export type Word = readonly [text: string, weight: number];

export interface DbLanguage {
  /** Nom affiché (défaut : le nom natif de la documentation SAFINUM). */
  readonly nom?: string;
  /** Noms par lesquels un utilisateur désigne la langue (« douala », « poular »). */
  readonly alias?: readonly string[];
  /** `true` : cette langue vient entièrement de la base (voir `lang exporter`). */
  readonly remplace?: boolean;
  /** Provenance des mots : locuteur, ville, date, dictionnaire. Jamais vide pour du contenu relu. */
  readonly sources?: readonly string[];
  /** Mots-outils qui trahissent la langue d'une phrase courte. */
  readonly mots_outils?: readonly Word[];
  /** Mots-clés par intention, poids 1–5. */
  readonly mots?: Readonly<Record<string, readonly Word[]>>;
}

export interface WordDb {
  readonly _lisez_moi?: string;
  readonly _exemple?: unknown;
  readonly langues: Readonly<Record<string, DbLanguage>>;
}

export interface DbLoad {
  readonly file: string;
  readonly exists: boolean;
  /** Base lue (vide si le fichier manque ou est illisible). */
  readonly db: WordDb;
  /** Problèmes de structure ou de contenu, en clair. */
  readonly problems: readonly string[];
}

export function emptyDb(): WordDb {
  return {
    _lisez_moi:
      "Base de mots de NkapLingua. Ajoutez une langue ou des mots avec : pnpm --filter @nkap/gateway lang … " +
      "Le lexique TypeScript reste la référence ; cette base s'y ajoute. « remplace: true » (produit par « lang exporter <code> ») " +
      'fait venir la langue entièrement d\'ici. Poids de 1 (indice faible) à 5 (mot sans ambiguïté).',
    langues: {},
  };
}

/** `NKAP_WORD_DB` pointe un autre fichier (essais, démonstration, livraison du jour J à part). */
export function wordDbPath(): string {
  return process.env.NKAP_WORD_DB ?? fileURLToPath(new URL('../data/langues.json', import.meta.url));
}

export function readDb(file: string = wordDbPath()): DbLoad {
  if (!fs.existsSync(file)) return { file, exists: false, db: emptyDb(), problems: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { file, exists: true, db: emptyDb(), problems: [`JSON illisible : ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { file, exists: true, db: emptyDb(), problems: ['objet JSON attendu : { "langues": { … } }'] };
  }
  const record = raw as Record<string, unknown>;
  const langues = record.langues;
  if (typeof langues !== 'object' || langues === null || Array.isArray(langues)) {
    return { file, exists: true, db: emptyDb(), problems: ['« langues » doit être un objet { code: { … } }'] };
  }
  const problems = checkDbLanguage(record.langues as Record<string, unknown>);
  return { file, exists: true, db: { ...(record as unknown as WordDb) }, problems };
}

function checkDbLanguage(langues: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const [code, raw] of Object.entries(langues)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      problems.push(`${code} : objet attendu`);
      continue;
    }
    const entry = raw as Record<string, unknown>;
    if (entry.alias !== undefined && !Array.isArray(entry.alias)) problems.push(`${code}.alias : liste de chaînes attendue`);
    if (entry.sources !== undefined && !Array.isArray(entry.sources)) problems.push(`${code}.sources : liste de chaînes attendue`);
  }
  return problems;
}

export function writeDb(db: WordDb, file: string = wordDbPath()): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(db, null, 2)}\n`);
  return file;
}

/** Traduit la base « humaine » (clés françaises) vers la forme attendue par le moteur. */
export function toWordBase(db: WordDb): WordBase {
  const languages: Record<string, unknown> = {};
  for (const [code, entry] of Object.entries(db.langues ?? {})) {
    const intents: Record<string, readonly Word[]> = {};
    for (const [intent, cues] of Object.entries(entry.mots ?? {})) {
      if (Array.isArray(cues) && cues.length > 0) intents[intent] = cues;
    }
    languages[code] = {
      ...(entry.alias === undefined ? {} : { names: entry.alias }),
      ...(entry.remplace === undefined ? {} : { replace: entry.remplace }),
      ...(entry.mots_outils === undefined ? {} : { functionWords: entry.mots_outils }),
      ...(Object.keys(intents).length === 0 ? {} : { intents }),
    };
  }
  return { languages } as WordBase;
}

/** Tous les problèmes d'une base (structure du fichier + contenu vu par le moteur). */
export function checkDbProblems(db: WordDb): string[] {
  const structural = checkDbLanguage((db.langues ?? {}) as unknown as Record<string, unknown>);
  return [...structural, ...checkWordBase(toWordBase(db))];
}

export interface ApplyResult {
  readonly file: string;
  readonly exists: boolean;
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly report: WordBaseReport | null;
}

let lastApply: ApplyResult = { file: wordDbPath(), exists: false, ok: true, problems: [], report: null };

/** Dernière application (ce que le serveur publie dans `/health` et `/langues`). */
export function lastWordBase(): ApplyResult {
  return lastApply;
}

/**
 * Lit la base et l'installe dans le moteur. Ne jette pas : le serveur doit démarrer même si un
 * humain a laissé une virgule de trop, mais il le DIT (journal, `/health`, `/langues`).
 */
export function applyWordDb(file: string = wordDbPath()): ApplyResult {
  const load = readDb(file);
  if (load.problems.length > 0) {
    lastApply = { file: load.file, exists: load.exists, ok: false, problems: load.problems, report: null };
    return lastApply;
  }
  const base = toWordBase(load.db);
  const problems = checkWordBase(base);
  if (problems.length > 0) {
    lastApply = { file: load.file, exists: load.exists, ok: false, problems, report: null };
    return lastApply;
  }
  const report = installWordBase(base);
  lastApply = { file: load.file, exists: load.exists, ok: true, problems: [], report };
  return lastApply;
}
