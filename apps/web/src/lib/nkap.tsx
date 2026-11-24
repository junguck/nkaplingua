'use client';

import { ConversationStore, LocalNkapClient, WalletStore, type ConversationSnapshot, type NkapClient, type WalletSnapshot } from '@nkap/client';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type JSX, type ReactNode } from 'react';

export interface NkapRuntime {
  readonly client: NkapClient;
  readonly chat: ConversationStore;
  readonly wallet: WalletStore;
}

/** Un seul point de câblage : passer à la gateway (J1) = remplacer `LocalNkapClient` ici. */
function createRuntime(): NkapRuntime {
  const client = new LocalNkapClient({ channel: 'web', userId: 'amina' });
  return { client, chat: new ConversationStore(client), wallet: new WalletStore(client) };
}

const NkapContext = createContext<NkapRuntime | null>(null);

export function NkapProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [runtime] = useState(createRuntime);
  useEffect(() => {
    void runtime.wallet.refresh();
  }, [runtime]);
  return <NkapContext.Provider value={runtime}>{children}</NkapContext.Provider>;
}

export function useNkap(): NkapRuntime {
  const runtime = useContext(NkapContext);
  if (runtime === null) throw new Error('useNkap doit être utilisé sous <NkapProvider>');
  return runtime;
}

export function useConversation(): ConversationSnapshot {
  const { chat } = useNkap();
  return useSyncExternalStore(chat.subscribe, chat.getSnapshot, chat.getSnapshot);
}

export function useWallet(): WalletSnapshot {
  const { wallet } = useNkap();
  return useSyncExternalStore(wallet.subscribe, wallet.getSnapshot, wallet.getSnapshot);
}
