import type { LanguageCode } from '@nkap/contracts';
import { MESSAGES, type MessageKey } from '../lexicon/messages.lexicon';
import { resolveTemplate, type TemplateSet } from '../lexicon/types';
import { fold } from '../text/normalize';
import { message, type MessageParams } from '../dialogue/plan';
import { renderPart, type RenderedText } from './renderer';

/**
 * Aller-retour de vérification : une traduction ne doit pas changer le sens de la référence française.
 * Le contrôle est déterministe (pas de modèle) : il porte sur des éléments qui ne doivent jamais bouger.
 *
 *  - `ambiguous`        : deux messages différents ont le même texte dans la langue cible ; en retraduisant
 *                         vers le français on ne sait plus lequel c'était.
 *  - `placeholders`     : les emplacements verrouillés ({AMOUNT}…) ne sont pas les mêmes.
 *  - `numbers`          : un nombre écrit dans la référence (« 3 fois ») a disparu.
 *  - `negation_lost`    : la référence interdit (« ne … jamais ») et la cible n'a aucun marqueur de négation.
 *
 * Limite assumée : seuls les gabarits connus sont contrôlés. Une phrase libre n'est pas vérifiée.
 */
export type RoundTripProblem = 'ambiguous' | 'placeholders' | 'numbers' | 'negation_lost';

export interface RoundTripFinding {
  readonly key: string;
  readonly lang: LanguageCode;
  readonly problem: RoundTripProblem;
  readonly detail: string;
}

const FR_NEGATION = /\b(?:ne|n')\b|\bjamais\b|\bpas\b|\bplus\b|\bsans\b|\bne\s+pas\b/iu;

/** Marqueurs de négation par langue cible (formes propres à chaque langue ; à enrichir avec les relecteurs). */
const NEGATION_CUES: Readonly<Partial<Record<LanguageCode, readonly string[]>>> = {
  en: ['never', 'not', "n't", 'no ', 'cannot', 'without'],
  fub: ['taa ', 'abada', 'naamnataa', 'alaa', 'walaa', 'hoto', 'waawaa', 'woɗɗaa'],
  wes: ['neva', 'no ', 'dont', "don't", 'no fit'],
};

const PLACEHOLDER_RE = /\{([A-Z]+)\}/g;

function placeholdersOf(text: string): string {
  return [...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1] ?? '').sort().join(',');
}

function numbersOf(text: string): string {
  return (text.replace(PLACEHOLDER_RE, ' ').match(/\d+/g) ?? []).sort().join(',');
}

function hasNegation(text: string, lang: LanguageCode): boolean | null {
  const cues = NEGATION_CUES[lang];
  if (!cues) return null;
  const haystack = ` ${fold(text)} `;
  return cues.some((cue) => haystack.includes(fold(cue)));
}

/** Comparaison pure d'un gabarit de référence et de sa traduction. */
export function compareTemplates(
  key: string,
  reference: string,
  target: string,
  lang: LanguageCode,
): RoundTripFinding[] {
  const findings: RoundTripFinding[] = [];
  const add = (problem: RoundTripProblem, detail: string): void => {
    findings.push({ key, lang, problem, detail });
  };
  if (placeholdersOf(reference) !== placeholdersOf(target)) {
    add('placeholders', `référence {${placeholdersOf(reference)}} ≠ cible {${placeholdersOf(target)}}`);
  }
  if (numbersOf(reference) !== numbersOf(target)) {
    add('numbers', `nombres de la référence : ${numbersOf(reference) || '—'} ; cible : ${numbersOf(target) || '—'}`);
  }
  if (FR_NEGATION.test(reference) && hasNegation(target, lang) === false) {
    add('negation_lost', 'la référence contient une interdiction, la cible n’a aucun marqueur de négation');
  }
  return findings;
}

function normalized(text: string): string {
  return fold(text.replace(PLACEHOLDER_RE, '{}'))
    .replace(/[^\p{L}\p{N}{}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function entries(lang: LanguageCode): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  for (const [key, set] of Object.entries(MESSAGES) as Array<[string, TemplateSet]>) {
    const target = lang === 'fr' ? null : resolveTemplate(set, lang);
    if (target) out.push([key, set.fr, target.text]);
  }
  return out;
}

export interface RoundTripAudit {
  readonly lang: LanguageCode;
  readonly checked: number;
  readonly findings: readonly RoundTripFinding[];
}

/** Contrôle tous les gabarits traduits d'une langue. */
export function auditRoundTrip(lang: LanguageCode): RoundTripAudit {
  const rows = entries(lang);
  const findings: RoundTripFinding[] = [];
  const seen = new Map<string, string>();
  for (const [key, reference, target] of rows) {
    findings.push(...compareTemplates(key, reference, target, lang));
    const norm = normalized(target);
    const other = seen.get(norm);
    // Deux libellés courts (« Frais ») peuvent légitimement se ressembler : seules les phrases comptent.
    if (other !== undefined && norm.split(' ').length > 2) {
      findings.push({ key, lang, problem: 'ambiguous', detail: `même texte que « ${other} » : impossible de retrouver le message d'origine` });
    } else {
      seen.set(norm, key);
    }
  }
  return { lang, checked: rows.length, findings };
}

export function verifyRoundTrip(key: MessageKey, lang: LanguageCode): RoundTripFinding[] {
  return auditRoundTrip(lang).findings.filter((f) => f.key === key || f.detail.includes(`« ${key} »`));
}

export interface VerifiedText extends RenderedText {
  readonly roundTrip: 'ok' | 'to_check';
  readonly findings: readonly RoundTripFinding[];
}

const auditCache = new Map<LanguageCode, RoundTripAudit>();

/** Rend un message ; si la traduction échoue au contrôle, le français est servi, marqué « à vérifier ». */
export function renderVerified(key: MessageKey, lang: LanguageCode, params: MessageParams = {}): VerifiedText {
  let audit = auditCache.get(lang);
  if (!audit) {
    audit = auditRoundTrip(lang);
    auditCache.set(lang, audit);
  }
  const findings = audit.findings.filter((f) => f.key === key || f.detail.includes(`« ${key} »`));
  if (lang !== 'fr' && findings.length > 0) {
    const fr = renderPart(message(key, params), 'fr');
    return { ...fr, status: 'reference', fallback: true, roundTrip: 'to_check', findings };
  }
  return { ...renderPart(message(key, params), lang), roundTrip: 'ok', findings: [] };
}
