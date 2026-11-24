import { SimulatedBank } from '@nkap/banking-sim';
import type { ChannelId, LanguageCode, Trace, TurnInput, TurnResponse } from '@nkap/contracts';
import { NkapEngine } from '../src';

export interface Harness {
  readonly engine: NkapEngine;
  readonly bank: SimulatedBank;
  readonly traces: Trace[];
  say(text: string, opts?: { channel?: ChannelId; lang?: LanguageCode; userId?: string }): Promise<TurnResponse>;
  send(input: TurnInput, opts?: { channel?: ChannelId; lang?: LanguageCode }): Promise<TurnResponse>;
}

export function harness(defaultLang: LanguageCode = 'fr'): Harness {
  let id = 0;
  const traces: Trace[] = [];
  const bank = new SimulatedBank({ now: () => new Date('2026-11-25T10:00:00Z') });
  const engine = new NkapEngine({
    bank,
    defaultLang,
    team: 'NkapLingua',
    now: () => new Date('2026-11-25T10:00:00Z'),
    newId: () => `id-${++id}`,
    onTrace: (t) => traces.push(t),
  });
  const send: Harness['send'] = (input, opts = {}) =>
    engine.handleTurn({
      sessionId: 's-1',
      userId: 'amina',
      channel: opts.channel ?? 'web',
      ...(opts.lang ? { lang: opts.lang } : {}),
      input,
    });
  return {
    engine,
    bank,
    traces,
    send,
    say: (text, opts = {}) =>
      engine.handleTurn({
        sessionId: 's-1',
        userId: opts.userId ?? 'amina',
        channel: opts.channel ?? 'web',
        ...(opts.lang ? { lang: opts.lang } : {}),
        input: { kind: 'text', value: text },
      }),
  };
}
