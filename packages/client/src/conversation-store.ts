import type { DialogueStage, LanguageCode, Reply, ReplyOption, Trace, TurnInput } from '@nkap/contracts';
import type { NkapClient } from './client';
import { Observable } from './emitter';

export type ChatMessage =
  | { readonly id: string; readonly role: 'user'; readonly text: string; readonly viaVoice: boolean }
  | { readonly id: string; readonly role: 'assistant'; readonly reply: Reply; readonly stage: DialogueStage; readonly trace: Trace };

export interface ConversationSnapshot {
  readonly messages: readonly ChatMessage[];
  readonly pending: boolean;
  readonly error: string | null;
  /** Langue de la dernière réponse : c'est le moteur qui décide, pas l'interface. */
  readonly lang: LanguageCode;
  readonly stage: DialogueStage;
}

/**
 * État d'une conversation avec l'assistant, partagé tel quel par le web et le mobile.
 * Un seul tour à la fois : une double frappe sur « Confirmer » n'envoie pas deux tours.
 */
export class ConversationStore extends Observable<ConversationSnapshot> {
  private sequence = 0;

  constructor(
    private readonly client: NkapClient,
    initialLang: LanguageCode = 'fr',
  ) {
    super({ messages: [], pending: false, error: null, lang: initialLang, stage: 'idle' });
  }

  sayText(text: string, viaVoice = false): Promise<void> {
    const value = text.trim();
    if (value.length === 0) return Promise.resolve();
    return this.turn(viaVoice ? { kind: 'voice', value } : { kind: 'text', value }, value, viaVoice);
  }

  /** Bouton de réponse (Oui / Non / choix d'un contact) : entrée structurée, aucune ambiguïté. */
  choose(option: ReplyOption): Promise<void> {
    return this.turn(option.input, option.label, false);
  }

  /** Action rapide du tableau de bord : même dialogue qu'une phrase, sans passer par la compréhension. */
  sendIntent(input: TurnInput, label: string): Promise<void> {
    return this.turn(input, label, false);
  }

  /** Le changement de langue passe par le moteur : la session suit, sur tous les canaux. */
  switchLanguage(lang: LanguageCode, label: string): Promise<void> {
    return this.turn({ kind: 'intent', intent: 'CHANGE_LANGUAGE', slots: { targetLanguage: lang } }, label, false);
  }

  private async turn(input: TurnInput, shownText: string, viaVoice: boolean): Promise<void> {
    if (this.getSnapshot().pending) return;
    const userMessage: ChatMessage = { id: this.nextId(), role: 'user', text: shownText, viaVoice };
    this.update({ messages: [...this.getSnapshot().messages, userMessage], pending: true, error: null });
    try {
      const response = await this.client.send(input);
      const assistant: ChatMessage = { id: this.nextId(), role: 'assistant', reply: response.reply, stage: response.stage, trace: response.trace };
      this.update({
        messages: [...this.getSnapshot().messages, assistant],
        pending: false,
        lang: response.reply.lang,
        stage: response.stage,
      });
    } catch (error) {
      this.update({ pending: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  private nextId(): string {
    this.sequence += 1;
    return `m${this.sequence}`;
  }
}
