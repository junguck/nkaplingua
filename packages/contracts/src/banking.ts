import type { BillerId, Money, TransactionalIntent } from './intent';

/**
 * Port financier : ce qu'une institution implémente pour brancher son système sur NkapLingua.
 * Un adaptateur par institution (simulateur SAFINUM, banque A, EMF B…), un seul moteur linguistique.
 */

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export interface Account {
  readonly userId: string;
  readonly holderName: string;
  readonly phone: string;
  readonly balance: Money;
}

export interface Contact {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
}

export interface OperationDraft {
  readonly kind: TransactionalIntent;
  readonly amount: Money;
  readonly recipientPhone?: string;
  readonly recipientName?: string;
  readonly biller?: BillerId;
  readonly billReference?: string;
}

export interface FeeQuote {
  readonly amount: Money;
  readonly fee: Money;
  readonly total: Money;
}

export interface FeeBracket {
  readonly min: number;
  readonly max: number;
  readonly fee: number;
}

export type TransactionDirection = 'in' | 'out';

export interface Transaction {
  readonly id: string;
  readonly at: string;
  readonly kind: TransactionalIntent | 'DEPOSIT' | 'RECEIVE';
  readonly direction: TransactionDirection;
  readonly amount: Money;
  readonly fee: Money;
  readonly counterparty: string;
}

export interface ExecutionReceipt {
  readonly reference: string;
  readonly quote: FeeQuote;
  readonly balanceAfter: Money;
  /** Code de retrait à présenter à l'agent ou au GAB (WITHDRAW uniquement). */
  readonly withdrawalCode?: string;
}

export const BANKING_ERRORS = [
  'INSUFFICIENT_FUNDS',
  'LIMIT_EXCEEDED',
  'BELOW_MINIMUM',
  'UNKNOWN_RECIPIENT',
  'UNKNOWN_ACCOUNT',
  'BACKEND_UNAVAILABLE',
] as const;
export type BankingErrorCode = (typeof BANKING_ERRORS)[number];

export interface BankingError {
  readonly code: BankingErrorCode;
  /** Données utiles à l'explication (solde, plafond…), jamais un texte affiché tel quel. */
  readonly details?: Readonly<Record<string, number>>;
}

export interface FinancialPort {
  readonly institutionName: string;
  getAccount(userId: string): Promise<Result<Account, BankingError>>;
  listContacts(userId: string): Promise<readonly Contact[]>;
  feeSchedule(kind: TransactionalIntent): Promise<readonly FeeBracket[]>;
  quote(userId: string, draft: OperationDraft): Promise<Result<FeeQuote, BankingError>>;
  execute(userId: string, draft: OperationDraft, idempotencyKey: string): Promise<Result<ExecutionReceipt, BankingError>>;
  history(userId: string, limit: number): Promise<readonly Transaction[]>;
}
