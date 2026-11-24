import { BILLERS, LANGUAGES, TERMS, type BillerId, type LanguageCode, type TermId } from '@nkap/contracts';
import { INTENT_CUES } from '../lexicon/intents.lexicon';
import { LANGUAGE_NAMES } from '../lexicon/languages.lexicon';
import { TERMS_LEXICON } from '../lexicon/terms.lexicon';
import { containsCue, fold, tokenize } from '../text/normalize';
import { scanNumbers } from '../text/numbers';

export interface Entities {
  readonly amounts: readonly number[];
  readonly phones: readonly string[];
  readonly choice: number | null;
  readonly recipientQuery: string | null;
  readonly term: TermId | null;
  readonly biller: BillerId | null;
  readonly billReference: string | null;
  readonly targetLanguage: LanguageCode | null;
}

/** Mots qui introduisent le bénéficiaire, par langue (repliés). */
const RECIPIENT_CUES = new Set(['a', 'pour', 'chez', 'to', 'for', 'give', 'ka']);

/** Mots qui ne peuvent pas être un prénom inconnu. */
const NOT_A_NAME = new Set([
  'moi', 'lui', 'elle', 'eux', 'mon', 'mes', 'my', 'mi', 'maa', 'the', 'les', 'sur', 'dans', 'qui', 'que', 'quoi',
  'combien', 'quel', 'quelle', 'personne', 'someone', 'somebody', 'credit', 'facture', 'bill', 'agent', 'compte', 'account',
  'fon', 'phone', 'telephone', 'numero', 'number', 'nomba',
]);

const BILL_REFERENCE_RE = new RegExp(`(?:^|\\s)(${BILLERS.map((b) => b.toLowerCase()).join('|')})\\s+(?:numero\\s+|no\\s+|n\\s+)?(\\d{6,})(?=\\s|$)`);

export function extractEntities(raw: string, knownNames: readonly string[]): Entities {
  const folded = fold(raw);

  const billMatch = BILL_REFERENCE_RE.exec(folded);
  const billReference = billMatch?.[2] ?? null;
  const forNumbers = billMatch ? folded.replace(billMatch[2] ?? '', ' ') : folded;
  const numbers = scanNumbers(forNumbers);

  return {
    amounts: numbers.amounts,
    phones: numbers.phones,
    choice: numbers.choice,
    recipientQuery: findRecipient(folded, knownNames),
    term: findTerm(folded),
    biller: BILLERS.find((b) => containsCue(folded, b.toLowerCase())) ?? null,
    billReference,
    targetLanguage: LANGUAGES.find((l) => LANGUAGE_NAMES[l].some((n) => containsCue(folded, n))) ?? null,
  };
}

/**
 * Bénéficiaire : d'abord le carnet de contacts (entités dynamiques), puis le mot qui suit
 * « à / to / give / ka ». Une personne inconnue n'est jamais inventée : le dialogue demandera son numéro.
 */
function findRecipient(folded: string, knownNames: readonly string[]): string | null {
  const tokens = tokenize(folded);
  const tokenSet = new Set(tokens);

  let best: string | null = null;
  for (const name of knownNames) {
    const nameTokens = tokenize(fold(name)).filter((t) => t.length >= 3);
    const matched = nameTokens.filter((t) => tokenSet.has(t));
    if (matched.length > 0) {
      const candidate = matched.join(' ');
      if (best === null || candidate.length > best.length) best = candidate;
    }
  }
  if (best !== null) return best;

  for (let i = 0; i < tokens.length - 1; i++) {
    const cue = tokens[i] ?? '';
    const next = tokens[i + 1] ?? '';
    const plausibleName = /^\p{L}{3,}$/u.test(next) && !NOT_A_NAME.has(next) && !isLexiconWord(next);
    if (RECIPIENT_CUES.has(cue) && plausibleName && scanNumbers(next).amounts.length === 0) {
      return next;
    }
  }
  return null;
}

/** Mots du lexique d'intentions (« envoyer », « retirer »…) : jamais pris pour un prénom. */
const LEXICON_WORDS: ReadonlyArray<{ readonly word: string; readonly stem: boolean }> = Object.values(INTENT_CUES)
  .flatMap((table) => Object.values(table ?? {}).flatMap((list) => (list ?? []).map(([cue]) => cue)))
  .filter((cue) => !cue.includes(' '))
  .map((cue) => ({ word: fold(cue.replace(/\*$/, '')), stem: cue.endsWith('*') }));

function isLexiconWord(token: string): boolean {
  return LEXICON_WORDS.some(({ word, stem }) => (stem ? token.startsWith(word) : token === word));
}

function findTerm(folded: string): TermId | null {
  let best: { term: TermId; length: number } | null = null;
  for (const term of TERMS) {
    for (const cue of TERMS_LEXICON[term].cues) {
      if (containsCue(folded, cue) && (best === null || cue.length > best.length)) best = { term, length: cue.length };
    }
  }
  return best?.term ?? null;
}
