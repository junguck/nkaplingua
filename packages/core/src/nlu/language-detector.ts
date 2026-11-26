import { LANGUAGES, type LanguageCode } from '@nkap/contracts';
import { INTENT_CUES } from '../lexicon/intents.lexicon';
import { FUNCTION_WORDS } from '../lexicon/languages.lexicon';
import { containsCue } from '../text/normalize';

export interface LanguageGuess {
  readonly lang: LanguageCode;
  readonly confidence: number;
  /** Somme des indices trouvés : 0 = aucune preuve, on garde la langue de la conversation. */
  readonly evidence: number;
}

const CUE_WEIGHT = 2;

export function detectLanguage(folded: string, hint: LanguageCode): LanguageGuess {
  const scores = new Map<LanguageCode, number>(LANGUAGES.map((l) => [l, 0]));

  for (const lang of LANGUAGES) {
    let score = 0;
    for (const [word, weight] of FUNCTION_WORDS[lang]) if (containsCue(folded, word)) score += weight;
    for (const table of Object.values(INTENT_CUES)) {
      for (const [cue] of table?.[lang] ?? []) if (containsCue(folded, cue)) score += CUE_WEIGHT;
    }
    scores.set(lang, score);
  }

  const total = [...scores.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return { lang: hint, confidence: 0, evidence: 0 };

  const best = Math.max(...scores.values());
  const tied = LANGUAGES.filter((l) => scores.get(l) === best);
  const lang = tied.includes(hint) ? hint : (tied[0] ?? hint);
  return { lang, confidence: best / total, evidence: best };
}
