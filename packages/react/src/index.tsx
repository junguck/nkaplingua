import {
  ConversationStore,
  LocalNkapClient,
  WalletStore,
  type ConversationSnapshot,
  type NkapClient,
  type WalletSnapshot,
} from '@nkap/client';
import type { ChannelId } from '@nkap/contracts';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type JSX, type ReactNode } from 'react';

export interface NkapRuntime {
  readonly client: NkapClient;
  readonly chat: ConversationStore;
  readonly wallet: WalletStore;
}

export function createRuntime(client: NkapClient): NkapRuntime {
  return { client, chat: new ConversationStore(client), wallet: new WalletStore(client) };
}

/** Moteur embarqué : passer à la gateway (J1) = fournir un autre `NkapClient` au provider. */
export function createLocalRuntime(channel: ChannelId, userId: string): NkapRuntime {
  return createRuntime(new LocalNkapClient({ channel, userId }));
}

const NkapContext = createContext<NkapRuntime | null>(null);

interface NkapProviderProps {
  readonly create: () => NkapRuntime;
  readonly children: ReactNode;
}

export function NkapProvider({ create, children }: NkapProviderProps): JSX.Element {
  // Création paresseuse et unique : le moteur et la banque simulée vivent autant que l'application.
  const [runtime] = useState(create);
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
