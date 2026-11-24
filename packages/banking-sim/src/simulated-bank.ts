import {
  err,
  ok,
  type Account,
  type BankingError,
  type Contact,
  type ExecutionReceipt,
  type FeeBracket,
  type FeeQuote,
  type FinancialPort,
  type OperationDraft,
  type Result,
  type Transaction,
  type TransactionalIntent,
} from '@nkap/contracts';
import { FEE_SCHEDULES, lookupFee } from './fees';

export interface SimUser {
  readonly userId: string;
  readonly holderName: string;
  readonly phone: string;
  readonly balance: number;
  readonly contacts: readonly Contact[];
  readonly history?: readonly Transaction[];
}

const xaf = (amount: number) => ({ amount, currency: 'XAF' as const });

export const DEMO_USERS: readonly SimUser[] = [
  {
    userId: 'amina',
    holderName: 'Amina Bello',
    phone: '690112233',
    balance: 50_000,
    contacts: [
      { id: 'c1', name: 'Paul Ndi', phone: '690000001' },
      { id: 'c2', name: 'Paul Mbarga', phone: '677000002' },
      { id: 'c3', name: 'Fadimatou Bouba', phone: '699000003' },
      { id: 'c4', name: 'Jean Essomba', phone: '655000004' },
      { id: 'c5', name: 'Maman', phone: '691000005' },
    ],
    history: [
      { id: 'h1', at: '2026-11-20T09:12:00Z', kind: 'RECEIVE', direction: 'in', amount: xaf(15_000), fee: xaf(0), counterparty: 'Jean Essomba' },
      { id: 'h2', at: '2026-11-21T17:40:00Z', kind: 'TRANSFER', direction: 'out', amount: xaf(5_000), fee: xaf(50), counterparty: 'Maman' },
      { id: 'h3', at: '2026-11-23T08:05:00Z', kind: 'PAY_BILL', direction: 'out', amount: xaf(7_500), fee: xaf(100), counterparty: 'ENEO' },
    ],
  },
  {
    userId: 'paul',
    holderName: 'Paul Ndi',
    phone: '690000001',
    balance: 12_000,
    contacts: [{ id: 'c1', name: 'Amina Bello', phone: '690112233' }],
  },
];

interface AccountState {
  account: Account;
  contacts: readonly Contact[];
  history: Transaction[];
}

export interface SimulatedBankOptions {
  readonly users?: readonly SimUser[];
  readonly now?: () => Date;
  readonly institutionName?: string;
  /** Simule une panne pour tester les messages d'erreur. */
  readonly unavailable?: boolean;
}

/**
 * Backend financier simulé, conforme au port `FinancialPort`.
 * Il sera remplacé (ou complété) par l'adaptateur du sandbox SAFINUM dès réception de sa documentation :
 * aucune ligne du moteur linguistique ne change.
 */
export class SimulatedBank implements FinancialPort {
  readonly institutionName: string;
  private readonly accounts = new Map<string, AccountState>();
  private readonly receipts = new Map<string, ExecutionReceipt>();
  private readonly now: () => Date;
  private readonly unavailable: boolean;
  private sequence = 0;

  constructor(options: SimulatedBankOptions = {}) {
    this.institutionName = options.institutionName ?? 'Mboa Pay (simulé)';
    this.now = options.now ?? (() => new Date());
    this.unavailable = options.unavailable ?? false;
    for (const u of options.users ?? DEMO_USERS) {
      this.accounts.set(u.userId, {
        account: { userId: u.userId, holderName: u.holderName, phone: u.phone, balance: xaf(u.balance) },
        contacts: u.contacts,
        history: [...(u.history ?? [])],
      });
    }
  }

  async getAccount(userId: string): Promise<Result<Account, BankingError>> {
    if (this.unavailable) return err({ code: 'BACKEND_UNAVAILABLE' });
    const state = this.accounts.get(userId);
    return state ? ok(state.account) : err({ code: 'UNKNOWN_ACCOUNT' });
  }

  async listContacts(userId: string): Promise<readonly Contact[]> {
    return this.accounts.get(userId)?.contacts ?? [];
  }

  async feeSchedule(kind: TransactionalIntent): Promise<readonly FeeBracket[]> {
    return FEE_SCHEDULES[kind];
  }

  async quote(_userId: string, draft: OperationDraft): Promise<Result<FeeQuote, BankingError>> {
    if (this.unavailable) return err({ code: 'BACKEND_UNAVAILABLE' });
    const lookup = lookupFee(draft.kind, draft.amount.amount);
    if (!lookup.ok) {
      const details: Record<string, number> = lookup.reason === 'BELOW_MINIMUM' ? { min: lookup.bound } : { max: lookup.bound };
      return err({ code: lookup.reason, details });
    }
    return ok({ amount: draft.amount, fee: xaf(lookup.fee), total: xaf(draft.amount.amount + lookup.fee) });
  }

  async execute(userId: string, draft: OperationDraft, idempotencyKey: string): Promise<Result<ExecutionReceipt, BankingError>> {
    const previous = this.receipts.get(idempotencyKey);
    if (previous) return ok(previous);

    const state = this.accounts.get(userId);
    if (!state) return err({ code: 'UNKNOWN_ACCOUNT' });
    const quoted = await this.quote(userId, draft);
    if (!quoted.ok) return quoted;
    const quote = quoted.value;

    const balance = state.account.balance.amount;
    if (balance < quote.total.amount) {
      return err({ code: 'INSUFFICIENT_FUNDS', details: { total: quote.total.amount, balance } });
    }
    if (draft.kind === 'TRANSFER' && draft.recipientPhone === undefined) return err({ code: 'UNKNOWN_RECIPIENT' });

    this.sequence += 1;
    const reference = `MBP${String(this.sequence).padStart(8, '0')}`;
    const at = this.now().toISOString();
    state.account = { ...state.account, balance: xaf(balance - quote.total.amount) };
    state.history.push({
      id: reference,
      at,
      kind: draft.kind,
      direction: 'out',
      amount: quote.amount,
      fee: quote.fee,
      counterparty: draft.recipientName ?? draft.biller ?? draft.recipientPhone ?? 'Agent',
    });
    this.creditInternalRecipient(draft, state.account, reference, at);

    const receipt: ExecutionReceipt = {
      reference,
      quote,
      balanceAfter: state.account.balance,
      ...(draft.kind === 'WITHDRAW' ? { withdrawalCode: String(100_000 + ((this.sequence * 7919) % 900_000)) } : {}),
    };
    this.receipts.set(idempotencyKey, receipt);
    return ok(receipt);
  }

  async history(userId: string, limit: number): Promise<readonly Transaction[]> {
    const items = this.accounts.get(userId)?.history ?? [];
    return [...items].reverse().slice(0, limit);
  }

  /** Un transfert vers un autre client du simulateur crédite réellement son compte. */
  private creditInternalRecipient(draft: OperationDraft, sender: Account, reference: string, at: string): void {
    if (draft.kind !== 'TRANSFER') return;
    const target = [...this.accounts.values()].find((s) => s.account.phone === draft.recipientPhone);
    if (!target) return;
    target.account = { ...target.account, balance: xaf(target.account.balance.amount + draft.amount.amount) };
    target.history.push({ id: `${reference}-IN`, at, kind: 'RECEIVE', direction: 'in', amount: draft.amount, fee: xaf(0), counterparty: sender.holderName });
  }
}
