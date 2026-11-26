import { LANGUAGES, type LanguageCode } from '@nkap/contracts';
import { INTENT_CUES } from '../lexicon/intents.lexicon';
import { FUNCTION_WORDS } from '../lexicon/languages.lexicon';
import { containsCue } from '../text/normalize';

export interface LanguageGuess {
  readonly lang: LanguageCode;
  readonly confidence: number;
  /** Somme des indices trouvés : 0 = aucune preuve, on garde la langue de la conversation. */
  readonly evidence: number;
  /** Écart avec la deuxième langue : 0 = égalité, la décision revient à l'indice de conversation. */
  readonly margin: number;
  /** Indices reconnus pour la langue retenue (explicabilité, traces jury). */
  readonly cues: readonly string[];
}

const CUE_WEIGHT = 2;

export function detectLanguage(folded: string, hint: LanguageCode): LanguageGuess {
  const scored = LANGUAGES.map((lang) => {
    let score = 0;
    const cues: string[] = [];
    for (const [word, weight] of FUNCTION_WORDS[lang]) {
      if (containsCue(folded, word)) {
        score += weight;
        cues.push(word);
      }
    }
    for (const table of Object.values(INTENT_CUES)) {
      for (const [cue] of table?.[lang] ?? []) {
        if (containsCue(folded, cue)) {
          score += CUE_WEIGHT;
          cues.push(cue);
        }
      }
    }
    return { lang, score, cues };
  });

  const total = scored.reduce((sum, s) => sum + s.score, 0);
  if (total === 0) return { lang: hint, confidence: 0, evidence: 0, margin: 0, cues: [] };

  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const best = ranked[0]?.score ?? 0;
  const second = ranked[1]?.score ?? 0;
  const tied = scored.filter((s) => s.score === best);
  const winner = tied.find((s) => s.lang === hint) ?? tied[0];
  if (winner === undefined) return { lang: hint, confidence: 0, evidence: 0, margin: 0, cues: [] };
  return { lang: winner.lang, confidence: best / total, evidence: best, margin: best - second, cues: winner.cues };
}
