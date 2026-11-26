/**
 * Le middleware : un tour SAFINUM entre, une réponse au contrat sort.
 *
 * Un seul point d'entrée pour les trois canaux, comme la passerelle qui POSTe sur une seule URL :
 * `ui_translation` part vers la traduction d'écran, tout le reste est un menu USSD.
 */

import { isUiTranslation, normalizeChannel, type InboundTurn, type SafinumChannel, type UiReply, type UssdReply } from './contract.js';
import { SafinumBank, type BankPort } from './bank.js';
import { handleUssd } from './ussd.js';
import { handleUi } from './ui.js';
import { InMemorySessions, type SessionStore } from './session.js';

export interface GatewayOptions {
  /** Clé d'équipe `sbx_…`. Jamais journalisée, jamais renvoyée au client. */
  readonly teamKey: string;
  /**
   * URL de base de l'API bancaire. Prioritaire sur le `bank_api.base_url` du tour : c'est ce qui
   * permet de pointer la banque de démonstration en local sans modifier les payloads officiels.
   * Chaîne vide = on suit le tour (comportement de la sandbox).
   */
  readonly bankUrl: string;
  readonly sessions?: SessionStore;
  readonly timeoutMs?: number;
  readonly strictStatus?: boolean;
  readonly fetchImpl?: typeof fetch;
  /** Injection pour les tests : évite tout appel réseau. */
  readonly bankFactory?: (turn: InboundTurn) => BankPort;
}

export interface HandledTurn {
  readonly reply: UssdReply | UiReply;
  readonly channel: SafinumChannel;
  readonly traceId: string;
}

export class Gateway {
  private readonly options: GatewayOptions;
  private readonly sessions: SessionStore;

  constructor(options: GatewayOptions) {
    this.options = options;
    this.sessions = options.sessions ?? new InMemorySessions();
  }

  async handle(turn: InboundTurn): Promise<UssdReply | UiReply> {
    return (await this.handleWithMeta(turn)).reply;
  }

  async handleWithMeta(turn: InboundTurn): Promise<HandledTurn> {
    const channel = normalizeChannel(turn.channel);
    const traceId = String(turn.trace_id ?? '');

    if (isUiTranslation(turn)) {
      return { reply: handleUi(turn), channel, traceId };
    }

    const bank = this.bankFactory(turn);
    const reply = await handleUssd(turn, {
      bank,
      sessions: this.sessions,
      ...(this.options.strictStatus === undefined ? {} : { strictStatus: this.options.strictStatus }),
    });

    return { reply, channel, traceId };
  }

  private bankFactory(turn: InboundTurn): BankPort {
    if (this.options.bankFactory) return this.options.bankFactory(turn);
    const baseUrl = this.options.bankUrl || turn.bank_api?.base_url || 'https://safinum.cm/api/v1';
    return new SafinumBank({
      baseUrl,
      teamKey: this.options.teamKey,
      traceId: String(turn.trace_id ?? ''),
      ...(this.options.timeoutMs === undefined ? {} : { timeoutMs: this.options.timeoutMs }),
      ...(this.options.fetchImpl === undefined ? {} : { fetchImpl: this.options.fetchImpl }),
    });
  }
}
