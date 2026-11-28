/**
 * Garde-fous de la surface publique : le tunnel expose le middleware à tout Internet,
 * et le middleware détient la clé d'équipe.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

export const SAFINUM_ORIGIN = 'https://safinum.cm';

/**
 * Seules la sandbox SAFINUM, la boucle locale et les hôtes nommés explicitement par l'exploitant
 * (`BANK_ALLOWED_HOSTS`, ex. la banque de démonstration d'un réseau Docker) reçoivent notre clé.
 */
export function isAllowedBankUrl(raw: string, extraHosts: readonly string[] = []): boolean {
  try {
    const url = new URL(raw);
    if (url.origin === SAFINUM_ORIGIN) return true;
    return url.protocol.startsWith('http') && ['127.0.0.1', 'localhost', '[::1]', ...extraHosts].includes(url.hostname);
  } catch {
    return false;
  }
}

/** Comparaison à temps constant : la durée de la réponse ne trahit pas le secret. */
export function secretMatches(expected: string, received: string): boolean {
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(received).digest();
  return timingSafeEqual(a, b);
}

export type HookRouting = { readonly ok: true; readonly path: string } | { readonly ok: false };

/**
 * Avec un secret configuré, seules les routes `/hook/<secret>/...` mènent au contrat ;
 * le reste du chemin est rendu tel quel (`/hook/<secret>` vaut `/`).
 */
export function routeHook(pathname: string, secret: string | null): HookRouting {
  if (secret === null) return { ok: true, path: pathname };
  const match = /^\/hook\/([^/]+)(\/.*)?$/.exec(pathname);
  if (match?.[1] === undefined || !secretMatches(secret, match[1])) return { ok: false };
  return { ok: true, path: match[2] ?? '/' };
}

/** Fenêtre fixe d'une minute par numéro : protège la banque d'un usage abusif à travers nous. */
export class RateLimiter {
  private readonly limit: number;
  private readonly hits = new Map<string, number>();
  private window = 0;

  constructor(limitPerMinute: number) {
    this.limit = limitPerMinute;
  }

  allow(bucket: string, now: number = Date.now()): boolean {
    const window = Math.floor(now / 60_000);
    if (window !== this.window) {
      this.window = window;
      this.hits.clear();
    }
    const count = (this.hits.get(bucket) ?? 0) + 1;
    this.hits.set(bucket, count);
    return count <= this.limit;
  }
}
