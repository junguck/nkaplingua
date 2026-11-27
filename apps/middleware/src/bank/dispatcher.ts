/**
 * Pool HTTP vers la banque, gardé chaud.
 *
 * Le `fetch` global de Node garde une connexion 4 s seulement. Entre deux tours USSD,
 * l'utilisateur lit et tape : bien plus de 4 s. Chaque tour repaie alors DNS + TCP + TLS.
 * Ici : keep-alive long, et un ping périodique sur la même origine pour que le socket
 * TLS ne soit jamais froid quand le tour suivant arrive.
 */

import { Agent, EnvHttpProxyAgent, request, type Dispatcher } from 'undici';

export interface WarmPool {
  readonly dispatcher: Dispatcher;
  /** Ouvre la connexion tout de suite (appelé au démarrage). */
  warm(): Promise<number>;
  close(): Promise<void>;
}

export interface WarmPoolOptions {
  readonly origin: string;
  readonly keepAliveMs: number;
  readonly warmIntervalMs: number;
  readonly connections?: number;
}

function hasProxy(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy);
}

export function createWarmPool(options: WarmPoolOptions, env: NodeJS.ProcessEnv = process.env): WarmPool {
  const tuning = {
    keepAliveTimeout: options.keepAliveMs,
    keepAliveMaxTimeout: Math.max(options.keepAliveMs, 600_000),
    connections: options.connections ?? 16,
    connect: { timeout: 2_000 },
  } as const;

  const dispatcher: Dispatcher = hasProxy(env) ? new EnvHttpProxyAgent(tuning) : new Agent(tuning);

  const warm = async (): Promise<number> => {
    const started = performance.now();
    try {
      const response = await request(options.origin, {
        method: 'HEAD',
        dispatcher,
        headersTimeout: 3_000,
        bodyTimeout: 3_000,
      });
      await response.body.dump();
    } catch {
      // Un ping raté n'est pas une panne : le prochain vrai appel rouvrira la connexion.
    }
    return performance.now() - started;
  };

  const timer =
    options.warmIntervalMs > 0 ? setInterval(() => void warm(), options.warmIntervalMs).unref() : undefined;

  return {
    dispatcher,
    warm,
    async close(): Promise<void> {
      if (timer) clearInterval(timer);
      await dispatcher.close();
    },
  };
}
