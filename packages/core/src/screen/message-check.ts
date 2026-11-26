import type { LanguageCode, TranslationStatus } from '@nkap/contracts';
import { message } from '../dialogue/plan';
import { renderPart, weakestStatus, type RenderedText } from '../render/renderer';
import { detectScam, type ScamReason } from './scam';

export type MessageVerdict = 'suspect' | 'not_detected' | 'too_short';

/**
 * Réponse à « ce message est-il une arnaque ? ». Jamais « sûr » : l'absence de signe n'est pas une preuve,
 * et la réponse le dit. Rien n'est exécuté, aucun appel financier.
 */
export interface MessageCheck {
  readonly verdict: MessageVerdict;
  readonly reasons: readonly ScamReason[];
  /** Une ligne pour l'utilisateur, dans sa langue. */
  readonly headline: string;
  readonly advice: string | null;
  /** Un motif par ligne (« on vous demande un code secret »). */
  readonly reasonLines: readonly string[];
  readonly status: TranslationStatus;
  readonly fallback: boolean;
}

const MIN_WORDS = 6;

export function checkMessage(text: string, lang: LanguageCode): MessageCheck {
  const words = text.match(/\p{L}{2,}/gu)?.length ?? 0;
  const scam = detectScam(text);
  const verdict: MessageVerdict = words < MIN_WORDS ? 'too_short' : scam.suspicious ? 'suspect' : 'not_detected';

  const used: RenderedText[] = [];
  const say = (key: Parameters<typeof message>[0]): string => {
    const r = renderPart(message(key), lang);
    used.push(r);
    return r.text;
  };

  let headline: string;
  let advice: string | null = null;
  if (verdict === 'too_short') {
    headline = say('msgcheck.short.title');
  } else if (verdict === 'suspect') {
    headline = say('msgcheck.suspect.title');
    advice = say('msgcheck.suspect.advice');
  } else {
    headline = say('msgcheck.clear.title');
    advice = say('msgcheck.clear.advice');
  }

  // Les motifs pertinents sont listés même sous le seuil : ce sont des signaux à connaître.
  const reasons = verdict === 'too_short' ? [] : scam.reasons;
  const reasonLines = reasons.map((reason) => say(`screen.scam.reason.${reason}`));

  return {
    verdict,
    reasons,
    headline,
    advice,
    reasonLines,
    status: weakestStatus(used.map((r) => r.status)),
    fallback: used.some((r) => r.fallback),
  };
}
