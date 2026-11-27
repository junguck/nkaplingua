// src/demo/server.ts
import http from "node:http";
import { fileURLToPath } from "node:url";

// ../../packages/safinum/src/protocol.ts
var SAFINUM_LANGUAGES = ["fr", "en", "fub", "dua", "ewo", "bas", "bbj", "byv"];
var SAFINUM_LANGUAGE_SET = new Set(SAFINUM_LANGUAGES);

// ../../packages/safinum/src/fees.ts
var MIN_AMOUNT = 1;
var MAX_AMOUNT = 5e5;
var PERCENT_FROM = 100001;
var PERCENT = 0.01;
var CASH_BRACKETS = [
  { min: 1, max: 5e3, fee: 50 },
  { min: 5001, max: 25e3, fee: 150 },
  { min: 25001, max: 1e5, fee: 400 },
  // `fee` = frais au premier franc de la tranche ; le calcul réel est un pourcentage.
  { min: PERCENT_FROM, max: MAX_AMOUNT, fee: Math.round(PERCENT_FROM * PERCENT) }
];
var FEE_BRACKETS = {
  transfer: CASH_BRACKETS,
  withdrawal: CASH_BRACKETS,
  airtime: [{ min: MIN_AMOUNT, max: MAX_AMOUNT, fee: 0 }],
  bill: [{ min: MIN_AMOUNT, max: MAX_AMOUNT, fee: 100 }]
};
function officialFee(type, amount) {
  if (!Number.isInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) return null;
  if ((type === "transfer" || type === "withdrawal") && amount >= PERCENT_FROM) return Math.round(amount * PERCENT);
  return FEE_BRACKETS[type].find((b) => amount >= b.min && amount <= b.max)?.fee ?? null;
}

// src/demo/demo-bank.ts
var OPERATORS = [
  { name: "MTN", test: (n) => n.startsWith("67") || /^65[0-4]/.test(n) },
  { name: "ORANGE", test: (n) => n.startsWith("69") || /^65[5-9]/.test(n) },
  { name: "CAMTEL", test: (n) => /^62[0-2]/.test(n) }
];
var DEMO_BILLERS = [
  { code: "ENEO", name: "Electricite", kind: "bill" },
  { code: "CAMWATER", name: "Eau", kind: "bill" },
  { code: "CANAL", name: "Television", kind: "bill" },
  { code: "CAMTEL", name: "Internet et telephone", kind: "bill" }
];
var SEED = [
  { phone: "237699000003", holder: "Fadimatou Bouba", balance: 25e4 },
  { phone: "237677000001", holder: "Paul Mbarga", balance: 12e3 },
  { phone: "237690000002", holder: "Aicha Njoya", balance: 8e4 },
  { phone: "237655000004", holder: "NkapLingua Demo", balance: 1e5 }
];
var DemoBank = class {
  accounts = /* @__PURE__ */ new Map();
  transactions = /* @__PURE__ */ new Map();
  counter = 0;
  constructor() {
    this.reset();
  }
  reset() {
    this.accounts = /* @__PURE__ */ new Map();
    this.transactions = /* @__PURE__ */ new Map();
    this.counter = 0;
    for (const seed of SEED) {
      this.accounts.set(keyOf(seed.phone), {
        phone: `237${keyOf(seed.phone)}`,
        holder: seed.holder,
        balance: seed.balance,
        currency: "XAF",
        operator: operatorOf(seed.phone) ?? "MTN"
      });
    }
  }
  async account(phone) {
    const account = this.accounts.get(keyOf(phone));
    if (!account) return ko(404, "UNKNOWN_ACCOUNT", "Aucun compte pour ce numero.");
    return ok({ phone: account.phone, holder: account.holder, balance: account.balance, currency: account.currency });
  }
  async fees(type, amount) {
    if (!Number.isInteger(amount) || amount <= 0) return ko(422, "INVALID_AMOUNT", "Montant invalide.");
    if (amount > MAX_AMOUNT) return ko(422, "LIMIT_EXCEEDED", `Plafond de ${MAX_AMOUNT} FCFA.`);
    const fee = officialFee(type, amount) ?? 0;
    return ok({ amount, fee, total: amount + fee, currency: "XAF" });
  }
  async history(phone, limit) {
    const national = keyOf(phone);
    const entries = [...this.transactions.values()].filter((tx) => keyOf(tx.from ?? "") === national || keyOf(tx.to ?? "") === national).sort((a, b) => b.id.localeCompare(a.id)).slice(0, Math.min(Math.max(limit, 1), 50)).map((tx) => {
      const incoming = keyOf(tx.to ?? "") === national;
      return {
        id: tx.id,
        at: (/* @__PURE__ */ new Date()).toISOString(),
        type: tx.type,
        direction: incoming ? "in" : "out",
        amount: tx.amount,
        label: incoming ? `De ${tx.from ?? ""}` : `A ${tx.to ?? ""}`
      };
    });
    return ok(entries);
  }
  async beneficiaries(query) {
    const needle = query.trim().toLowerCase();
    if (!needle) return ok([]);
    const matched = [...this.accounts.values()].filter((account) => {
      const digits2 = keyOf(needle);
      return account.holder.toLowerCase().includes(needle) || digits2.length >= 3 && account.phone.includes(digits2);
    }).map((account) => ({ name: account.holder, phone: account.phone }));
    return ok(matched);
  }
  async billers() {
    return ok([
      ...DEMO_BILLERS,
      { code: "MTN", name: "MTN", kind: "airtime" },
      { code: "ORANGE", name: "Orange", kind: "airtime" },
      { code: "CAMTEL", name: "Camtel", kind: "airtime" }
    ]);
  }
  async create(input) {
    const account = this.accounts.get(keyOf(input.from));
    if (!account) return ko(404, "UNKNOWN_ACCOUNT", "Aucun compte pour ce numero.");
    if (!Number.isInteger(input.amount) || input.amount <= 0) return ko(422, "INVALID_AMOUNT", "Montant invalide.");
    if (input.amount > MAX_AMOUNT) return ko(422, "LIMIT_EXCEEDED", `Plafond de ${MAX_AMOUNT} FCFA.`);
    if (input.type === "transfer" && !this.accounts.has(keyOf(input.to))) {
      return ko(404, "UNKNOWN_BENEFICIARY", "Beneficiaire inconnu.");
    }
    if (input.type === "bill" && !DEMO_BILLERS.some((b) => b.code === input.biller)) {
      return ko(404, "UNKNOWN_BILLER", "Facturier inconnu.");
    }
    const operator = operatorOf(input.to);
    if (input.type === "airtime" && !operator) {
      return ko(404, "UNKNOWN_BILLER", "Operateur non reconnu pour ce numero.");
    }
    const fee = officialFee(input.type, input.amount) ?? 0;
    if (account.balance < input.amount + fee) {
      return ko(422, "INSUFFICIENT_FUNDS", "Solde insuffisant.");
    }
    this.counter += 1;
    const id = `MBP${String(this.counter).padStart(8, "0")}`;
    const tx = {
      id,
      status: "pending",
      type: input.type,
      amount: input.amount,
      fee,
      total: input.amount + fee,
      from: keyOf(input.from),
      to: keyOf(input.to),
      operator: input.type === "airtime" ? operator ?? void 0 : void 0,
      biller: input.biller,
      reference: input.reference
    };
    this.transactions.set(id, tx);
    return ok(tx);
  }
  async update(id, patch) {
    const tx = this.transactions.get(id);
    if (!tx) return ko(404, "TX_NOT_FOUND", "Transaction inconnue.");
    if (tx.status !== "pending") return ko(409, "TX_NOT_PENDING", "Transaction deja executee.");
    const amount = patch.amount ?? tx.amount;
    if (!Number.isInteger(amount) || amount <= 0) return ko(422, "INVALID_AMOUNT", "Montant invalide.");
    if (amount > MAX_AMOUNT) return ko(422, "LIMIT_EXCEEDED", `Plafond de ${MAX_AMOUNT} FCFA.`);
    const fee = officialFee(tx.type, amount) ?? 0;
    const updated = {
      ...tx,
      amount,
      fee,
      total: amount + fee,
      to: patch.to ? keyOf(patch.to) : tx.to
    };
    this.transactions.set(id, updated);
    return ok(updated);
  }
  async confirm(id) {
    const tx = this.transactions.get(id);
    if (!tx) return ko(404, "TX_NOT_FOUND", "Transaction inconnue.");
    if (tx.status !== "pending") return ko(409, "TX_NOT_PENDING", "Transaction deja executee.");
    const account = this.accounts.get(keyOf(tx.from ?? ""));
    if (!account) return ko(404, "UNKNOWN_ACCOUNT", "Aucun compte pour ce numero.");
    if (account.balance < tx.total) return ko(422, "INSUFFICIENT_FUNDS", "Solde insuffisant.");
    account.balance -= tx.total;
    const recipient = this.accounts.get(keyOf(tx.to ?? ""));
    if (recipient && tx.type === "transfer") recipient.balance += tx.amount;
    const confirmed = { ...tx, status: "confirmed", balanceAfter: account.balance };
    this.transactions.set(id, confirmed);
    return ok(confirmed);
  }
  async cancel(id) {
    const tx = this.transactions.get(id);
    if (!tx) return ko(404, "TX_NOT_FOUND", "Transaction inconnue.");
    if (tx.status !== "pending") return ko(409, "TX_NOT_PENDING", "Transaction deja executee.");
    const cancelled = { ...tx, status: "cancelled" };
    this.transactions.set(id, cancelled);
    return ok(cancelled);
  }
};
function operatorOf(phone) {
  const national = digits(phone);
  return OPERATORS.find((operator) => operator.test(national))?.name ?? null;
}
function digits(value) {
  return String(value).replace(/\D+/g, "");
}
function keyOf(value) {
  return digits(value).slice(-9);
}
function ok(data) {
  return { ok: true, status: 200, data };
}
function ko(status, error, message) {
  return { ok: false, status, error, message };
}

// src/demo/server.ts
var DEMO_TEAM_KEY = "sbx_demo_local";
function createDemoServer(options = {}) {
  const bank = new DemoBank();
  const expectedKey = options.teamKey || process.env.SAFINUM_TEAM_KEY || DEMO_TEAM_KEY;
  const server = http.createServer((req, res) => {
    options.onCall?.({
      method: req.method ?? "GET",
      path: req.url ?? "/",
      traceId: headerValue(req.headers["x-trace-id"]),
      teamKey: headerValue(req.headers["x-team-key"])
    });
    void handle(req, res, bank, expectedKey);
  });
  return { server, bank };
}
function headerValue(value) {
  if (typeof value === "string") return value;
  return Array.isArray(value) ? value[0] ?? null : null;
}
async function handle(req, res, bank, expectedKey) {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname.replace(/^\/api\/v1/, "").replace(/\/+$/, "") || "/";
  if (method === "GET" && path === "/health") return send(res, 200, { ok: true, service: "demo-safinum-bank" });
  if (req.headers["x-team-key"] !== expectedKey) {
    return send(res, 401, { error: "UNAUTHORIZED", message: "Cle d equipe absente ou invalide." });
  }
  let body = {};
  if (method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return send(res, 400, { error: "INVALID_REQUEST", message: "JSON invalide." });
    }
  }
  const segments = path.split("/").filter((segment) => segment.length > 0);
  const traceId = req.headers["x-trace-id"];
  if (method === "GET" && segments[0] === "accounts" && segments[1]) {
    const phone = decodeURIComponent(segments[1]);
    if (segments[2] === "transactions") {
      return reply(res, await bank.history(phone, Number(url.searchParams.get("limit") ?? 5)), traceId);
    }
    return reply(res, await bank.account(phone), traceId);
  }
  if (method === "GET" && segments[0] === "fees") {
    const type = url.searchParams.get("type") ?? "transfer";
    const amount = Number(url.searchParams.get("amount"));
    return reply(res, await bank.fees(type, amount), traceId);
  }
  if (method === "GET" && segments[0] === "beneficiaries") {
    return reply(res, await bank.beneficiaries(url.searchParams.get("q") ?? ""), traceId);
  }
  if (method === "GET" && segments[0] === "billers") {
    const result = await bank.billers();
    if (!result.ok) return reply(res, result, traceId);
    return send(res, 200, { billers: DEMO_BILLERS, operators: result.data.filter((b) => b.kind === "airtime") });
  }
  if (method === "POST" && segments[0] === "transactions") {
    if (segments.length === 1) {
      const amount = Number(body.amount);
      const created = await bank.create({
        type: body.type ?? "transfer",
        from: String(body.from ?? ""),
        to: String(body.to ?? ""),
        amount,
        biller: body.biller ? String(body.biller) : void 0,
        reference: body.reference ? String(body.reference) : void 0
      });
      return reply(res, created, traceId, 201);
    }
    const id = decodeURIComponent(segments[1] ?? "");
    const action = segments[2];
    if (action === "update") {
      return reply(
        res,
        await bank.update(id, {
          amount: body.amount === void 0 ? void 0 : Number(body.amount),
          to: body.to ? digits(String(body.to)) : void 0
        }),
        traceId
      );
    }
    if (action === "confirm") return reply(res, await bank.confirm(id), traceId);
    if (action === "cancel") return reply(res, await bank.cancel(id), traceId);
  }
  if (method === "POST" && path === "/sandbox/reset") {
    bank.reset();
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: "NOT_FOUND", message: `Route ${method} ${path} inconnue.` });
}
function reply(res, result, traceId, status = 200) {
  const header = typeof traceId === "string" ? { "X-Trace-Id": traceId } : void 0;
  if (!result.ok) return send(res, result.status, { error: result.error, message: result.message }, header);
  send(res, status, result.data, header);
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}
async function startDemoServer(port = Number(process.env.DEMO_PORT ?? 8788)) {
  const { server } = createDemoServer();
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/api/v1`,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void startDemoServer().then(({ url }) => {
    console.log(`Banque de demonstration : ${url}`);
    console.log(`Cle acceptee : ${process.env.SAFINUM_TEAM_KEY || DEMO_TEAM_KEY}`);
  });
}
export {
  DEMO_TEAM_KEY,
  createDemoServer,
  startDemoServer
};
//# sourceMappingURL=server.js.map
