/**
 * Canaux mobile et web : on ne converse pas, on traduit les chaînes d'un écran.
 *
 * Règles de la documentation de la sandbox, appliquées clé par clé :
 *   - « Renvoyez toutes les clés » : une clé absente s'affiche en français ET la trace est marquée
 *     `MISSING_STRINGS`. Une clé sans traduction valide part donc avec son texte français ;
 *   - emplacements `{x}` supprimés ou renommés → `PLACEHOLDER_BROKEN` : jamais envoyés ;
 *   - `max_chars` dépassé → `OVER_LENGTH` : jamais envoyé ;
 *   - plus d'un quart des textes identiques au français → `UNTRANSLATED`. Au-delà de ce seuil,
 *     l'écran est surtout français : on le DÉCLARE `fr` plutôt que de prétendre l'avoir traduit.
 */

import type { InboundTurn, UiReply, UiStringEntry } from '@nkap/safinum';
import { dictionaryFor, resolveUiLanguage, type UiLanguage } from './ui-dictionaries.js';

export interface UiCoverage {
  readonly language: UiLanguage;
  readonly missing: readonly string[];
  readonly brokenPlaceholders: readonly string[];
  readonly tooLong: readonly string[];
}

/** Part maximale de textes identiques au français tolérée par la sandbox avant `UNTRANSLATED`. */
export const MAX_FRENCH_SHARE = 0.25;

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
  let french = 0;
  for (const [key, entry] of Object.entries(source)) {
    const value = dictionary[key];
    const text = isValidTranslation(entry, value) ? value : entry.text;
    if (text === entry.text) french += 1;
    strings[key] = text;
  }

  const total = Object.keys(source).length;
  if (total > 0 && french / total > MAX_FRENCH_SHARE) return { language: 'fr', strings: plain(source) };
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
