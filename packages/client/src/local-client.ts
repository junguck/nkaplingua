import { SimulatedBank } from '@nkap/banking-sim';
import type { ChannelId, FinancialPort, LanguageCode, Trace, TurnInput, TurnResponse } from '@nkap/contracts';
import { NkapEngine, type SessionStore } from '@nkap/core';
import type { NkapClient, SendOptions } from './client';

export interface LocalClientOptions {
  readonly channel: ChannelId;
  readonly userId: string;
  readonly bank?: FinancialPort;
  readonly sessions?: SessionStore;
  readonly defaultLang?: LanguageCode;
  readonly sessionId?: string;
}

/**
 * Moteur linguistique embarqué dans le client : compréhension, dialogue et rendu tournent
 * sur l'appareil, sans réseau (< 5 ms par tour). La banque est simulée par défaut.
 */
export class LocalNkapClient implements NkapClient {
  readonly channel: ChannelId;
  readonly userId: string;
  readonly institutionName: string;
  private readonly bank: FinancialPort;
  private readonly engine: NkapEngine;
  private readonly sessionId: string;
  private readonly listeners = new Set<(trace: Trace) => void>();

  constructor(options: LocalClientOptions) {
    this.channel = options.channel;
    this.userId = options.userId;
    this.bank = options.bank ?? new SimulatedBank();
    this.institutionName = this.bank.institutionName;
    this.sessionId = options.sessionId ?? `${options.channel}-${Date.now().toString(36)}`;
    this.engine = new NkapEngine({
      bank: this.bank,
      ...(options.sessions ? { sessions: options.sessions } : {}),
      defaultLang: options.defaultLang ?? 'fr',
      onTrace: (trace) => {
        for (const listener of this.listeners) listener(trace);
      },
    });
  }

  send(input: TurnInput, options: SendOptions = {}): Promise<TurnResponse> {
    return this.engine.handleTurn({
      sessionId: this.sessionId,
      userId: this.userId,
      channel: this.channel,
      ...(options.lang ? { lang: options.lang } : {}),
      input,
    });
  }

  account() {
    return this.bank.getAccount(this.userId);
  }

  history(limit: number) {
    return this.bank.history(this.userId, limit);
  }

  onTrace(listener: (trace: Trace) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset(): Promise<void> {
    return this.engine.reset(this.userId);
  }
}
