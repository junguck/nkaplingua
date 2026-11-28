/**
 * Matrice langues × canaux : ce qui est RÉELLEMENT servi, pas ce qui est déclaré.
 *
 * Le même catalogue alimente les six canaux. Une langue qui couvre toutes les phrases
 * conversationnelles est servie sur USSD, SMS et IVR ; une langue qui couvre les écrans est
 * servie sur mobile, web et GAB. Les autres restent en français, et la matrice le dit.
 *
 * Aucune traduction n'est inventée ici : la matrice lit le catalogue déjà chargé (intégré,
 * packs `translations/`, studio) et applique les mêmes seuils que le dialogue et les écrans.
 * Elle est publiée telle quelle par `GET /langues`.
 */

import { CHANNELS, LANGUAGE_INFO, type ChannelId } from '@nkap/contracts';
import { SAFINUM_LANGUAGES, type SafinumLanguage } from '@nkap/safinum';
import { PACK_LOAD, USSD_REFERENCE, isServedLanguage } from './i18n.js';
import { studioUssd } from './studio-catalog.js';
import { UI_DICTIONARIES, dictionaryFor } from './ui-dictionaries.js';

/** Référence des écrans (anglais, complet) : le dénominateur de la couverture mobile/web/GAB. */
const UI_REFERENCE: Readonly<Record<string, string>> = UI_DICTIONARIES.en ?? {};

/** Toutes les phrases conversationnelles possibles, dans l'ordre du catalogue USSD. */
export const CONVERSATION_KEYS: readonly string[] = Object.keys(USSD_REFERENCE);

/** En dessous de 75 % des écrans, la langue n'est pas servie : l'écran entier reste en français. */
export const MIN_UI_KEYS = Math.ceil(Object.keys(UI_REFERENCE).length * 0.75);

export type Availability = 'servi' | 'partiel' | 'absent';

export type AvailabilityChannel = ChannelId;

export interface LanguageRow {
  readonly code: SafinumLanguage;
  readonly nom: string;
  /** Phrases conversationnelles couvertes : `couvrees/total`. */
  readonly conversation: string;
  /** Clés d'écran présentes. */
  readonly ecrans: number;
  readonly canaux: Readonly<Record<AvailabilityChannel, Availability>>;
}

/** Clés conversationnelles réellement traduites (pack + studio), sans passer par le repli français. */
function conversationCovered(code: SafinumLanguage): number {
  if (isServedLanguage(code)) return CONVERSATION_KEYS.length;
  const merged: Readonly<Record<string, string>> = {
    ...(PACK_LOAD.packs.get(code)?.ussd ?? {}),
    ...studioUssd(code),
  };
  return CONVERSATION_KEYS.filter((key) => {
    const text = merged[key];
    return typeof text === 'string' && text.trim() !== '';
  }).length;
}

/** Clés d'écran traduites pour cette langue ; le français est la langue source, donc complet. */
function screensCovered(code: SafinumLanguage): number {
  if (code === 'fr') return Object.keys(UI_REFERENCE).length;
  const dictionary = dictionaryFor(code) ?? {};
  return Object.keys(UI_REFERENCE).filter((key) => {
    const text = dictionary[key];
    return typeof text === 'string' && text.trim() !== '';
  }).length;
}

function conversationState(covered: number): Availability {
  if (covered >= CONVERSATION_KEYS.length) return 'servi';
  return covered > 0 ? 'partiel' : 'absent';
}

function screensState(code: SafinumLanguage, covered: number): Availability {
  if (code === 'fr' || covered >= MIN_UI_KEYS) return 'servi';
  return covered > 0 ? 'partiel' : 'absent';
}

/** Une ligne par langue déclarée au contrat SAFINUM, dans l'ordre de `SAFINUM_LANGUAGES`. */
export function languageAvailability(): readonly LanguageRow[] {
  return SAFINUM_LANGUAGES.map((code) => {
    const covered = conversationCovered(code);
    const conversation = conversationState(covered);
    const ecrans = screensCovered(code);
    const screens = screensState(code, ecrans);
    return {
      code,
      nom: LANGUAGE_INFO[code].nativeName,
      conversation: `${covered}/${CONVERSATION_KEYS.length}`,
      ecrans,
      canaux: {
        ussd: conversation,
        sms: conversation,
        ivr: conversation,
        mobile: screens,
        web: screens,
        atm: screens,
      },
    };
  });
}

/** Langues du menu Langue : uniquement celles qui portent tout le parcours conversationnel. */
export function conversationLanguages(): readonly SafinumLanguage[] {
  const served = SAFINUM_LANGUAGES.filter((code) => isServedLanguage(code));
  return [...served].sort((a, b) => (a === 'fr' ? -1 : b === 'fr' ? 1 : a.localeCompare(b)));
}

export { CHANNELS };
