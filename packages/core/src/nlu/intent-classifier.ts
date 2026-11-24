import { INTENTS, type IntentName, type IntentScore } from '@nkap/contracts';
import { CANCEL_CUES, CONFIRM_CUES, INTENT_CUES } from '../lexicon/intents.lexicon';
import { POSSESSIVES, SWITCH_CUES } from '../lexicon/languages.lexicon';
import { containsCue, fold, startsWithCue, tokenize } from '../text/normalize';
import type { Entities } from './entities';

export interface Classification {
  readonly ranked: readonly IntentScore[];
  readonly cues: readonly string[];
}

/**
 * Classifieur à indices pondérés, toutes langues confondues : un utilisateur qui mélange
 * (« send 5000 a Paul », « neldu five tausand ») est compris. Déterministe, explicable,
 * instantané et hors ligne — un modèle statistique pourra s'ajouter derrière la même interface.
 */
export function classifyIntent(folded: string, entities: Entities): Classification {
  const scores = new Map<IntentName, number>(INTENTS.map((i) => [i, 0]));
  const cues: string[] = [];
  const counted = new Set<string>();
  const add = (intent: IntentName, weight: number, cue: string): void => {
    // Un même mot présent dans deux langues (« charges » en anglais et en pidgin) ne compte qu'une fois.
    const key = `${intent}:${fold(cue)}`;
    if (counted.has(key)) return;
    counted.add(key);
    scores.set(intent, (scores.get(intent) ?? 0) + weight);
    cues.push(`${intent}:${cue}`);
  };

  for (const [intent, table] of Object.entries(INTENT_CUES) as Array<[IntentName, (typeof INTENT_CUES)[IntentName]]>) {
    for (const list of Object.values(table ?? {})) {
      for (const [cue, weight] of list ?? []) if (containsCue(folded, cue)) add(intent, weight, cue);
    }
  }
  for (const [cue, weight] of CONFIRM_CUES) if (startsWithCue(folded, cue)) add('CONFIRM', weight, cue);
  for (const [cue, weight] of CANCEL_CUES) if (startsWithCue(folded, cue)) add('CANCEL', weight, cue);

  if (entities.targetLanguage !== null) {
    const short = tokenize(folded).length <= 3;
    const explicit = SWITCH_CUES.some((c) => containsCue(folded, c));
    if (short || explicit) add('CHANGE_LANGUAGE', 6, entities.targetLanguage);
  }

  // « Frais d'envoi », « frais de retrait » : la question porte sur les frais.
  if ((scores.get('CHECK_FEES') ?? 0) > 0) add('CHECK_FEES', 1, 'fees-focus');

  // « C'est quoi les frais ? » demande une définition. Mais « what is MY balance » ou
  // « c'est quoi les frais pour 5000 » demandent une valeur : pas d'explication.
  if ((scores.get('EXPLAIN_TERM') ?? 0) > 0) {
    const asksOwnValue = POSSESSIVES.some((p) => containsCue(folded, p)) || entities.amounts.length > 0;
    if (entities.term !== null && !asksOwnValue) add('EXPLAIN_TERM', 2, `term=${entities.term}`);
    else scores.set('EXPLAIN_TERM', 0);
  }

  const ranked = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .map(([intent, score]) => ({ intent, score }))
    .sort((a, b) => b.score - a.score);
  return { ranked, cues };
}
