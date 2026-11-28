/**
 * Canaux mobile, web et GAB : traduction d'écrans.
 *
 * Frontière de sécurité : ce module ne reçoit AUCUN client bancaire (pas de dépendance
 * injectée). Les montants, noms et numéros arrivent sous forme d'emplacements `{amount}`
 * que l'application remplit elle-même : le middleware ne voit jamais une valeur financière.
 */

import { isLanguage, samePlaceholders, type Language, type UiTranslationRequest, type UiTranslationResponse } from '@nkap/lingua-core';
import type { Catalog } from '../i18n/catalog.ts';

/** En dessous de 75 % de clés traduites, l'écran part entièrement en français, déclaré `fr`. */
export const MIN_COVERAGE = 0.75;

export interface UiResult {
  readonly body: UiTranslationResponse;
  readonly coverage: number;
  readonly missing: readonly string[];
  readonly rejected: readonly { readonly key: string; readonly reason: 'placeholders' | 'max_chars' }[];
}

export const uiKey = (key: string): string => `ui.${key}`;

export function handleUi(request: UiTranslationRequest, catalog: Catalog): UiResult {
  const requested: Language = isLanguage(request.language) ? request.language : 'fr';
  const entries = Object.entries(request.strings);
  const source = (): Record<string, string> => Object.fromEntries(entries.map(([k, v]) => [k, v.text]));

  if (requested === 'fr') return { body: { language: 'fr', strings: source() }, coverage: 1, missing: [], rejected: [] };

  const strings: Record<string, string> = {};
  const missing: string[] = [];
  const rejected: { key: string; reason: 'placeholders' | 'max_chars' }[] = [];

  for (const [key, entry] of entries) {
    const candidate = catalog.text(requested, uiKey(key), false);
    if (candidate === undefined) {
      missing.push(key);
      continue;
    }
    if (!samePlaceholders(entry.text, candidate)) {
      rejected.push({ key, reason: 'placeholders' });
      continue;
    }
    if (entry.max_chars != null && [...candidate].length > entry.max_chars) {
      rejected.push({ key, reason: 'max_chars' });
      continue;
    }
    strings[key] = candidate;
  }

  const coverage = entries.length === 0 ? 1 : Object.keys(strings).length / entries.length;
  if (coverage < MIN_COVERAGE) return { body: { language: 'fr', strings: source() }, coverage, missing, rejected };
  return { body: { language: requested, strings }, coverage, missing, rejected };
}
