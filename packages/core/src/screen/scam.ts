/**
 * Bouclier anti-arnaque, porté de l'extension de présélection (`apps/extension/lib/engine.js`).
 * Règles à poids sur le texte brut (français / anglais, les langues des interfaces sources) :
 * un seul indice faible ne suffit pas, il faut un score ≥ 3 dans une vraie phrase.
 */
export const SCAM_REASONS = [
  'askCode',
  'miracleGain',
  'payToReceive',
  'urgency',
  'mistakenTransfer',
  'blockThreat',
  'suspiciousLink',
  'ussdWithData',
] as const;
export type ScamReason = (typeof SCAM_REASONS)[number];

export interface ScamVerdict {
  readonly suspicious: boolean;
  readonly score: number;
  readonly reasons: readonly ScamReason[];
}

interface ScamRule {
  readonly reason: ScamReason;
  readonly weight: number;
  readonly pattern: RegExp;
  /** « Ne partagez jamais votre code » est un conseil, pas une arnaque. */
  readonly ignoreWhenNegated?: boolean;
}

const RULES: readonly ScamRule[] = [
  {
    reason: 'askCode',
    weight: 3,
    pattern: /(?:envoy|donn|communiqu|transmet|partag|indiqu|dict|send|give|share|tell|forward)\w*[^.!?]{0,40}\b(?:code|pin|otp|mot de passe|password)\b/iu,
    ignoreWhenNegated: true,
  },
  { reason: 'miracleGain', weight: 2, pattern: /\b(?:vous avez gagné|félicitations|gagnant|tombola|jackpot|you(?: have)? won|congratulations|winner|lottery|cadeau)\b/iu },
  {
    reason: 'payToReceive',
    weight: 3,
    pattern: /\b(?:frais de (?:déblocage|dossier|retrait du gain|activation)|pay(?:ez|er)?\b[^.!?]{0,30}\bpour (?:recevoir|débloquer)|pay\b[^.!?]{0,30}\bto (?:receive|unlock|claim))/iu,
  },
  { reason: 'urgency', weight: 1, pattern: /\b(?:urgent|immédiatement|tout de suite|dans les \d+ ?(?:minutes|heures)|sinon votre compte|immediately|within \d+ (?:minutes|hours))\b/iu },
  {
    reason: 'mistakenTransfer',
    weight: 3,
    pattern: /\b(?:envoyé par erreur|par erreur sur votre compte|renvoy\w*\s+(?:moi\s+)?(?:l'|le\s+)?argent|sent (?:it )?by mistake|send (?:it )?back|retourn\w* l'argent)\b/iu,
  },
  { reason: 'blockThreat', weight: 2, pattern: /\b(?:compte|account)\b[^.!?]{0,30}\b(?:sera|will be)\b[^.!?]{0,15}\b(?:bloqué|suspendu|fermé|blocked|suspended|closed)\b/iu },
  { reason: 'suspiciousLink', weight: 2, pattern: /(?:https?:\/\/(?!(?:www\.)?(?:localhost|127\.0\.0\.1))|bit\.ly|tinyurl|cliquez sur (?:ce|le) lien|click (?:this|the) link)/iu },
  { reason: 'ussdWithData', weight: 3, pattern: /#\d{2,4}\*[^#\s]*\*[^#\s]*#/u },
];

const NEGATION = /\b(?:ne|n')\b[^.!?]{0,60}\b(?:pas|jamais|plus|personne|aucun|aucune|rien)\b|\bjamais\b|\bnever\b|\b(?:do not|don't|does not|doesn't|must not|not)\b/iu;
const NOBODY = /\b(?:personne|anyone|nobody|aucun)\b/iu;

const SCAM_THRESHOLD = 3;
/** Un bouton ou un titre n'est pas un message d'escroc : il faut une vraie phrase. */
const MIN_WORDS = 6;

export function detectScam(text: string): ScamVerdict {
  let score = 0;
  const reasons: ScamReason[] = [];
  for (const rule of RULES) {
    const match = rule.pattern.exec(text);
    if (match === null) continue;
    if (rule.ignoreWhenNegated === true && isNegated(text, match.index, match[0].length)) continue;
    score += rule.weight;
    reasons.push(rule.reason);
  }
  const words = text.match(/\p{L}{2,}/gu)?.length ?? 0;
  return { suspicious: score >= SCAM_THRESHOLD && words >= MIN_WORDS, score, reasons };
}

function isNegated(text: string, index: number, length: number): boolean {
  const before = text.slice(Math.max(0, index - 40), index + length);
  const after = text.slice(index, index + length + 30);
  return NEGATION.test(before) || NOBODY.test(after);
}
