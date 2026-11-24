import type { Account, BankingErrorCode, Transaction } from '@nkap/contracts';
import type { NkapClient } from './client';
import { Observable } from './emitter';

export interface WalletSnapshot {
  readonly account: Account | null;
  readonly history: readonly Transaction[];
  readonly loading: boolean;
  readonly error: BankingErrorCode | null;
}

const HISTORY_SIZE = 8;

/** Solde et historique, rafraîchis automatiquement après chaque opération exécutée. */
export class WalletStore extends Observable<WalletSnapshot> {
  private readonly unsubscribe: () => void;

  constructor(private readonly client: NkapClient) {
    super({ account: null, history: [], loading: true, error: null });
    this.unsubscribe = client.onTrace((trace) => {
      if (trace.status === 'executed') void this.refresh();
    });
  }

  async refresh(): Promise<void> {
    this.update({ loading: true });
    const [account, history] = await Promise.all([this.client.account(), this.client.history(HISTORY_SIZE)]);
    this.update(
      account.ok
        ? { account: account.value, history, loading: false, error: null }
        : { account: null, history, loading: false, error: account.error.code },
    );
  }

  dispose(): void {
    this.unsubscribe();
  }
}
