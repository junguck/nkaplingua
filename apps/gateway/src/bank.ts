/**
 * Port financier vu par le middleware, et adaptateur `SafinumBank`.
 *
 * Deux en-têtes sur CHAQUE appel :
 *   X-Team-Key : la clé d'équipe (jamais dans le code, jamais dans les logs) ;
 *   X-Trace-Id : le `trace_id` du tour en cours, recopié tel quel.
 * Sans `X-Trace-Id`, la passerelle ne peut relier aucun de nos appels au tour : le jury
 * voit `NO_BANK_CALL` et tout le travail devient invisible.
 *
 * Les erreurs ne lèvent pas : elles reviennent en `{ ok: false, status, error }` pour que
 * le dialogue réponde une phrase lisible dans la langue de l'utilisateur.
 */

export type FeeType = 'transfer' | 'airtime' | 'bill';

export interface BankAccount {
  readonly phone: string;
  readonly holder: string;
  readonly balance: number;
  readonly currency: string;
}

export interface BankFeeQuote {
  readonly amount: number;
  readonly fee: number;
  readonly total: number;
  readonly currency: string;
}

export interface BankTransaction {
  readonly id: string;
  readonly status: string;
  readonly type: string;
  readonly amount: number;
  readonly fee: number;
  readonly total: number;
  readonly from?: string;
  readonly to?: string;
  readonly operator?: string;
  readonly biller?: string;
  readonly reference?: string;
  readonly balanceAfter?: number;
}

export interface BankHistoryEntry {
  readonly id: string;
  readonly at: string;
  readonly type: string;
  readonly direction: 'in' | 'out';
  readonly amount: number;
  readonly label: string;
}

export interface BankBeneficiary {
  readonly name: string;
  readonly phone: string;
}

export interface BankBiller {
  readonly code: string;
  readonly name: string;
  readonly kind: 'bill' | 'airtime';
}

export interface CreateTransactionInput {
  readonly type: FeeType;
  readonly from: string;
  readonly to: string;
  readonly amount: number;
  readonly biller?: string;
  readonly reference?: string;
}

export type BankFailure = {
  readonly ok: false;
  readonly status: number;
  readonly error: string;
  readonly message?: string;
  readonly candidates?: readonly BankBeneficiary[];
};

export type BankResult<T> = { readonly ok: true; readonly status: number; readonly data: T } | BankFailure;

export interface BankPort {
  account(phone: string): Promise<BankResult<BankAccount>>;
  fees(type: FeeType, amount: number): Promise<BankResult<BankFeeQuote>>;
  history(phone: string, limit: number): Promise<BankResult<readonly BankHistoryEntry[]>>;
  beneficiaries(query: string): Promise<BankResult<readonly BankBeneficiary[]>>;
  billers(): Promise<BankResult<readonly BankBiller[]>>;
  create(input: CreateTransactionInput): Promise<BankResult<BankTransaction>>;
  update(id: string, patch: { amount?: number; to?: string }): Promise<BankResult<BankTransaction>>;
  confirm(id: string): Promise<BankResult<BankTransaction>>;
  cancel(id: string): Promise<BankResult<BankTransaction>>;
}

export interface SafinumBankOptions {
  readonly baseUrl: string;
  readonly teamKey: string;
  readonly traceId: string;
  /** L'USSD n'a que 3 s pour tout le tour : un appel bancaire ne peut pas en manger la moitié. */
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 2_200;

export class SafinumBank implements BankPort {
  private readonly root: string;
  private readonly teamKey: string;
  private readonly traceId: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SafinumBankOptions) {
    this.root = options.baseUrl.replace(/\/+$/, '');
    this.teamKey = options.teamKey;
    this.traceId = options.traceId;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  account(phone: string): Promise<BankResult<BankAccount>> {
    return this.call('GET', `/accounts/${encodeURIComponent(phone)}`).then((r) =>
      r.ok ? { ok: true, status: r.status, data: readAccount(r.data, phone) } : r,
    );
  }

  fees(type: FeeType, amount: number): Promise<BankResult<BankFeeQuote>> {
    return this.call('GET', `/fees?type=${encodeURIComponent(type)}&amount=${encodeURIComponent(amount)}`).then((r) =>
      r.ok ? { ok: true, status: r.status, data: readFees(r.data, type, amount) } : r,
    );
  }

  history(phone: string, limit = 5): Promise<BankResult<readonly BankHistoryEntry[]>> {
    return this.call('GET', `/accounts/${encodeURIComponent(phone)}/transactions?limit=${limit}`).then((r) =>
      r.ok ? { ok: true, status: r.status, data: readHistory(r.data) } : r,
    );
  }

  beneficiaries(query: string): Promise<BankResult<readonly BankBeneficiary[]>> {
    return this.call('GET', `/beneficiaries?q=${encodeURIComponent(query)}`).then((r) =>
      r.ok ? { ok: true, status: r.status, data: readBeneficiaries(r.data) } : r,
    );
  }

  billers(): Promise<BankResult<readonly BankBiller[]>> {
    return this.call('GET', '/billers').then((r) =>
      r.ok ? { ok: true, status: r.status, data: readBillers(r.data) } : r,
    );
  }

  create(input: CreateTransactionInput): Promise<BankResult<BankTransaction>> {
    return this.call('POST', '/transactions', input).then((r) =>
      r.ok ? { ok: true, status: r.status, data: readTransaction(r.data) } : r,
    );
  }

  update(id: string, patch: { amount?: number; to?: string }): Promise<BankResult<BankTransaction>> {
    return this.call('POST', `/transactions/${encodeURIComponent(id)}/update`, patch).then((r) =>
      r.ok ? { ok: true, status: r.status, data: readTransaction(r.data) } : r,
    );
  }

  confirm(id: string): Promise<BankResult<BankTransaction>> {
    return this.call('POST', `/transactions/${encodeURIComponent(id)}/confirm`, {}).then((r) =>
      r.ok ? { ok: true, status: r.status, data: readTransaction(r.data) } : r,
    );
  }

  cancel(id: string): Promise<BankResult<BankTransaction>> {
    return this.call('POST', `/transactions/${encodeURIComponent(id)}/cancel`, {}).then((r) =>
      r.ok ? { ok: true, status: r.status, data: readTransaction(r.data) } : r,
    );
  }

  private async call(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<BankResult<unknown>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Team-Key': this.teamKey,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.traceId) headers['X-Trace-Id'] = this.traceId;

    try {
      const response = await this.fetchImpl(`${this.root}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const parsed: unknown = await response.json().catch(() => ({}));
      if (response.ok) return { ok: true, status: response.status, data: parsed };
      return failure(parsed, response.status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, status: 0, error: 'UNREACHABLE', message };
    }
  }
}

function failure(parsed: unknown, status: number): BankFailure {
  const body = asRecord(parsed);
  const error = typeof body.error === 'string' ? body.error : status === 401 ? 'UNAUTHORIZED' : 'BANK_ERROR';
  const message = typeof body.message === 'string' ? body.message : undefined;
  const candidates = Array.isArray(body.candidates) ? body.candidates.map(readBeneficiary).filter(isPresent) : undefined;
  const out: BankFailure = { ok: false, status, error };
  return candidates ? { ...out, message, candidates } : { ...out, message };
}

// ── Lecture tolérante des corps de réponse (le contrat exact de l'API n'est pas publié) ──

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function pickNumber(source: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function pickString(source: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return undefined;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function readAccount(body: unknown, phone: string): BankAccount {
  const record = asRecord(body);
  const nested = asRecord(record.account);
  const source = Object.keys(nested).length > 0 ? nested : record;
  return {
    phone: pickString(source, ['phone', 'msisdn', 'number']) ?? phone,
    holder: pickString(source, ['holder', 'holder_name', 'name', 'owner', 'account_name']) ?? '',
    balance: pickNumber(source, ['balance', 'available_balance', 'solde']) ?? 0,
    currency: pickString(source, ['currency', 'devise']) ?? 'XAF',
  };
}

function readFees(body: unknown, type: FeeType, amount: number): BankFeeQuote {
  const record = asRecord(body);
  const fee = pickNumber(record, ['fee', 'fees']) ?? 0;
  return {
    amount: pickNumber(record, ['amount', 'montant']) ?? amount,
    fee,
    total: pickNumber(record, ['total']) ?? amount + fee,
    currency: pickString(record, ['currency', 'devise']) ?? 'XAF',
  };
}

function readTransaction(body: unknown): BankTransaction {
  const record = asRecord(body);
  const nested = asRecord(record.transaction);
  const source = Object.keys(nested).length > 0 ? nested : record;
  const amount = pickNumber(source, ['amount', 'montant']) ?? 0;
  const fee = pickNumber(source, ['fee', 'fees']) ?? 0;
  return {
    id: pickString(source, ['id', 'transaction_id', 'reference', 'ref']) ?? '',
    status: pickString(source, ['status', 'state']) ?? 'pending',
    type: pickString(source, ['type', 'kind']) ?? 'transfer',
    amount,
    fee,
    total: pickNumber(source, ['total']) ?? amount + fee,
    from: pickString(source, ['from', 'sender']),
    to: pickString(source, ['to', 'recipient', 'beneficiary']),
    operator: pickString(source, ['operator']),
    biller: pickString(source, ['biller', 'biller_code']),
    reference: pickString(source, ['reference', 'bill_reference']),
    balanceAfter: pickNumber(source, ['balance_after', 'balanceAfter', 'new_balance']),
  };
}

function readBeneficiary(value: unknown): BankBeneficiary | null {
  const record = asRecord(value);
  const phone = pickString(record, ['phone', 'msisdn', 'number']);
  if (!phone) return null;
  return { name: pickString(record, ['name', 'holder', 'label']) ?? phone, phone };
}

function readBeneficiaries(body: unknown): readonly BankBeneficiary[] {
  const record = asRecord(body);
  const list = Array.isArray(body) ? body : Array.isArray(record.beneficiaries) ? record.beneficiaries : [];
  return list.map(readBeneficiary).filter(isPresent);
}

function readBillers(body: unknown): readonly BankBiller[] {
  const record = asRecord(body);
  const list = Array.isArray(body) ? body : Array.isArray(record.billers) ? record.billers : [];
  const codes = list.map((entry): BankBiller | null => {
    const item = asRecord(entry);
    const code = pickString(item, ['code', 'id', 'name']);
    if (!code) return null;
    return { code, name: pickString(item, ['name', 'label']) ?? code, kind: 'bill' as const };
  });
  const operators = Array.isArray(record.operators) ? record.operators : [];
  const operatorBillers = operators.map((entry): BankBiller | null => {
    const item = asRecord(entry);
    const code = pickString(item, ['code', 'id', 'name']);
    if (!code) return null;
    return { code, name: pickString(item, ['name', 'label']) ?? code, kind: 'airtime' as const };
  });
  return [...codes, ...operatorBillers].filter(isPresent);
}

function readHistory(body: unknown): readonly BankHistoryEntry[] {
  const record = asRecord(body);
  const list = Array.isArray(body) ? body : Array.isArray(record.transactions) ? record.transactions : [];
  const entries = list.map((entry): BankHistoryEntry | null => {
    const item = asRecord(entry);
    const id = pickString(item, ['id', 'transaction_id', 'reference']);
    if (!id) return null;
    const rawDirection = pickString(item, ['direction']) ?? pickString(item, ['type']) ?? 'out';
    return {
      id,
      at: pickString(item, ['at', 'date', 'created_at', 'timestamp']) ?? '',
      type: pickString(item, ['type', 'kind']) ?? 'transfer',
      direction: rawDirection === 'in' || rawDirection === 'credit' ? 'in' : 'out',
      amount: pickNumber(item, ['amount', 'montant']) ?? 0,
      label: pickString(item, ['label', 'counterparty', 'name', 'description']) ?? '',
    };
  });
  return entries.filter(isPresent);
}
