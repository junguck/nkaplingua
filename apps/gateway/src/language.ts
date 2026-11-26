/**
 * Détection de langue quand la passerelle envoie `language: null`.
 *
 * La sandbox prévient : `language` peut être nul, et la détection nous revient — c'est un cas
 * d'évaluation à part entière. On ne détecte que ce qu'on sait réellement servir : `fr`, `en`,
 * `fub`. Les autres langues de la sandbox (`dua`, `ewo`, `bas`, `bbj`, `byv`) n'ont pas de
 * lexique fiable dans le dépôt ; les deviner serait pire que de rester en français et de le
 * déclarer.
 *
 * Règle : une langue explicite (`turn.language`) ou choisie par l'utilisateur (menu 8) est
 * toujours prioritaire. La détection ne s'applique qu'au silence de la passerelle, avec des
 * indices suffisants (score ≥ 3 et marge ≥ 1 sur le deuxième).
 */

import type { GatewayLanguage } from './i18n.js';

export interface LanguageGuess {
  readonly language: GatewayLanguage;
  readonly confidence: number;
  readonly cues: readonly string[];
}

type CueMap = Readonly<Record<string, number>>;

const CUES: Readonly<Record<GatewayLanguage, CueMap>> = {
  fr: {
    mon: 2, ma: 2, mes: 2, je: 2, j: 1, le: 1, la: 1, les: 1, des: 1, du: 2,
    quel: 2, quelle: 2, combien: 2, envoyer: 2, envoie: 2, envois: 2,
    solde: 3, frais: 3, historique: 3, facture: 3, credit: 2, crédit: 2,
    oui: 2, non: 2, merci: 2, bonjour: 3, salut: 2, parle: 2, langue: 2,
    compte: 2, argent: 2, transfert: 2, francais: 3, français: 3,
  },
  en: {
    my: 2, the: 1, is: 1, what: 2, how: 2, much: 2, want: 2, send: 2,
    please: 1, balance: 3, fees: 3, fee: 3, history: 3, bill: 3, airtime: 3,
    yes: 2, no: 1, thanks: 2, hello: 3, speak: 2, language: 2, transfer: 2,
    account: 3, money: 2, english: 3,
  },
  fub: {
    mi: 2, ɗum: 2, ceede: 3, njelu: 2, eey: 3, ala: 2, ka: 1, ngam: 2, ko: 2,
    neddo: 2, neldude: 3, neldu: 3, keɓoowo: 2, njoɓdi: 3, kerdii: 2,
    fakture: 2, wallu: 3, jam: 2, anndude: 2, keddiiɗe: 3, yiɗi: 2,
    fulfulde: 3, jaɓɓaama: 3, suɓo: 2, tabbitin: 2,
  },
};

const MIN_SCORE = 3;

export function detectLanguage(text: string, fallback: GatewayLanguage = 'fr'): LanguageGuess {
  const tokens = tokenize(text);
  if (tokens.length === 0) return { language: fallback, confidence: 0, cues: [] };

  const scores: Array<{ language: GatewayLanguage; score: number; cues: string[] }> = (
    ['fr', 'en', 'fub'] as const
  ).map((language) => {
    const cues = tokens.filter((token) => (CUES[language][token] ?? 0) > 0);
    const score = cues.reduce((total, token) => total + (CUES[language][token] ?? 0), 0);
    return { language, score, cues };
  });

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const runnerUp = scores[1];
  if (!best || !runnerUp) return { language: fallback, confidence: 0, cues: [] };

  const margin = best.score - runnerUp.score;
  if (best.score < MIN_SCORE || margin < 1) {
    return { language: fallback, confidence: 0, cues: [] };
  }

  return { language: best.language, confidence: best.score, cues: best.cues.slice(0, 5) };
}

/**
 * Choisit la langue du tour : explicite > choix de l'utilisateur > détection > langue en cours.
 * `source` sert à ne pas écraser un choix explicite par une détection ultérieure.
 */
export function resolveTurnLanguage(
  options: {
    readonly requested?: string | null;
    readonly current?: GatewayLanguage;
    readonly source?: 'turn' | 'detected' | 'user';
  },
  text: string,
): { language: GatewayLanguage; source: 'turn' | 'detected' | 'user'; confidence: number } {
  if (options.requested === 'fr' || options.requested === 'en' || options.requested === 'fub') {
    return { language: options.requested, source: 'turn', confidence: 3 };
  }
  if (options.source === 'user' && options.current) {
    return { language: options.current, source: 'user', confidence: 3 };
  }

  const guess = detectLanguage(text, options.current ?? 'fr');
  if (guess.confidence === 0) {
    return { language: options.current ?? 'fr', source: 'detected', confidence: 0 };
  }
  return { language: guess.language, source: 'detected', confidence: guess.confidence };
}

function tokenize(text: string): string[] {
  return String(text)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[^\p{L}']+/u)
    .map((token) => token.replace(/^'+|'+$/g, ''))
    .filter((token) => token.length > 0);
}
