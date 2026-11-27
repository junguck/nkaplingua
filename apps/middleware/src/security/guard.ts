/**
 * Garde-fous de la surface publique (le tunnel expose le middleware à tout Internet).
 */

import { timingSafeEqual, createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { REDIS } from '@nkap/lingua-core';

/** Comparaison à temps constant (pas de fuite du secret par mesure de durée). */
export function secretMatches(expected: string, received: string): boolean {
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(received).digest();
  return timingSafeEqual(a, b);
}

/** 237699000002 -> 2376*****002 : assez pour déboguer, pas assez pour identifier. */
export function maskPhone(phone: string): string {
  return phone.length <= 7 ? '***' : `${phone.slice(0, 4)}${'*'.repeat(phone.length - 7)}${phone.slice(-3)}`;
}

/** Vrai si l'URL bancaire reçue dans le payload n'est pas une origine autorisée (tentative d'exfiltration). */
export function isForeignBankUrl(received: string | undefined, allowed: readonly string[]): boolean {
  if (received === undefined) return false;
  try {
    return !allowed.includes(new URL(received).origin);
  } catch {
    return true;
  }
}

export interface RateLimiter {
  /** `true` si la requête passe. */
  hit(bucket: string): Promise<boolean>;
}

/** Fenêtre fixe d'une minute dans Redis : 1 aller-retour (INCR + EXPIRE en pipeline). */
export class RedisRateLimiter implements RateLimiter {
  readonly #redis: Redis;
  readonly #limit: number;

  constructor(redis: Redis, limitPerMinute: number) {
    this.#redis = redis;
    this.#limit = limitPerMinute;
  }

  async hit(bucket: string): Promise<boolean> {
    const key = REDIS.rate(`${bucket}:${Math.floor(Date.now() / 60_000)}`);
    const result = await this.#redis.multi().incr(key).expire(key, 70).exec();
    const count = Number(result?.[0]?.[1] ?? 0);
    return count <= this.#limit;
  }
}

export class MemoryRateLimiter implements RateLimiter {
  readonly #limit: number;
  readonly #hits = new Map<string, number>();

  constructor(limitPerMinute: number) {
    this.#limit = limitPerMinute;
  }

  async hit(bucket: string): Promise<boolean> {
    const key = `${bucket}:${Math.floor(Date.now() / 60_000)}`;
    const count = (this.#hits.get(key) ?? 0) + 1;
    this.#hits.set(key, count);
    return count <= this.#limit;
  }
}
