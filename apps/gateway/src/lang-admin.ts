/**
 * Administration de la base de mots depuis le navigateur : la même base que la CLI `lang`,
 * avec des contrôles identiques (validation en bloc, refus net, aucune écriture partielle).
 *
 * Chaque écriture est appliquée immédiatement au moteur (`applyWordDb`), donc un mot ajouté
 * dans la page est reconnu au tour suivant, sans redémarrer le middleware.
 *
 * Ces routes sont réservées à la machine locale : le serveur refuse toute requête qui n'arrive
 * pas de la boucle locale (`127.0.0.1`, `::1`), pour qu'un tunnel public ne transforme jamais
 * la console en outil d'écriture ouvert.
 */

import { INTENTS, LANGUAGES, LANGUAGE_INFO, type LanguageCode } from '@nkap/contracts';
import { MAX_WEIGHT, MIN_WEIGHT, functionWordsOf, intentCuesTable, interpret } from '@nkap/core';
import {
  applyWordDb,
  checkDbProblems,
  emptyDb,
  readDb,
  writeDb,
  type DbLanguage,
  type Word,
  type WordDb,
} from './word-base.js';
import { languageCatalog } from './language-catalog.js';

export interface AdminWord {
  readonly texte: string;
  readonly poids: number;
}

export interface AdminLanguage {
  readonly code: string;
  readonly nom: string;
  /** Langue du contrat SAFINUM (donc proposable sur les canaux) ou seulement connue du moteur. */
  readonly sandbox: boolean;
  readonly alias: readonly string[];
  readonly remplace: boolean;
  readonly sources: readonly string[];
  readonly mots_outils: readonly AdminWord[];
  readonly mots: Readonly<Record<string, readonly AdminWord[]>>;
  readonly total: number;
  /** Ce que le pack de réponses permet : `servie`, `repli fr`, ou `hors sandbox`. */
  readonly service: string;
}

export interface AdminState {
  readonly file: string;
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly languages: readonly AdminLanguage[];
  /** Langues du contrat absentes de la base : prêtes à être ajoutées. */
  readonly disponibles: readonly { readonly code: string; readonly nom: string; readonly sandbox: boolean }[];
  readonly intents: readonly string[];
  readonly weights: { readonly min: number; readonly max: number };
  readonly applied: { readonly ok: boolean; readonly words: number; readonly languages: readonly string[] };
}

export interface AdminResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const SANDBOX: ReadonlySet<string> = new Set(languageCatalog().map((entry) => entry.code));
const INTENT_SET: ReadonlySet<string> = new Set(INTENTS);

function words(list: readonly Word[] | undefined): AdminWord[] {
  return (list ?? []).map(([texte, poids]) => ({ texte, poids }));
}

function entryOf(db: WordDb, code: string): DbLanguage {
  return db.langues[code] ?? {};
}

function withEntry(db: WordDb, code: string, entry: DbLanguage): WordDb {
  return { ...db, langues: { ...db.langues, [code]: entry } };
}

function count(entry: DbLanguage): number {
  return (
    (entry.mots_outils?.length ?? 0) +
    Object.values(entry.mots ?? {}).reduce((total, list) => total + list.length, 0)
  );
}

export function adminState(): AdminState {
  const load = readDb();
  const catalog = new Map<string, { readonly ussd: string }>(languageCatalog().map((entry) => [entry.code, entry]));
  const languages: AdminLanguage[] = Object.entries(load.db.langues ?? {})
    .map(([code, entry]) => {
      const known = (LANGUAGES as readonly string[]).includes(code);
      const mots = Object.fromEntries(
        Object.entries(entry.mots ?? {}).map(([intent, list]) => [intent, words(list)]),
      );
      const served = catalog.get(code);
      return {
        code,
        nom: entry.nom ?? (known ? LANGUAGE_INFO[code as LanguageCode].nativeName : code),
        sandbox: SANDBOX.has(code),
        alias: [...(entry.alias ?? [])],
        remplace: entry.remplace === true,
        sources: [...(entry.sources ?? [])],
        mots_outils: words(entry.mots_outils),
        mots,
        total: count(entry),
        service: served === undefined ? 'hors sandbox' : served.ussd,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const inDb = new Set(languages.map((language) => language.code));
  const disponibles = LANGUAGES.filter((code) => !inDb.has(code)).map((code) => ({
    code,
    nom: LANGUAGE_INFO[code].nativeName,
    sandbox: SANDBOX.has(code),
  }));

  // L'état publié par `/health` et `/langues` : la page montre la même vérité que le jury.
  const applied = applyWordDb();
  return {
    file: load.file,
    ok: load.problems.length === 0,
    problems: [...load.problems, ...applied.problems],
    languages,
    disponibles,
    intents: [...INTENTS],
    weights: { min: MIN_WEIGHT, max: MAX_WEIGHT },
    applied: {
      ok: applied.ok,
      words: applied.report?.cues ?? 0,
      languages: [...(applied.report?.languages ?? [])],
    },
  };
}

function bad(problems: readonly string[]): AdminResult {
  return { status: 400, body: { ok: false, problems } };
}

function saved(db: WordDb, message: string): AdminResult {
  const problems = checkDbProblems(db);
  if (problems.length > 0) return bad(problems);
  const file = writeDb(db);
  const applied = applyWordDb(file);
  if (!applied.ok) return { status: 400, body: { ok: false, file, problems: applied.problems } };
  return {
    status: 200,
    body: { ok: true, file, message, words: applied.report?.cues ?? 0, languages: applied.report?.languages ?? [] },
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter((item) => item !== '');
}

function weightOf(value: unknown): number | null {
  const weight = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(weight) && weight >= MIN_WEIGHT && weight <= MAX_WEIGHT ? weight : null;
}

function loadForWrite(): { db: WordDb } | AdminResult {
  const load = readDb();
  if (load.problems.length > 0) return bad([`base existante invalide : ${load.problems.join(' ; ')}`]);
  return { db: load.exists ? load.db : emptyDb() };
}

function known(code: string): boolean {
  return (LANGUAGES as readonly string[]).includes(code);
}

/** Crée la langue ou met à jour son nom, ses alias et ses sources. */
function upsertLanguage(payload: Record<string, unknown>): AdminResult {
  const code = text(payload.code);
  if (!known(code)) return bad([`langue inconnue : « ${code} » (connues : ${LANGUAGES.join(', ')})`]);
  const loaded = loadForWrite();
  if ('status' in loaded) return loaded;

  const previous = entryOf(loaded.db, code);
  const nom = text(payload.nom) || previous.nom || LANGUAGE_INFO[code as LanguageCode].nativeName;
  const alias = payload.alias === undefined ? [...(previous.alias ?? [])] : textList(payload.alias);
  const sources =
    payload.sources === undefined
      ? [...(previous.sources ?? ['À compléter : locuteur, ville, date de la session'])]
      : textList(payload.sources);
  const next: DbLanguage = {
    ...previous,
    nom,
    alias,
    remplace: previous.remplace === true,
    sources,
  };
  return saved(withEntry(loaded.db, code, next), `langue « ${code} » enregistrée`);
}

/** Ajoute un mot ; s'il existe déjà, son poids est mis à jour (jamais deux entrées identiques). */
function upsertWord(payload: Record<string, unknown>): AdminResult {
  const code = text(payload.code);
  const texte = text(payload.texte);
  const weight = weightOf(payload.poids ?? 3);
  const outil = payload.intention === null || payload.intention === undefined || payload.intention === '';
  const intention = outil ? null : text(payload.intention);

  if (!known(code)) return bad([`langue inconnue : « ${code} »`]);
  if (texte === '') return bad(['mot manquant']);
  if (weight === null) return bad([`poids invalide : entier ${MIN_WEIGHT}–${MAX_WEIGHT} attendu`]);
  if (intention !== null && !INTENT_SET.has(intention)) return bad([`intention inconnue : « ${intention} »`]);

  const loaded = loadForWrite();
  if ('status' in loaded) return loaded;
  const entry = entryOf(loaded.db, code);
  const target = texte.toLowerCase();

  if (intention === null) {
    const list = [...(entry.mots_outils ?? [])];
    const index = list.findIndex(([existing]) => existing.toLowerCase() === target);
    if (index === -1) list.push([texte, weight]);
    else list[index] = [list[index]![0], weight];
    const next: DbLanguage = { ...entry, mots_outils: list };
    return saved(withEntry(loaded.db, code, next), index === -1 ? `mot-outil « ${texte} » ajouté` : `poids de « ${texte} » mis à jour`);
  }

  const mots: Record<string, readonly Word[]> = { ...(entry.mots ?? {}) };
  const list = [...(mots[intention] ?? [])];
  const index = list.findIndex(([existing]) => existing.toLowerCase() === target);
  if (index === -1) list.push([texte, weight]);
  else list[index] = [list[index]![0], weight];
  mots[intention] = list;
  const next: DbLanguage = { ...entry, mots };
  return saved(
    withEntry(loaded.db, code, next),
    index === -1 ? `${intention} ← « ${texte} » (${weight}) ajouté` : `poids de « ${texte} » mis à jour`,
  );
}

function deleteWord(payload: Record<string, unknown>): AdminResult {
  const code = text(payload.code);
  const texte = text(payload.texte).toLowerCase();
  if (!known(code)) return bad([`langue inconnue : « ${code} »`]);
  if (texte === '') return bad(['mot manquant']);

  const loaded = loadForWrite();
  if ('status' in loaded) return loaded;
  const entry = entryOf(loaded.db, code);
  const motsOutils = (entry.mots_outils ?? []).filter(([existing]) => existing.toLowerCase() !== texte);
  const mots: Record<string, readonly Word[]> = {};
  let removed = (entry.mots_outils?.length ?? 0) - motsOutils.length;
  for (const [intent, cues] of Object.entries(entry.mots ?? {})) {
    const kept = cues.filter(([existing]) => existing.toLowerCase() !== texte);
    removed += cues.length - kept.length;
    if (kept.length > 0) mots[intent] = kept;
  }
  if (removed === 0) {
    return {
      status: 404,
      body: {
        ok: false,
        problems: [
          `« ${texte} » n'est pas dans la base pour ${code}` +
            (entry.remplace === true ? '' : ` — lancez « exporter ${code} » s'il vient du lexique intégré`),
        ],
      },
    };
  }
  const next: DbLanguage = { ...entry, mots_outils: motsOutils, mots };
  return saved(withEntry(loaded.db, code, next), `« ${texte} » retiré (${removed} entrée(s))`);
}

/** Fait venir la langue entièrement de la base (à partir de ce qu'elle comprend aujourd'hui). */
function exportLanguage(payload: Record<string, unknown>): AdminResult {
  const code = text(payload.code);
  if (!known(code)) return bad([`langue inconnue : « ${code} »`]);
  const loaded = loadForWrite();
  if ('status' in loaded) return loaded;

  const table = intentCuesTable();
  const mots: Record<string, Word[]> = {};
  for (const intent of INTENTS) {
    const list = table[intent]?.[code as LanguageCode] ?? [];
    if (list.length > 0) mots[intent] = list.map(([texte, poids]) => [texte, poids] as Word);
  }
  const motsOutils = functionWordsOf(code).map(([texte, poids]) => [texte, poids] as Word);
  const total = motsOutils.length + Object.values(mots).reduce((sum, list) => sum + list.length, 0);
  if (total === 0) {
    return bad([`aucun mot à exporter pour ${code} : ajoutez d'abord des mots (le moteur n'en connaît aucun)`]);
  }

  const previous = entryOf(loaded.db, code);
  const next: DbLanguage = {
    nom: previous.nom ?? LANGUAGE_INFO[code as LanguageCode].nativeName,
    alias: [...(previous.alias ?? [])],
    remplace: true,
    sources:
      previous.sources && previous.sources.length > 0 ? previous.sources : ['lexique intégré (packages/core/src/lexicon)'],
    mots_outils: motsOutils,
    mots,
  };
  return saved(withEntry(loaded.db, code, next), `${code} exporté (${total} mot(s)) — la base fait foi`);
}

/** Essai à blanc : la phrase est comprise avec la base telle qu'elle est chargée. */
function test(payload: Record<string, unknown>): AdminResult {
  const phrase = text(payload.phrase);
  if (phrase === '') return bad(['phrase vide']);
  const result = interpret(phrase, { hintLang: 'fr', knownNames: [] });
  return {
    status: 200,
    body: {
      ok: true,
      phrase,
      langue: result.lang,
      confiance: result.langConfidence,
      intention: result.intent,
      intention_confiance: result.confidence,
      parametres: result.slots,
      indices: [...result.cues].slice(0, 12),
    },
  };
}

/** Point d'entrée unique des actions de la page : `langue`, `mot`, `supprimer`, `exporter`, `tester`. */
export function adminAction(action: string, payload: Record<string, unknown>): AdminResult {
  switch (action) {
    case 'langue':
      return upsertLanguage(payload);
    case 'mot':
      return upsertWord(payload);
    case 'supprimer':
      return deleteWord(payload);
    case 'exporter':
      return exportLanguage(payload);
    case 'tester':
      return test(payload);
    default:
      return { status: 404, body: { ok: false, problems: [`action inconnue : « ${action} »`] } };
  }
}
