/**
 * Catalogue des langues, en un seul endroit : ce que la sandbox peut tirer au sort, ce que nous
 * COMPRENONS, ce que nous SERVONS sur USSD, et où en sont les packs relus par des locuteurs.
 *
 * Sert `/langues` (console de jury, vigie), la CLI `lang liste` et les diagnostics du jour J.
 * Règle rappelée partout : une langue sans catalogue USSD complet est déclarée `fr` — on ne sert
 * jamais un écran à moitié traduit.
 */

import { LANGUAGE_INFO } from '@nkap/contracts';
import { functionWordsOf, intentCuesOf } from '@nkap/core';
import { SAFINUM_LANGUAGES, type SafinumLanguage } from '@nkap/safinum';
import { PACK_LOAD, USSD_REFERENCE, isServedLanguage } from './i18n.js';
import { auditPack } from './packs.js';
import { UI_DICTIONARIES } from './ui-dictionaries.js';

export interface LanguageEntry {
  readonly code: SafinumLanguage;
  readonly nom: string;
  /** Mots reconnus (mots-outils + mots-clés d'intention), base de mots comprise. */
  readonly mots: number;
  /** Statut du pack de réponses : `integré` pour fr/en/fub, `absent` sans fichier. */
  readonly pack: string;
  readonly ecrans: string;
  readonly ussd: 'servi' | 'repli fr';
  readonly sources: readonly string[];
}

const UI_REFERENCE: Readonly<Record<string, string>> = UI_DICTIONARIES.en ?? {};

export function languageCatalog(): LanguageEntry[] {
  return SAFINUM_LANGUAGES.map((code) => {
    const pack = PACK_LOAD.packs.get(code);
    const served = isServedLanguage(code);
    const audit = pack === undefined ? null : auditPack(pack, { ui: UI_REFERENCE, ussd: USSD_REFERENCE });
    return {
      code,
      nom: LANGUAGE_INFO[code].nativeName,
      mots: functionWordsOf(code).length + intentCuesOf(code).length,
      pack: pack === undefined ? (code === 'fr' || code === 'en' || code === 'fub' ? 'intégré' : 'absent') : pack.status,
      ecrans: audit === null ? (code === 'fr' || code === 'en' || code === 'fub' ? 'intégrés' : '0/' + String(Object.keys(UI_REFERENCE).length)) : `${audit.ui.translated}/${audit.ui.total}`,
      ussd: served ? 'servi' : 'repli fr',
      sources: pack?.sources ?? [],
    };
  });
}

/** Ligne lisible pour un journal ou une console : « fub · proposé · USSD servi ». */
export function describeLanguage(code: string): LanguageEntry | null {
  return languageCatalog().find((entry) => entry.code === code) ?? null;
}
