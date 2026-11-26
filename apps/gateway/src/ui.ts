/**
 * Canaux mobile et web : on ne converse pas, on traduit les chaînes d'un écran.
 *
 * La sandbox vérifie quatre choses : toutes les clés présentes, emplacements (`{amount}`,
 * `{name}`…) intacts, `max_chars` respecté par clé, et pas plus d'un quart des textes
 * identiques au français quand on déclare une autre langue.
 *
 * D'où la règle : traduction complète ou repli complet en français déclaré `fr`.
 * On ne renvoie jamais un écran à moitié traduit en prétendant qu'il est fulfulde.
 */

import type { InboundTurn, UiReply, UiStringEntry } from '@nkap/safinum';
import { dictionaryFor, resolveUiLanguage, type UiLanguage } from './ui-dictionaries.js';

export interface UiCoverage {
  readonly language: UiLanguage;
  readonly missing: readonly string[];
  readonly brokenPlaceholders: readonly string[];
  readonly tooLong: readonly string[];
}

const PLACEHOLDER = /\{([a-z_]+)\}/g;

export function handleUi(turn: InboundTurn, overlay?: Readonly<Record<string, string>>): UiReply {
  const source = turn.strings ?? {};
  const requested = resolveUiLanguage(turn.language);
  const translated = translate(source, requested, overlay);

  if (translated.language === requested && requested !== 'fr') {
    return { language: requested, strings: translated.strings };
  }

  // Repli honnête : l'écran entier reste en français, et on le DÉCLARE.
  const strings: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source)) strings[key] = entry.text;
  return { language: 'fr', strings };
}

/** Traduit toutes les clés, ou aucune : le repli est décidé par l'appelant. */
export function translate(
  source: Readonly<Record<string, UiStringEntry>>,
  language: UiLanguage,
  overlay?: Readonly<Record<string, string>>,
): { language: UiLanguage; strings: Record<string, string> } {
  const base = dictionaryFor(language);
  // Le cache local (corrections, nouvelles traductions) passe avant le dictionnaire embarqué.
  const dictionary = base ? { ...base, ...(overlay ?? {}) } : null;
  if (!dictionary) {
    return { language: 'fr', strings: plain(source) };
  }

  const strings: Record<string, string> = {};
  const missing: string[] = [];
  const broken: string[] = [];
  const long: string[] = [];

  for (const [key, entry] of Object.entries(source)) {
    const value = dictionary[key];
    if (typeof value !== 'string' || value.trim() === '') {
      missing.push(key);
      strings[key] = entry.text;
      continue;
    }
    if (placeholders(entry.text) !== placeholders(value)) {
      broken.push(key);
      strings[key] = entry.text;
      continue;
    }
    if (typeof entry.max_chars === 'number' && [...value].length > entry.max_chars) {
      long.push(key);
      strings[key] = entry.text;
      continue;
    }
    strings[key] = value;
  }

  const complete = missing.length === 0 && broken.length === 0 && long.length === 0;
  return { language: complete ? language : 'fr', strings: complete ? strings : plain(source) };
}

/** Diagnostic pour les journaux du middleware : ce qui aurait empêché une traduction complète. */
export function auditUi(source: Readonly<Record<string, UiStringEntry>>, language: UiLanguage): UiCoverage {
  const dictionary = dictionaryFor(language) ?? {};
  const missing: string[] = [];
  const brokenPlaceholders: string[] = [];
  const tooLong: string[] = [];

  for (const [key, entry] of Object.entries(source)) {
    const value = dictionary[key];
    if (typeof value !== 'string' || value.trim() === '') {
      missing.push(key);
      continue;
    }
    if (placeholders(entry.text) !== placeholders(value)) brokenPlaceholders.push(key);
    if (typeof entry.max_chars === 'number' && [...value].length > entry.max_chars) tooLong.push(key);
  }

  return { language, missing, brokenPlaceholders, tooLong };
}

function plain(source: Readonly<Record<string, UiStringEntry>>): Record<string, string> {
  const strings: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source)) strings[key] = entry.text;
  return strings;
}

/** Même règle que la sandbox : noms en minuscules, sans doublon, triés. */
function placeholders(text: string): string {
  return [...new Set([...String(text).matchAll(PLACEHOLDER)].map((match) => match[1] ?? ''))]
    .filter((name) => name.length > 0)
    .sort()
    .join(',');
}
