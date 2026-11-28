import type { IntentName, IntentSlots, Interpretation, LanguageCode } from '@nkap/contracts';
import { CORRECTION_LEADS, CORRECTION_MARKERS } from '../lexicon/intents.lexicon';
import { containsCue, fold, normalize, startsWithCue } from '../text/normalize';
import { extractEntities, type Entities } from './entities';
import { classifyIntent } from './intent-classifier';
import { detectLanguage } from './language-detector';

export interface InterpretContext {
  /** Langue de la conversation, utilisée quand l'énoncé ne permet pas de trancher. */
  readonly hintLang: LanguageCode;
  /** Noms du carnet de contacts : entités dynamiques propres à l'utilisateur. */
  readonly knownNames: readonly string[];
}

/** Texte libre → intention canonique + paramètres. Pur, synchrone, sans réseau. */
export function interpret(raw: string, ctx: InterpretContext): Interpretation {
  const folded = fold(raw);
  const entities = extractEntities(raw, ctx.knownNames);
  const language = detectLanguage(folded, ctx.hintLang);
  const { ranked, cues } = classifyIntent(folded, entities);

  const hasCorrectionCue =
    CORRECTION_LEADS.some((c) => startsWithCue(folded, c)) || CORRECTION_MARKERS.some((c) => containsCue(folded, c));
  const slots = buildSlots(entities, hasCorrectionCue);
  const carriesValues = slots.amount !== undefined || slots.recipientQuery !== undefined || slots.phone !== undefined;

  let intent: IntentName = ranked[0]?.intent ?? 'UNKNOWN';
  // « Non, 3000 » : un refus qui apporte une valeur est une correction, pas une annulation.
  const isCorrection = carriesValues && (hasCorrectionCue || intent === 'CANCEL');
  if (isCorrection && (intent === 'CANCEL' || intent === 'CONFIRM')) intent = 'UNKNOWN';

  return {
    lang: language.lang,
    langConfidence: round(language.confidence),
    intent,
    confidence: confidenceOf(ranked.map((r) => r.score)),
    alternatives: ranked.slice(0, 3),
    slots,
    isCorrection,
    cues,
    normalizedInput: normalize(raw),
  };
}

function buildSlots(e: Entities, correcting: boolean): IntentSlots {
  // En correction (« pas 5000, 3000 »), la dernière valeur dite est la bonne.
  const amount = correcting ? e.amounts[e.amounts.length - 1] : e.amounts[0];
  const slots: IntentSlots = {};
  if (amount !== undefined) slots.amount = { amount, currency: 'XAF' };
  if (e.phones[0] !== undefined) slots.phone = e.phones[0];
  if (e.recipientQuery !== null) slots.recipientQuery = e.recipientQuery;
  if (e.term !== null) slots.term = e.term;
  if (e.biller !== null) slots.biller = e.biller;
  if (e.billReference !== null) slots.billReference = e.billReference;
  if (e.targetLanguage !== null) slots.targetLanguage = e.targetLanguage;
  if (e.choice !== null) slots.choice = e.choice;
  return slots;
}

function confidenceOf(scores: readonly number[]): number {
  const [top = 0, second = 0] = scores;
  if (top === 0) return 0;
  const margin = top / (top + second);
  const strength = Math.min(1, top / 3);
  return round(margin * strength);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
