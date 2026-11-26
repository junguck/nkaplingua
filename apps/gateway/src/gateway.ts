/**
 * Le middleware : un tour SAFINUM entre, une réponse au contrat sort.
 *
 * Un seul point d'entrée pour les trois canaux, comme la passerelle qui POSTe sur une seule URL :
 * `ui_translation` part vers la traduction d'écran, tout le reste est un menu USSD.
 */

import { isUiTranslation, normalizeChannel, type InboundTurn, type SafinumChannel, type StatusMode, type UiReply, type UssdReply } from '@nkap/safinum';
import { SafinumBank, type BankPort } from './bank.js';
import { handleUssd } from './ussd.js';
import { handleUi } from './ui.js';
import { InMemorySessions, type SessionStore } from './session.js';
import { Connectivity, ResilientBank, SyncQueue, TranslationCache, type Charset, type SyncSender } from './offline.js';
import { resolveLanguage } from './i18n.js';
import { resolveUiLanguage } from './ui-dictionaries.js';

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
  /** `contract` (défaut) : statuts observés seulement (SANDBOX-SAFINUM §8). `lifecycle` : cycle bancaire brut. */
  readonly statusMode?: StatusMode;
  readonly fetchImpl?: typeof fetch;
  /** Injection pour les tests : évite tout appel réseau. */
  readonly bankFactory?: (turn: InboundTurn) => BankPort;
  /** Mode hors-ligne d'abord. Tout est optionnel : par défaut, cache embarqué et file en mémoire. */
  readonly offline?: {
    readonly cache?: TranslationCache;
    readonly queue?: SyncQueue;
    readonly connectivity?: Connectivity;
    /** Envoie les corrections en attente au retour du réseau. Sans lui, la file attend. */
    readonly sender?: SyncSender;
    /** Fichier d'instantané du cache, relu au démarrage et réécrit à chaque correction. */
    readonly cacheFile?: string;
  };
}

export interface HandledTurn {
  readonly reply: UssdReply | UiReply;
  readonly channel: SafinumChannel;
  readonly traceId: string;
}

export class Gateway {
  private readonly options: GatewayOptions;
  private readonly sessions: SessionStore;
  readonly cache: TranslationCache;
  readonly queue: SyncQueue;
  readonly connectivity: Connectivity;

  constructor(options: GatewayOptions) {
    this.options = options;
    this.sessions = options.sessions ?? new InMemorySessions();
    this.cache = options.offline?.cache ?? TranslationCache.bundled();
    this.queue = options.offline?.queue ?? new SyncQueue();
    this.connectivity = options.offline?.connectivity ?? new Connectivity();
    if (options.offline?.cacheFile) this.cache.loadFrom(options.offline.cacheFile);
  }

  /**
   * Correction ou nouvelle traduction : appliquée tout de suite au cache local (valable hors-ligne),
   * puis mise en file pour la synchronisation. Retourne la raison du refus si une contrainte est violée.
   */
  correct(language: string, key: string, text: string, max_chars: number | null, charset: Charset = 'utf8'): string | null {
    const known = this.cache.get(language, key) !== undefined;
    const violation = this.cache.put(language, key, text, max_chars, charset);
    if (violation) return violation;
    this.queue.enqueue({ kind: known ? 'correction' : 'new', language, key, text, max_chars, charset });
    if (this.options.offline?.cacheFile) this.cache.saveTo(this.options.offline.cacheFile);
    if (!this.connectivity.isOffline) void this.sync();
    return null;
  }

  /** Rejoue la file de synchronisation. Sans `sender` configuré, ne fait rien. */
  async sync(): Promise<number> {
    const sender = this.options.offline?.sender;
    return sender ? this.queue.flush(sender) : 0;
  }

  async handle(turn: InboundTurn): Promise<UssdReply | UiReply> {
    return (await this.handleWithMeta(turn)).reply;
  }

  async handleWithMeta(turn: InboundTurn): Promise<HandledTurn> {
    const channel = normalizeChannel(turn.channel);
    const traceId = String(turn.trace_id ?? '');

    if (isUiTranslation(turn)) {
      const overlay = this.cache.uiStrings(resolveUiLanguage(turn.language));
      return { reply: handleUi(turn, overlay), channel, traceId };
    }

    const bank = this.bankFactory(turn);
    const reply = await this.ussd(turn, bank);
    return { reply, channel, traceId };
  }

  private async ussd(turn: InboundTurn, bank: BankPort): Promise<UssdReply> {
    const reply = await handleUssd(turn, {
      bank,
      sessions: this.sessions,
      ...(this.options.statusMode === undefined ? {} : { statusMode: this.options.statusMode }),
    });

    // Banque injoignable : on répond depuis le cache, menu pré-traduit, session ouverte.
    if (reply.interpretation.parameters.error === 'UNREACHABLE') {
      const language = resolveLanguage(reply.interpretation.language);
      this.sessions.delete(turn.session_id || turn.phone || 'sans-session');
      return {
        response: { text: this.cache.offlineMenu(language), end_session: false, options: [] },
        interpretation: { intent: 'UNKNOWN', parameters: { offline: true }, language },
        transaction: { id: null, status: 'none' },
      };
    }
    return reply;
  }

  private bankFactory(turn: InboundTurn): BankPort {
    const inner = this.rawBank(turn);
    return new ResilientBank(inner, this.connectivity, () => void this.sync());
  }

  private rawBank(turn: InboundTurn): BankPort {
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
