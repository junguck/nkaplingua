import type { LanguageCode, Reply, ReplyOption, TranslationStatus } from '@nkap/contracts';
import { MESSAGES } from '../lexicon/messages.lexicon';
import { TERMS_LEXICON } from '../lexicon/terms.lexicon';
import { resolveTemplate, type TemplateSet } from '../lexicon/types';
import type { MessageParams, Plan, PlanPart } from '../dialogue/plan';

export interface RenderedText {
  readonly text: string;
  readonly status: TranslationStatus;
  readonly fallback: boolean;
  /** Toutes les valeurs verrouillées se retrouvent à l'identique dans le texte. */
  readonly integrity: boolean;
  readonly key: string;
}

const TRUST: Readonly<Record<TranslationStatus, number>> = { reference: 5, validated: 4, attested: 3, proposed: 2, draft: 1 };

export function weakestStatus(statuses: readonly TranslationStatus[]): TranslationStatus {
  return statuses.reduce<TranslationStatus>((weakest, s) => (TRUST[s] < TRUST[weakest] ? s : weakest), 'reference');
}

const PLACEHOLDER_RE = /\{([A-Z]+)\}/g;

function placeholdersOf(template: string): string {
  return [...template.matchAll(PLACEHOLDER_RE)].map((m) => m[1] ?? '').sort().join(',');
}

function fill(template: string, params: MessageParams): string {
  return template.replace(PLACEHOLDER_RE, (whole, name: string) => params[name as keyof MessageParams] ?? whole);
}

/** Toutes les valeurs passées apparaissent telles quelles, et aucun emplacement n'est resté vide. */
function checkIntegrity(template: string, output: string, params: MessageParams): boolean {
  if (/\{[A-Z]+\}/.test(output)) return false;
  return [...template.matchAll(PLACEHOLDER_RE)].every((m) => {
    const value = params[(m[1] ?? '') as keyof MessageParams];
    return value !== undefined && output.includes(value);
  });
}

/** Rend un gabarit avec ses emplacements verrouillés ; repli français signalé si la traduction est invalide. */
export function renderTemplate(set: TemplateSet, lang: LanguageCode, params: MessageParams, key: string): RenderedText {
  const reference = set.fr;
  const target = resolveTemplate(set, lang);
  // Un gabarit traduit qui n'a pas exactement les mêmes emplacements que la référence est rejeté.
  if (target && placeholdersOf(target.text) === placeholdersOf(reference)) {
    const text = fill(target.text, params);
    if (checkIntegrity(target.text, text, params)) {
      return { text, status: target.status, fallback: false, integrity: true, key };
    }
  }
  const text = fill(reference, params);
  return { text, status: 'reference', fallback: lang !== 'fr', integrity: checkIntegrity(reference, text, params), key };
}

export function renderPart(part: PlanPart, lang: LanguageCode): RenderedText {
  if (part.kind === 'message') {
    return renderTemplate(MESSAGES[part.key], lang, part.params ?? {}, part.key);
  }
  const entry = TERMS_LEXICON[part.term];
  const label = renderTemplate(entry.label, lang, {}, `term.${part.term}.label`);
  const explanation = renderTemplate(entry.explanation, lang, {}, `term.${part.term}`);
  return {
    text: `${label.text} — ${explanation.text}`,
    status: weakestStatus([label.status, explanation.status]),
    fallback: label.fallback || explanation.fallback,
    integrity: label.integrity && explanation.integrity,
    key: `term.${part.term}`,
  };
}

export interface RenderedPlan {
  readonly reply: Reply;
  readonly integrity: boolean;
}

export function renderPlan(plan: Plan, lang: LanguageCode): RenderedPlan {
  const parts = plan.parts.map((p) => renderPart(p, lang));
  const options: ReplyOption[] = plan.options.map((o, i) => ({
    key: String(i + 1),
    label: renderPart(o.label, lang).text,
    input: o.input,
  }));
  const optionTexts = plan.options.map((o) => renderPart(o.label, lang));
  const all = [...parts, ...optionTexts];
  return {
    integrity: all.every((r) => r.integrity),
    reply: {
      lang,
      text: parts.map((p) => p.text).join(' '),
      parts: parts.map((p) => p.text),
      messageKeys: parts.map((p) => p.key),
      status: weakestStatus(all.map((r) => r.status)),
      fallback: all.some((r) => r.fallback),
      options,
      card: plan.card,
      endSession: plan.endSession,
    },
  };
}
