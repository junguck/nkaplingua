/**
 * Langue du tour USSD quand la passerelle envoie `language: null`.
 *
 * Un seul détecteur dans le dépôt : celui du moteur (`@nkap/core`), qui connaît les mêmes lexiques
 * que la compréhension. Le middleware n'ajoute que sa prudence propre au contrat SAFINUM :
 *   - il ne retient qu'une langue qu'il sait SERVIR en entier sur USSD (`fr`, `en`, `fub`) ;
 *     le pidgin, l'ewondo ou le bulu détectés ne sont pas déclarés, faute de catalogue complet ;
 *   - il exige un écart net avec la deuxième langue, sinon il garde la langue en cours.
 *
 * Priorité : langue explicite du tour > choix de l'utilisateur (menu 8) > détection > langue en cours.
 */

import type { LanguageCode } from '@nkap/contracts';
import { detectLanguage as detectWithEngine, fold } from '@nkap/core';
import { isServedLanguage, type GatewayLanguage } from './i18n.js';

export interface LanguageGuess {
  readonly language: GatewayLanguage;
  /** Somme des indices de la langue retenue ; 0 = rien de probant. */
  readonly confidence: number;
  readonly cues: readonly string[];
}

/** Écart minimal avec la deuxième langue (un mot-clé net vaut 2). */
const MIN_MARGIN = 2;

function isServed(lang: LanguageCode): lang is GatewayLanguage {
  return isServedLanguage(lang);
}

export function detectLanguage(text: string, fallback: GatewayLanguage = 'fr'): LanguageGuess {
  const guess = detectWithEngine(fold(text), fallback);
  if (guess.margin < MIN_MARGIN || !isServed(guess.lang)) return { language: fallback, confidence: 0, cues: [] };
  return { language: guess.lang, confidence: guess.evidence, cues: guess.cues.slice(0, 5) };
}

export function resolveTurnLanguage(
  options: {
    readonly requested?: string | null;
    readonly current?: GatewayLanguage;
    readonly source?: 'turn' | 'detected' | 'user';
  },
  text: string,
): { language: GatewayLanguage; source: 'turn' | 'detected' | 'user'; confidence: number } {
  if (isServedLanguage(options.requested)) {
    return { language: options.requested, source: 'turn', confidence: 3 };
  }
  if (options.source === 'user' && options.current) {
    return { language: options.current, source: 'user', confidence: 3 };
  }
  const guess = detectLanguage(text, options.current ?? 'fr');
  return { language: guess.language, source: 'detected', confidence: guess.confidence };
}
