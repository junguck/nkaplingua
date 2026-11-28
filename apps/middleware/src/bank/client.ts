/**
 * Client de l'API bancaire SAFINUM.
 *
 * - `X-Team-Key` sur chaque appel, `X-Trace-Id` du tour recopié (sinon le jury ne voit rien).
 * - L'URL de base vient de la configuration, JAMAIS du payload : un `bank_api.base_url`
 *   forgé ferait partir notre clé d'équipe vers un serveur tiers.
 * - Timeout calculé sur l'échéance du tour (3 s en USSD, banque comprise).
 * - Les erreurs ne lèvent pas : elles reviennent typées pour être traduites.
 */

import { request, type Dispatcher } from 'undici';
import { z } from 'zod';

export type FeeType = 'transfer' | 'airtime' | 'bill' | 'withdrawal';

export interface CallContext {
  readonly traceId: string | null;
  /** Échéance absolue (performance.now()) du tour en cours. */
  readonly deadline: number;
}

const num = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]);

const accountSchema = z
  .object({ phone: z.string().optional(), holder: z.string().optional(), name: z.string().optional(), balance: num, currency: z.string().default('XAF') })
  .passthrough();
export type Account = z.infer<typeof accountSchema>;

const feeSchema = z.object({ amount: num, fee: num, total: num, currency: z.string().default('XAF') }).passthrough();
export type FeeQuote = z.infer<typeof feeSchema>;

const transactionSchema = z
  .object({
    id: z.string(),
    status: z.string().default('pending'),
    type: z.string().optional(),
    amount: num,
    fee: num.default(0),
    total: num.optional(),
    to: z.string().nullable().optional(),
    to_name: z.string().nullable().optional(),
    beneficiary: z.union([z.string(), z.object({ name: z.string().optional(), phone: z.string().optional() }).passthrough()]).nullable().optional(),
    operator: z.string().nullable().optional(),
    biller: z.string().nullable().optional(),
  })
  .passthrough();
export type Transaction = z.infer<typeof transactionSchema>;

const beneficiarySchema = z
  .object({ name: z.string().optional(), holder: z.string().optional(), phone: z.string() })
  .passthrough()
  .transform((b) => ({ name: b.name ?? b.holder ?? b.phone, phone: b.phone }));
export type Beneficiary = z.output<typeof beneficiarySchema>;

const beneficiaryListSchema = z.union([
  z.array(beneficiarySchema),
  z.object({ beneficiaries: z.array(beneficiarySchema) }).passthrough().transform((o) => o.beneficiaries),
  z.object({ data: z.array(beneficiarySchema) }).passthrough().transform((o) => o.data),
]);

const historyEntrySchema = z
  .object({
    id: z.string().optional(),
    type: z.string().optional(),
    direction: z.string().optional(),
    amount: num,
    label: z.string().optional(),
    counterparty: z.string().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

const historySchema = z.union([
  z.array(historyEntrySchema),
  z.object({ transactions: z.array(historyEntrySchema) }).passthrough().transform((o) => o.transactions),
  z.object({ data: z.array(historyEntrySchema) }).passthrough().transform((o) => o.data),
]);

const errorSchema = z
  .object({
    error: z.string().default('GENERIC'),
    message: z.string().optional(),
    candidates: z.array(beneficiarySchema).optional(),
  })
  .passthrough();

export type BankFailure = {
  readonly ok: false;
  readonly status: number;
  readonly code: string;
  readonly candidates: readonly Beneficiary[];
};
export type BankResult<T> = { readonly ok: true; readonly data: T } | BankFailure;

export interface BankPort {
  account(phone: string, ctx: CallContext): Promise<BankResult<Account>>;
  history(phone: string, limit: number, ctx: CallContext): Promise<BankResult<readonly HistoryEntry[]>>;
  fees(type: FeeType, amount: number, ctx: CallContext): Promise<BankResult<FeeQuote>>;
  beneficiaries(query: string, phone: string, ctx: CallContext): Promise<BankResult<readonly Beneficiary[]>>;
  create(body: CreateTransaction, ctx: CallContext): Promise<BankResult<Transaction>>;
  update(id: string, patch: { readonly amount?: number; readonly to?: string }, ctx: CallContext): Promise<BankResult<Transaction>>;
  confirm(id: string, ctx: CallContext): Promise<BankResult<Transaction>>;
  cancel(id: string, ctx: CallContext): Promise<BankResult<Transaction>>;
}

export type CreateTransaction =
  | { readonly type: 'transfer'; readonly from: string; readonly to: string; readonly amount: number }
  | { readonly type: 'airtime'; readonly from: string; readonly to: string; readonly amount: number }
  | { readonly type: 'bill'; readonly from: string; readonly biller: string; readonly amount: number };

export interface BankClientOptions {
  readonly baseUrl: string;
  readonly teamKey: string;
  readonly dispatcher: Dispatcher;
  /** Marge laissée pour sérialiser et renvoyer la réponse à la passerelle. */
  readonly marginMs?: number;
  readonly maxTimeoutMs?: number;
}

const enc = encodeURIComponent;

export class BankClient implements BankPort {
  readonly #base: URL;
  readonly #teamKey: string;
  readonly #dispatcher: Dispatcher;
  readonly #margin: number;
  readonly #cap: number;

  constructor(options: BankClientOptions) {
    this.#base = new URL(options.baseUrl.replace(/\/+$/, '') + '/');
    this.#teamKey = options.teamKey;
    this.#dispatcher = options.dispatcher;
    this.#margin = options.marginMs ?? 250;
    this.#cap = options.maxTimeoutMs ?? 2_500;
  }

  account(phone: string, ctx: CallContext): Promise<BankResult<Account>> {
    return this.#call('GET', `accounts/${enc(phone)}`, undefined, ctx, accountSchema);
  }

  history(phone: string, limit: number, ctx: CallContext): Promise<BankResult<readonly HistoryEntry[]>> {
    return this.#call('GET', `accounts/${enc(phone)}/transactions?limit=${limit}`, undefined, ctx, historySchema);
  }

  fees(type: FeeType, amount: number, ctx: CallContext): Promise<BankResult<FeeQuote>> {
    return this.#call('GET', `fees?type=${enc(type)}&amount=${amount}`, undefined, ctx, feeSchema);
  }

  beneficiaries(query: string, phone: string, ctx: CallContext): Promise<BankResult<readonly Beneficiary[]>> {
    return this.#call('GET', `beneficiaries?q=${enc(query)}&phone=${enc(phone)}`, undefined, ctx, beneficiaryListSchema);
  }

  create(body: CreateTransaction, ctx: CallContext): Promise<BankResult<Transaction>> {
    return this.#call('POST', 'transactions', body, ctx, transactionSchema);
  }

  update(id: string, patch: { readonly amount?: number; readonly to?: string }, ctx: CallContext): Promise<BankResult<Transaction>> {
    return this.#call('POST', `transactions/${enc(id)}/update`, patch, ctx, transactionSchema);
  }

  confirm(id: string, ctx: CallContext): Promise<BankResult<Transaction>> {
    return this.#call('POST', `transactions/${enc(id)}/confirm`, {}, ctx, transactionSchema);
  }

  cancel(id: string, ctx: CallContext): Promise<BankResult<Transaction>> {
    return this.#call('POST', `transactions/${enc(id)}/cancel`, {}, ctx, transactionSchema);
  }

  async #call<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    ctx: CallContext,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  ): Promise<BankResult<T>> {
    const budget = Math.floor(Math.min(this.#cap, ctx.deadline - performance.now() - this.#margin));
    if (budget <= 50) return { ok: false, status: 0, code: 'UNREACHABLE', candidates: [] };

    const headers: Record<string, string> = { accept: 'application/json', 'x-team-key': this.#teamKey };
    if (ctx.traceId !== null) headers['x-trace-id'] = ctx.traceId;
    if (body !== undefined) headers['content-type'] = 'application/json';

    const signal = AbortSignal.timeout(budget);
    try {
      const response = await request(new URL(path, this.#base), {
        method,
        headers,
        body: body === undefined ? null : JSON.stringify(body),
        dispatcher: this.#dispatcher,
        signal,
      });
      const json: unknown = await response.body.json().catch(() => ({}));
      if (response.statusCode >= 200 && response.statusCode < 300) {
        const parsed = schema.safeParse(json);
        return parsed.success
          ? { ok: true, data: parsed.data }
          : { ok: false, status: response.statusCode, code: 'BAD_BANK_RESPONSE', candidates: [] };
      }
      const failure = errorSchema.safeParse(json);
      return {
        ok: false,
        status: response.statusCode,
        code: failure.success ? failure.data.error : 'GENERIC',
        candidates: failure.success ? (failure.data.candidates ?? []) : [],
      };
    } catch {
      return { ok: false, status: 0, code: 'UNREACHABLE', candidates: [] };
    }
  }
}
