/**
 * Matrice langues × canaux : ce qui est RÉELLEMENT servi, pas ce qui est déclaré.
 *
 * Le même catalogue alimente les six canaux. Une langue qui couvre toutes les phrases
 * conversationnelles est servie sur USSD, SMS et IVR ; une langue qui couvre les écrans est
 * servie sur mobile, web et GAB. Les autres restent en français, et la matrice le dit.
 *
 * Aucune traduction n'est inventée ici : la matrice lit le catalogue validé (studio).
 */

import { CHANNELS, LANGUAGES, type Channel, type Language } from '@nkap/lingua-core';
import type { Catalog } from './catalog.ts';
import { REFERENCES } from './messages.ts';
import { LANGUAGE_NAMES } from '../understand.ts';

/** Toutes les phrases qu'un parcours conversationnel peut afficher. */
export const CONVERSATION_KEYS: readonly string[] = REFERENCES.map((ref) => ref.key);

/** En dessous, un écran n'est pas servi : même seuil que `channels/ui.ts` (75 % de 55 ≈ 40). */
export const MIN_UI_KEYS = 40;

export type Availability = 'servi' | 'partiel' | 'absent';

export interface LanguageRow {
  readonly code: Language;
  readonly nom: string;
  /** Phrase conversationnelles couvertes : `couvrees/total`. */
  readonly conversation: string;
  /** Clés d'écran (préfixe `ui.`) présentes. */
  readonly ecrans: number;
  readonly canaux: Readonly<Record<Channel, Availability>>;
}

function has(catalog: Catalog, lang: Language, keys: readonly string[]): boolean {
  return catalog.covers(lang, keys);
}

export function languageAvailability(catalog: Catalog): readonly LanguageRow[] {
  const rows: LanguageRow[] = [];
  for (const code of LANGUAGES) {
    const conversationCovered = CONVERSATION_KEYS.filter((key) => catalog.text(code, key, false) !== undefined).length;
    const uiKeys = catalog.keysOf(code).filter((key) => key.startsWith('ui.')).length;
    const conversationServed = conversationCovered === CONVERSATION_KEYS.length;
    const conversation: Availability = conversationServed ? 'servi' : conversationCovered > 0 ? 'partiel' : 'absent';
    // Le français est la langue source : les écrans renvoient le texte d'origine, donc servis.
    const screens: Availability = code === 'fr' || uiKeys >= MIN_UI_KEYS ? 'servi' : uiKeys > 0 ? 'partiel' : 'absent';
    rows.push({
      code,
      nom: LANGUAGE_NAMES[code].native,
      conversation: `${conversationCovered}/${CONVERSATION_KEYS.length}`,
      ecrans: uiKeys,
      canaux: {
        ussd: conversation,
        sms: conversation,
        ivr: conversation,
        mobile: screens,
        web: screens,
        atm: screens,
      },
    });
  }
  return rows;
}

/** Langues proposées dans le menu : uniquement celles qui portent tout le parcours. */
export function conversationLanguages(catalog: Catalog): readonly Language[] {
  const served = new Set<Language>();
  for (const code of LANGUAGES) if (has(catalog, code, CONVERSATION_KEYS)) served.add(code);
  return [...served].sort((a, b) => (a === 'fr' ? -1 : b === 'fr' ? 1 : a.localeCompare(b)));
}

export { CHANNELS };
