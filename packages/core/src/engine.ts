import {
  CHANNEL_PROFILES,
  type FinancialPort,
  type Interpretation,
  type LanguageCode,
  type Trace,
  type TurnInput,
  type TurnRequest,
  type TurnResponse,
} from '@nkap/contracts';
import { DialogueManager } from './dialogue/dialogue-manager';
import { InMemorySessionStore, newSession, type Session, type SessionStore } from './dialogue/session';
import { interpret } from './nlu/interpreter';
import { formatForChannel } from './render/channel-format';
import { renderPlan } from './render/renderer';
import { normalize } from './text/normalize';

export interface EngineOptions {
  readonly bank: FinancialPort;
  readonly sessions?: SessionStore;
  readonly team?: string;
  readonly defaultLang?: LanguageCode;
  readonly now?: () => Date;
  readonly newId?: () => string;
  /** Appelé à chaque tour : alimente le tableau de bord du jury, les journaux, l'audit. */
  readonly onTrace?: (trace: Trace) => void;
}

/** Seuil au-delà duquel on répond dans la langue que l'utilisateur vient d'employer. */
const LANGUAGE_FOLLOW_THRESHOLD = 0.6;

let fallbackCounter = 0;
const defaultId = (): string => `${Date.now().toString(36)}-${(fallbackCounter++).toString(36)}`;

/**
 * Point d'entrée unique de l'infrastructure linguistique.
 * Tous les canaux (application, web, USSD, SMS, SVI, GAB) appellent `handleTurn` :
 * même compréhension, même dialogue, même réponse — seule la mise en forme change.
 */
export class NkapEngine {
  private readonly sessions: SessionStore;
  private readonly dialogue: DialogueManager;
  private readonly newId: () => string;
  private readonly now: () => Date;

  constructor(private readonly options: EngineOptions) {
    this.sessions = options.sessions ?? new InMemorySessionStore();
    this.newId = options.newId ?? defaultId;
    this.now = options.now ?? (() => new Date());
    this.dialogue = new DialogueManager({ bank: options.bank, newId: this.newId });
  }

  async handleTurn(request: TurnRequest): Promise<TurnResponse> {
    const startedAt = Date.now();
    const session = (await this.sessions.get(request.userId)) ?? newSession(request.userId, request.lang ?? this.options.defaultLang ?? 'fr', request.channel);
    session.lastChannel = request.channel;
    session.turns += 1;
    if (request.lang !== undefined) session.lang = request.lang;

    const contacts = await this.options.bank.listContacts(request.userId);
    let interpretation = this.understand(request.input, session, contacts.map((c) => c.name));

    // « 1 », « 2 »… répond au dernier menu, quel que soit le canal où il a été affiché.
    const chosen = interpretation.slots.choice !== undefined ? session.lastOptions[interpretation.slots.choice - 1] : undefined;
    if (chosen !== undefined) interpretation = this.understand(chosen, session, []);

    if (request.lang === undefined && this.shouldFollowLanguage(interpretation, session)) session.lang = interpretation.lang;

    let plan;
    const errors: string[] = [];
    try {
      plan = await this.dialogue.step(session, interpretation, contacts);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      plan = await this.dialogue.step(session, { ...interpretation, intent: 'HELP' }, contacts);
    }

    const { reply, integrity } = renderPlan(plan, session.lang);
    session.lastOptions = reply.options.map((o) => o.input);
    await this.sessions.save(session);

    const trace: Trace = {
      id: this.newId(),
      at: this.now().toISOString(),
      team: this.options.team ?? 'NkapLingua',
      sessionId: request.sessionId,
      userId: request.userId,
      channel: request.channel,
      lang: session.lang,
      rawInput: rawOf(request.input),
      intent: interpretation.intent,
      confidence: interpretation.confidence,
      params: plan.params,
      response: formatForChannel(reply, CHANNEL_PROFILES[request.channel]),
      status: plan.status,
      latencyMs: Date.now() - startedAt,
      errors: [...plan.errors, ...errors],
      validation: { integrity, translationStatus: reply.status, fallback: reply.fallback },
    };
    this.options.onTrace?.(trace);

    return { reply, stage: plan.stage, interpretation, trace };
  }

  async reset(userId: string): Promise<void> {
    await this.sessions.reset(userId);
  }

  private understand(input: TurnInput, session: Session, knownNames: readonly string[]): Interpretation {
    if (input.kind === 'intent') {
      return {
        lang: session.lang,
        langConfidence: 1,
        intent: input.intent,
        confidence: 1,
        alternatives: [{ intent: input.intent, score: 1 }],
        slots: input.slots ?? {},
        isCorrection: false,
        cues: ['structured'],
        normalizedInput: input.intent,
      };
    }
    return interpret(input.value, { hintLang: session.lang, knownNames });
  }

  private shouldFollowLanguage(interp: Interpretation, session: Session): boolean {
    return (
      interp.intent !== 'CHANGE_LANGUAGE' &&
      interp.lang !== session.lang &&
      interp.langConfidence >= LANGUAGE_FOLLOW_THRESHOLD &&
      normalize(interp.normalizedInput).split(' ').length >= 2
    );
  }
}

function rawOf(input: TurnInput): string {
  return input.kind === 'intent' ? `[${input.intent}]${input.slots ? ' ' + JSON.stringify(input.slots) : ''}` : input.value;
}
