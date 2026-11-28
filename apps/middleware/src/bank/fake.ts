/**
 * Banque simulée, fidèle aux règles publiées de la sandbox (grille de frais, plafond,
 * homonymes, cycle pending -> confirmed/cancelled). Sert aux tests et aux mesures,
 * exposée en HTTP pour exercer le vrai `BankClient`.
 */

import { createServer, type Server } from 'node:http';
import { z } from 'zod';

const bodySchema = z.record(z.unknown());

interface Tier {
  readonly min: number;
  readonly max: number | null;
  readonly flat: number | null;
  readonly rate: number | null;
}

const TRANSFER: readonly Tier[] = [
  { min: 1, max: 5000, flat: 50, rate: null },
  { min: 5001, max: 25000, flat: 150, rate: null },
  { min: 25001, max: 100000, flat: 400, rate: null },
  { min: 100001, max: null, flat: null, rate: 0.01 },
];
const GRID: Readonly<Record<string, readonly Tier[]>> = {
  transfer: TRANSFER,
  withdrawal: TRANSFER,
  airtime: [{ min: 1, max: null, flat: 0, rate: null }],
  bill: [{ min: 1, max: null, flat: 100, rate: null }],
};
export const MAX_AMOUNT = 500_000;

export function feeFor(type: string, amount: number): number {
  const tier = (GRID[type] ?? TRANSFER).find((t) => amount >= t.min && (t.max === null || amount <= t.max));
  if (tier === undefined) return 0;
  return tier.flat ?? Math.round(amount * (tier.rate ?? 0));
}

const OPERATORS: readonly { readonly code: string; readonly prefixes: readonly string[] }[] = [
  { code: 'MTN', prefixes: ['67', '650', '651', '652', '653', '654'] },
  { code: 'ORANGE', prefixes: ['69', '655', '656', '657', '658', '659'] },
  { code: 'CAMTEL', prefixes: ['620', '621', '622'] },
];

function operatorOf(phone: string): string | null {
  const local = phone.replace(/^237/, '');
  return OPERATORS.find((o) => o.prefixes.some((p) => local.startsWith(p)))?.code ?? null;
}

interface Tx {
  id: string;
  type: string;
  from: string;
  to: string | null;
  biller: string | null;
  operator: string | null;
  amount: number;
  fee: number;
  total: number;
  status: 'pending' | 'confirmed' | 'cancelled';
}

type Reply = { readonly status: number; readonly body: unknown };

export class FakeBank {
  readonly accounts = new Map<string, { holder: string; balance: number; history: { type: string; direction: string; amount: number; label: string }[] }>();
  readonly txs = new Map<string, Tx>();
  readonly calls: { method: string; path: string; traceId: string | null }[] = [];
  #seq = 0;

  constructor() {
    this.accounts.set('237699000001', { holder: 'Awa Bello', balance: 100_000, history: [] });
    this.accounts.set('237677000001', { holder: 'Paul Mbarga', balance: 12_000, history: [] });
    this.accounts.set('237690000002', { holder: 'Paul Etoa', balance: 80_000, history: [] });
    this.accounts.set('237655000004', { holder: 'Ngo Bassa', balance: 1_000, history: [] });
    this.accounts.set('237699000003', { holder: 'Fadimatou Bouba', balance: 250_000, history: [] });
  }

  handle(method: string, url: string, body: Record<string, unknown>, traceId: string | null): Reply {
    const u = new URL(url, 'http://bank');
    const path = u.pathname.replace(/^\/api\/v1/, '');
    this.calls.push({ method, path, traceId });
    const parts = path.split('/').filter(Boolean);

    if (method === 'GET' && parts[0] === 'accounts' && parts.length === 2) {
      const acc = this.accounts.get(parts[1] ?? '');
      return acc ? { status: 200, body: { phone: parts[1], holder: acc.holder, balance: acc.balance, currency: 'XAF' } } : err(404, 'UNKNOWN_ACCOUNT');
    }
    if (method === 'GET' && parts[0] === 'accounts' && parts[2] === 'transactions') {
      const acc = this.accounts.get(parts[1] ?? '');
      if (!acc) return err(404, 'UNKNOWN_ACCOUNT');
      const limit = Number(u.searchParams.get('limit') ?? 10);
      return { status: 200, body: { transactions: acc.history.slice(-limit).reverse() } };
    }
    if (method === 'GET' && parts[0] === 'fees') {
      const amount = Number(u.searchParams.get('amount'));
      if (!Number.isInteger(amount) || amount <= 0) return err(422, 'INVALID_AMOUNT');
      const fee = feeFor(u.searchParams.get('type') ?? 'transfer', amount);
      return { status: 200, body: { amount, fee, total: amount + fee, currency: 'XAF', max_amount: MAX_AMOUNT } };
    }
    if (method === 'GET' && parts[0] === 'beneficiaries') {
      const q = (u.searchParams.get('q') ?? '').toLowerCase().trim();
      const digits = q.replace(/\D/g, '');
      const list = [...this.accounts.entries()]
        .filter(([phone, a]) => (q !== '' && a.holder.toLowerCase().includes(q)) || (digits.length >= 3 && phone.includes(digits)))
        .map(([phone, a]) => ({ name: a.holder, phone }));
      return { status: 200, body: { beneficiaries: list } };
    }
    if (method === 'POST' && path === '/transactions') return this.#create(body);
    if (method === 'POST' && parts[0] === 'transactions' && parts.length === 3) {
      const tx = this.txs.get(parts[1] ?? '');
      if (!tx) return err(404, 'TX_NOT_FOUND');
      if (tx.status !== 'pending') return err(409, 'TX_NOT_PENDING');
      if (parts[2] === 'cancel') {
        tx.status = 'cancelled';
        return { status: 200, body: tx };
      }
      if (parts[2] === 'update') {
        const amount = Number(body.amount ?? tx.amount);
        const check = this.#check(tx.type, tx.from, amount);
        if (check) return check;
        tx.amount = amount;
        tx.fee = feeFor(tx.type, amount);
        tx.total = amount + tx.fee;
        return { status: 200, body: tx };
      }
      if (parts[2] === 'confirm') {
        const check = this.#check(tx.type, tx.from, tx.amount);
        if (check) return check;
        const from = this.accounts.get(tx.from);
        if (from) {
          from.balance -= tx.total;
          from.history.push({ type: tx.type, direction: 'out', amount: tx.amount, label: tx.biller ?? tx.to ?? '' });
        }
        const to = tx.type === 'transfer' && tx.to ? this.accounts.get(tx.to) : undefined;
        if (to) {
          to.balance += tx.amount;
          to.history.push({ type: 'transfer', direction: 'in', amount: tx.amount, label: from?.holder ?? tx.from });
        }
        tx.status = 'confirmed';
        return { status: 200, body: tx };
      }
    }
    return err(404, 'NOT_FOUND');
  }

  #check(type: string, from: string, amount: number): Reply | null {
    if (!Number.isInteger(amount) || amount <= 0) return err(422, 'INVALID_AMOUNT');
    if (amount > MAX_AMOUNT) return err(422, 'LIMIT_EXCEEDED');
    const acc = this.accounts.get(from);
    if (!acc) return err(404, 'UNKNOWN_ACCOUNT');
    if (acc.balance < amount + feeFor(type, amount)) return err(422, 'INSUFFICIENT_FUNDS');
    return null;
  }

  #create(body: Record<string, unknown>): Reply {
    const type = String(body.type ?? '');
    const from = String(body.from ?? '');
    const amount = Number(body.amount);
    let to: string | null = typeof body.to === 'string' ? body.to.replace(/^(?=6)/, '237') : null;
    const biller = typeof body.biller === 'string' ? body.biller : null;
    if (!['transfer', 'airtime', 'bill'].includes(type)) return err(422, 'INVALID_REQUEST');
    if (type === 'transfer' && (to === null || !this.accounts.has(to))) return err(404, 'UNKNOWN_BENEFICIARY');
    if (type === 'bill' && !['ENEO', 'CAMWATER', 'CANAL', 'CAMTEL'].includes(biller ?? '')) return err(404, 'UNKNOWN_BILLER');
    const operator = type === 'airtime' && to !== null ? operatorOf(to) : null;
    if (type === 'airtime' && operator === null) return err(404, 'UNKNOWN_BILLER');
    if (type === 'bill') to = null;
    if (!Number.isInteger(amount) || amount <= 0) return err(422, 'INVALID_AMOUNT');
    if (amount > MAX_AMOUNT) return err(422, 'LIMIT_EXCEEDED');
    const acc = this.accounts.get(from);
    if (!acc) return err(404, 'UNKNOWN_ACCOUNT');
    if (acc.balance < amount + feeFor(type, amount)) return err(422, 'INSUFFICIENT_FUNDS');
    this.#seq += 1;
    const fee = feeFor(type, amount);
    const tx: Tx & { to_name: string | null } = { to_name: to !== null ? (this.accounts.get(to)?.holder ?? null) : null, id: `TX${String(this.#seq).padStart(6, '0')}`, type, from, to, biller, operator, amount, fee, total: amount + fee, status: 'pending' };
    this.txs.set(tx.id, tx);
    return { status: 201, body: tx };
  }
}

function err(status: number, code: string): Reply {
  return { status, body: { error: code, message: code } };
}

/** Banque simulée en HTTP, avec une latence injectable pour reproduire un réseau réel. */
export function startFakeBankServer(bank: FakeBank, port: number, latencyMs = 0): Promise<Server> {
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8');
    });
    req.on('end', () => {
      let body: Record<string, unknown> = {};
      try {
        const parsed = bodySchema.safeParse(raw === '' ? {} : JSON.parse(raw));
        body = parsed.success ? parsed.data : {};
      } catch {
        body = {};
      }
      if (req.headers['x-team-key'] === undefined) {
        res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'UNAUTHORIZED' }));
        return;
      }
      const trace = req.headers['x-trace-id'];
      const reply = bank.handle(req.method ?? 'GET', req.url ?? '/', body, typeof trace === 'string' ? trace : null);
      const send = (): void => {
        res.writeHead(reply.status, { 'content-type': 'application/json' }).end(JSON.stringify(reply.body));
      };
      if (latencyMs > 0) setTimeout(send, latencyMs);
      else send();
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
