/**
 * Base de mots vivante : ce que le moteur reconnaît peut venir d'un fichier de données, sans toucher au code.
 *
 * Le lexique TypeScript (`intents.lexicon.ts`, `languages.lexicon.ts`) reste la RÉFÉRENCE documentée
 * (sources en commentaire). Une base de mots s'y AJOUTE :
 *   - `names`         : façons dont un utilisateur nomme la langue (« poular », « douala ») ;
 *   - `functionWords` : mots-outils qui trahissent la langue d'une phrase courte ;
 *   - `intents`       : mots-clés par intention, avec leur poids ;
 *   - `replace`       : `true` = cette langue vient ENTIÈREMENT de la base (après `lang exporter`).
 *
 * `replace` existe pour les langues qu'on veut modifier ou corriger sans éditer le TypeScript :
 * une fois exportée, la base contient tout, et c'est elle qu'on relit.
 *
 * Rien n'est deviné : une base invalide (langue ou intention inconnue, poids hors bornes) est
 * REFUSÉE en entier, avec la liste des problèmes — jamais appliquée à moitié.
 */

import { INTENTS, LANGUAGES, type IntentName, type LanguageCode } from '@nkap/contracts';
import type { CueSpec } from './types';
import { INTENT_CUES } from './intents.lexicon';
import { FUNCTION_WORDS, LANGUAGE_NAMES } from './languages.lexicon';
import { fold } from '../text/normalize';

/** Poids acceptés pour un indice lexical : 1 = indice faible, 5 = mot sans ambiguïté. */
export const MIN_WEIGHT = 1;
export const MAX_WEIGHT = 5;

export interface LanguageWords {
  /** Noms par lesquels on désigne la langue. Remplacent la liste intégrée si `replace`. */
  readonly names?: readonly string[];
  /** `true` : n'utiliser que cette entrée pour la langue (le lexique intégré est ignoré). */
  readonly replace?: boolean;
  readonly functionWords?: readonly CueSpec[];
  readonly intents?: Readonly<Partial<Record<IntentName, readonly CueSpec[]>>>;
}

export interface WordBase {
  readonly languages: Readonly<Partial<Record<LanguageCode, LanguageWords>>>;
}

export interface WordBaseReport {
  /** Langues touchées par la base. */
  readonly languages: readonly LanguageCode[];
  /** Nombre d'indices apportés par la base (ajouts + remplacements). */
  readonly cues: number;
  /** Langues entièrement remplacées par la base. */
  readonly replaced: readonly LanguageCode[];
}

const EMPTY: WordBase = { languages: {} };

export function emptyWordBase(): WordBase {
  return EMPTY;
}

const LANGUAGE_SET: ReadonlySet<string> = new Set(LANGUAGES);
const INTENT_SET: ReadonlySet<string> = new Set(INTENTS);

/**
 * Vérifie une base de mots et rend TOUS les problèmes en clair (vide = base utilisable).
 * Ne jette jamais : l'appelant décide (le serveur journalise, la CLI refuse d'écrire).
 */
export function checkWordBase(input: unknown): string[] {
  const problems: string[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return ['base attendue : un objet { languages: { … } }'];
  const languages = (input as Record<string, unknown>).languages;
  if (typeof languages !== 'object' || languages === null || Array.isArray(languages)) return ['« languages » doit être un objet { code: { … } }'];

  for (const [code, raw] of Object.entries(languages as Record<string, unknown>)) {
    if (!LANGUAGE_SET.has(code)) {
      problems.push(`langue inconnue : « ${code} » (connues : ${LANGUAGES.join(', ')})`);
      continue;
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      problems.push(`${code} : objet attendu`);
      continue;
    }
    const entry = raw as Record<string, unknown>;
    if (entry.replace !== undefined && typeof entry.replace !== 'boolean') problems.push(`${code}.replace : true ou false attendu`);
    if (entry.names !== undefined) {
      if (!Array.isArray(entry.names)) problems.push(`${code}.names : liste de chaînes attendue`);
      else for (const name of entry.names) if (typeof name !== 'string' || name.trim() === '') problems.push(`${code}.names : nom vide`);
    }
    problems.push(...checkCues(code, 'functionWords', entry.functionWords));
    if (entry.intents !== undefined) {
      if (typeof entry.intents !== 'object' || entry.intents === null || Array.isArray(entry.intents)) {
        problems.push(`${code}.intents : objet { INTENTION: [[mot, poids], …] } attendu`);
      } else {
        for (const [intent, cues] of Object.entries(entry.intents as Record<string, unknown>)) {
          if (!INTENT_SET.has(intent)) problems.push(`${code}.intents.${intent} : intention inconnue (connues : ${INTENTS.join(', ')})`);
          else problems.push(...checkCues(code, `intents.${intent}`, cues));
        }
      }
    }
    if (entry.replace === true) {
      const words = (entry.functionWords as unknown[] | undefined)?.length ?? 0;
      const intents = entry.intents === undefined ? 0 : Object.values(entry.intents as Record<string, unknown[]>).reduce<number>((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
      if (words + intents === 0) problems.push(`${code}.replace : la langue serait vidée de tout mot (lancez « lang exporter ${code} »)`);
    }
  }
  return problems;
}

function checkCues(code: string, field: string, raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return [`${code}.${field} : liste de [mot, poids] attendue`];
  const problems: string[] = [];
  for (const cue of raw) {
    if (!Array.isArray(cue) || cue.length !== 2) {
      problems.push(`${code}.${field} : « ${JSON.stringify(cue)} » n'est pas [mot, poids]`);
      continue;
    }
    const [text, weight] = cue as [unknown, unknown];
    if (typeof text !== 'string' || text.trim() === '') problems.push(`${code}.${field} : mot vide`);
    if (typeof weight !== 'number' || !Number.isInteger(weight) || weight < MIN_WEIGHT || weight > MAX_WEIGHT) {
      problems.push(`${code}.${field} : « ${String(text)} » a un poids ${String(weight)} hors de ${MIN_WEIGHT}–${MAX_WEIGHT}`);
    }
  }
  return problems;
}

interface Compiled {
  readonly functionWords: ReadonlyMap<string, readonly CueSpec[]>;
  readonly names: ReadonlyMap<string, readonly string[]>;
  readonly intents: ReadonlyMap<string, readonly CueSpec[]>;
  readonly table: Readonly<Record<string, Readonly<Partial<Record<string, readonly CueSpec[]>>>>>;
  readonly report: WordBaseReport;
}

let compiled: Compiled = compile(EMPTY);

/** Installe une base de mots. Jette si elle est invalide : le moteur ne tourne jamais sur une base douteuse. */
export function installWordBase(input: unknown): WordBaseReport {
  const problems = checkWordBase(input);
  if (problems.length > 0) throw new Error(`base de mots refusée :\n- ${problems.join('\n- ')}`);
  compiled = compile(input as WordBase);
  return compiled.report;
}

/** Revient au lexique intégré (tests, CLI en cours d'exécution). */
export function clearWordBase(): void {
  compiled = compile(EMPTY);
}

export function wordBaseReport(): WordBaseReport {
  return compiled.report;
}

/** Mots-outils d'une langue : intégrés, puis ceux de la base (ou seulement ceux de la base si `replace`). */
export function functionWordsOf(lang: string): readonly CueSpec[] {
  return compiled.functionWords.get(lang) ?? [];
}

/** Tous les indices d'intention d'une langue, toutes intentions confondues (détection de langue). */
export function intentCuesOf(lang: string): readonly CueSpec[] {
  return compiled.intents.get(lang) ?? [];
}

/** Noms de la langue : intégrés + base. */
export function languageNamesOf(lang: string): readonly string[] {
  return compiled.names.get(lang) ?? [];
}

/** Table complète des indices d'intention, base fusionnée (classifieur). */
export function intentCuesTable(): Readonly<Record<string, Readonly<Partial<Record<string, readonly CueSpec[]>>>>> {
  return compiled.table;
}

function compile(base: WordBase): Compiled {
  const functionWords = new Map<string, readonly CueSpec[]>();
  const names = new Map<string, readonly string[]>();
  const intents = new Map<string, readonly CueSpec[]>();
  const table: Record<string, Partial<Record<string, readonly CueSpec[]>>> = {};
  const touched: LanguageCode[] = [];
  const replaced: LanguageCode[] = [];
  let cueCount = 0;

  for (const lang of LANGUAGES) {
    const overlay = base.languages[lang];
    if (overlay !== undefined) touched.push(lang);
    if (overlay?.replace === true) replaced.push(lang);

    const ownWords = overlay?.functionWords ?? [];
    const ownIntents = overlay?.intents ?? {};
    if (overlay !== undefined) {
      cueCount += ownWords.length;
      for (const list of Object.values(ownIntents)) cueCount += list?.length ?? 0;
    }

    const words = overlay?.replace === true ? [...ownWords] : dedupe([...FUNCTION_WORDS[lang], ...ownWords]);
    functionWords.set(lang, words);

    const overlayNames = overlay?.names ?? [];
    const mergedNames =
      overlay?.replace === true && overlayNames.length > 0
        ? dedupeText(overlayNames)
        : dedupeText([...LANGUAGE_NAMES[lang], ...overlayNames]);
    names.set(lang, mergedNames);

    const all: CueSpec[] = [];
    for (const intent of INTENTS) {
      const integrated = INTENT_CUES[intent]?.[lang] ?? [];
      const extra = (ownIntents[intent] ?? []) as readonly CueSpec[];
      const list = overlay?.replace === true ? dedupe([...extra]) : dedupe([...integrated, ...extra]);
      if (list.length > 0) {
        const row = table[intent] ?? {};
        row[lang] = list;
        table[intent] = row;
      }
      all.push(...list);
    }
    intents.set(lang, all);
  }

  return { functionWords, names, intents, table, report: { languages: touched, cues: cueCount, replaced } };
}

/** Un même mot écrit deux fois ne doit pas compter deux fois (comparaison repliée, comme la détection). */
function dedupe(cues: readonly CueSpec[]): CueSpec[] {
  const seen = new Set<string>();
  const out: CueSpec[] = [];
  for (const [text, weight] of cues) {
    const key = fold(text);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    out.push([text, weight]);
  }
  return out;
}

function dedupeText(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = fold(value);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
