/**
 * Adaptateur des canaux conversationnels (ussd, sms, ivr) : langue, session, rendu,
 * budget de longueur du canal, réponse au format du contrat.
 */

import { isLanguage, ussdBudget, type Language, type Turn, type TurnResponse, type AudioChunk } from '@nkap/lingua-core';
import type { Catalog } from '../i18n/catalog.ts';
import { render, type Rendered, type Screen } from '../i18n/render.ts';
import type { Session, SessionStore } from '../session/store.ts';
import { converse, type EngineDeps } from './conversation.ts';

export const CHANNEL_RULES = {
  ussd: { timeoutMs: 3_000, ttlSeconds: 180, gsm7: true, maxChars: 182 },
  sms: { timeoutMs: 10_000, ttlSeconds: 900, gsm7: true, maxChars: 459 },
  ivr: { timeoutMs: 8_000, ttlSeconds: 300, gsm7: false, maxChars: 400 },
} as const;

export interface TurnDeps extends EngineDeps {
  readonly catalog: Catalog;
  readonly sessions: SessionStore;
  /** URL publique d'un enregistrement validé, ou `null`. */
  readonly audioUrl: (lang: Language, key: string) => string | null;
}

export interface TurnMeta {
  readonly traceId: string | null;
  readonly startedAt: number;
}

export interface TurnResult {
  readonly body: TurnResponse;
  readonly septets: number;
  readonly gsm7: boolean;
}

/** Si l'écran déborde, les options passent sur une ligne : jamais de troncature d'un récapitulatif. */
function fit(catalog: Catalog, s: Screen, lang: Language, gsm7: boolean, max: number): Rendered {
  const full = render(catalog, s, lang, gsm7);
  if (!gsm7 || ussdBudget(full.text, max).fits) return full;
  const compact = render(catalog, { lines: s.lines, options: [] }, lang, gsm7);
  const inline = s.options.map((o, i) => `${o.n}.${full.options[i] ?? ''}`).join(' ');
  return { ...full, text: inline === '' ? compact.text : `${compact.text}\n${inline}` };
}

function audioFor(deps: TurnDeps, s: Screen, rendered: Rendered): AudioChunk[] | undefined {
  if (s.options.some((o) => 'literal' in o.label)) return undefined;
  const chunks: AudioChunk[] = [];
  for (const key of rendered.keys) {
    const url = deps.audioUrl(rendered.language, key);
    if (url === null) return undefined;
    chunks.push({ url });
  }
  // Une ligne avec valeurs (montant...) n'a pas d'enregistrement fixe : le texte sera lu.
  if (s.lines.some((l) => l.vars !== undefined)) return undefined;
  return chunks.length > 0 ? chunks : undefined;
}

export async function handleTurn(turn: Turn, deps: TurnDeps, meta: TurnMeta): Promise<TurnResult> {
  const rules = CHANNEL_RULES[turn.channel];
  const sessionId = turn.channel === 'sms' ? turn.phone : (turn.session_id ?? turn.phone);
  const payloadLang = isLanguage(turn.language) ? turn.language : null;
  const previous = await deps.sessions.get(turn.channel, sessionId);
  const text = String(turn.input.text ?? '');
  const isSpeech = turn.input.type === 'audio' && text === '';

  const outcome = await converse(
    previous,
    {
      phone: turn.phone.replace(/^\+/, ''),
      text: isSpeech ? '' : text,
      ctx: { traceId: meta.traceId, deadline: meta.startedAt + rules.timeoutMs - 300 },
    },
    deps,
  );

  // La langue choisie dans le menu prime, sauf si la passerelle change de langue entre deux tours.
  const payloadChanged = previous !== null && payloadLang !== null && payloadLang !== previous.lang;
  const chosen = payloadChanged ? null : outcome.session.chosenLang;
  const lang: Language = chosen ?? payloadLang ?? 'fr';
  const rendered = fit(deps.catalog, outcome.screen, lang, rules.gsm7, rules.maxChars);
  const nextSession: Session = { ...outcome.session, chosenLang: chosen, lang: payloadLang };

  if (outcome.end) await deps.sessions.delete(turn.channel, sessionId);
  else await deps.sessions.set(turn.channel, sessionId, nextSession, rules.ttlSeconds);

  const budget = ussdBudget(rendered.text, rules.maxChars);
  const audio = turn.channel === 'ivr' ? audioFor(deps, outcome.screen, rendered) : undefined;

  const body: TurnResponse = {
    response: {
      text: rendered.text,
      end_session: outcome.end,
      options: rendered.options,
      ...(audio === undefined ? {} : { audio }),
    },
    interpretation: { intent: outcome.intent, parameters: outcome.params, language: rendered.language },
    transaction: outcome.tx,
  };
  return { body, septets: budget.length, gsm7: budget.gsm7 };
}
