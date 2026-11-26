/**
 * Canaux mobile et web : on ne converse pas, on traduit les chaînes d'un écran.
 *
 * Règle du kit officiel SAFINUM, appliquée clé par clé :
 *   - traduction valide (non vide, emplacements `{x}` identiques, `max_chars` respecté) → envoyée ;
 *   - sinon la clé est OMISE : l'appli affiche le français pour cette clé et la sandbox le signale
 *     (`MISSING_STRINGS`). On n'envoie jamais une valeur qui casserait l'écran (`PLACEHOLDER_BROKEN`).
 *
 * Garde-fou d'honnêteté : sous {@link MIN_COVERAGE} de clés traduites, l'écran serait presque
 * français sous une étiquette nationale (et tomberait sous `UNTRANSLATED`) : on renvoie alors tout
 * en français, déclaré `fr`.
 */

import type { InboundTurn, UiReply, UiStringEntry } from '@nkap/safinum';
import { dictionaryFor, resolveUiLanguage, type UiLanguage } from './ui-dictionaries.js';

export interface UiCoverage {
  readonly language: UiLanguage;
  readonly missing: readonly string[];
  readonly brokenPlaceholders: readonly string[];
  readonly tooLong: readonly string[];
}

/** Part minimale de clés traduites pour déclarer la langue demandée (la sandbox tolère 25 % de français). */
export const MIN_COVERAGE = 0.75;

const PLACEHOLDER = /\{([a-z_]+)\}/g;

export function handleUi(turn: InboundTurn, overlay?: Readonly<Record<string, string>>): UiReply {
  return translate(turn.strings ?? {}, resolveUiLanguage(turn.language), overlay);
}

export function translate(
  source: Readonly<Record<string, UiStringEntry>>,
  language: UiLanguage,
  overlay?: Readonly<Record<string, string>>,
): UiReply {
  const base = dictionaryFor(language);
  // Le cache local (corrections, nouvelles traductions) passe avant le dictionnaire embarqué.
  const dictionary = base ? { ...base, ...(overlay ?? {}) } : null;
  if (!dictionary) return { language: 'fr', strings: plain(source) };

  const strings: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source)) {
    const value = dictionary[key];
    if (isValidTranslation(entry, value)) strings[key] = value;
  }

  const total = Object.keys(source).length;
  if (total > 0 && Object.keys(strings).length / total < MIN_COVERAGE) return { language: 'fr', strings: plain(source) };
  return { language, strings };
}

function isValidTranslation(entry: UiStringEntry, value: string | undefined): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  if (placeholders(entry.text) !== placeholders(value)) return false;
  return typeof entry.max_chars !== 'number' || [...value].length <= entry.max_chars;
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
