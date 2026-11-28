/**
 * Connexion bancaire maintenue chaude.
 *
 * Le fetch natif ferme une connexion inactive après 4 s ; entre deux tours USSD, l'usager lit et
 * tape bien plus longtemps, et chaque tour repaierait la poignée TCP + TLS. On installe un
 * dispatcher keep-alive de 60 s et on pingue l'origine bancaire toutes les 20 s.
 * Même version majeure d'undici que celle de Node : le fetch natif l'utilise directement.
 */

import { Agent, EnvHttpProxyAgent, setGlobalDispatcher, type Dispatcher } from 'undici';

export interface WarmBankOptions {
  readonly keepAliveMs?: number;
  readonly pingEveryMs?: number;
}

export function installWarmBank(bankUrl: string, options: WarmBankOptions = {}): () => void {
  const keepAliveTimeout = options.keepAliveMs ?? 60_000;
  const tuning = { keepAliveTimeout, keepAliveMaxTimeout: Math.max(keepAliveTimeout, 600_000), connections: 16 };
  const proxied = Boolean(process.env.HTTPS_PROXY ?? process.env.https_proxy);
  const dispatcher: Dispatcher = proxied ? new EnvHttpProxyAgent(tuning) : new Agent(tuning);
  setGlobalDispatcher(dispatcher);

  const origin = new URL(bankUrl).origin;
  const ping = (): void => {
    void fetch(origin, { method: 'HEAD', signal: AbortSignal.timeout(3_000) })
      .then((res) => res.body?.cancel())
      .catch(() => undefined);
  };
  ping();
  const timer = setInterval(ping, options.pingEveryMs ?? 20_000);
  timer.unref();
  return () => clearInterval(timer);
}
