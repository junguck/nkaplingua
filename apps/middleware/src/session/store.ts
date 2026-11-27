/**
 * État de conversation. Ne contient AUCUN montant débité ni solde : après création d'une
 * opération, la seule vérité est la banque (on relit la transaction, jamais notre copie).
 */

import type { Redis } from 'ioredis';
import { z } from 'zod';
import { REDIS, languageSchema } from '@nkap/lingua-core';
import { screenSchema } from '../i18n/render.ts';

export const STEPS = [
  'menu',
  'transfer.to',
  'transfer.pick',
  'transfer.amount',
  'airtime.target',
  'airtime.phone',
  'airtime.amount',
  'bill.biller',
  'bill.amount',
  'fees.amount',
  'confirm',
  'edit.amount',
  'language',
  'help',
] as const;
export type Step = (typeof STEPS)[number];

const sessionSchema = z.object({
  step: z.enum(STEPS),
  lang: languageSchema.nullable(),
  /** Langue imposée par l'utilisateur (menu Langue), prioritaire sur celle du payload. */
  chosenLang: languageSchema.nullable(),
  to: z.string().nullable(),
  toName: z.string().nullable(),
  candidates: z.array(z.object({ name: z.string(), phone: z.string() })).max(9),
  /** Montant déjà dit par l'utilisateur avant que le bénéficiaire soit levé (jamais une donnée bancaire). */
  pendingAmount: z.number().int().positive().nullable(),
  biller: z.string().nullable(),
  kind: z.enum(['transfer', 'airtime', 'bill']).nullable(),
  txId: z.string().nullable(),
  /** Dernier écran affiché, pour le rejouer dans une autre langue sans perdre le fil. */
  screen: screenSchema.nullable(),
});
export type Session = z.infer<typeof sessionSchema>;

export function freshSession(): Session {
  return { step: 'menu', lang: null, chosenLang: null, to: null, toName: null, candidates: [], pendingAmount: null, biller: null, kind: null, txId: null, screen: null };
}

export interface SessionStore {
  get(channel: string, id: string): Promise<Session | null>;
  set(channel: string, id: string, session: Session, ttlSeconds: number): Promise<void>;
  delete(channel: string, id: string): Promise<void>;
}

export class RedisSessionStore implements SessionStore {
  readonly #redis: Redis;

  constructor(redis: Redis) {
    this.#redis = redis;
  }

  async get(channel: string, id: string): Promise<Session | null> {
    const raw = await this.#redis.get(REDIS.session(channel, id));
    if (raw === null) return null;
    try {
      const parsed = sessionSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async set(channel: string, id: string, session: Session, ttlSeconds: number): Promise<void> {
    await this.#redis.set(REDIS.session(channel, id), JSON.stringify(session), 'EX', ttlSeconds);
  }

  async delete(channel: string, id: string): Promise<void> {
    await this.#redis.del(REDIS.session(channel, id));
  }
}

export class MemorySessionStore implements SessionStore {
  readonly #map = new Map<string, { session: Session; expires: number }>();

  async get(channel: string, id: string): Promise<Session | null> {
    const hit = this.#map.get(REDIS.session(channel, id));
    if (hit === undefined || hit.expires < Date.now()) return null;
    return structuredClone(hit.session);
  }

  async set(channel: string, id: string, session: Session, ttlSeconds: number): Promise<void> {
    this.#map.set(REDIS.session(channel, id), { session: structuredClone(session), expires: Date.now() + ttlSeconds * 1000 });
  }

  async delete(channel: string, id: string): Promise<void> {
    this.#map.delete(REDIS.session(channel, id));
  }
}
