// src/server.ts
import fs6 from "node:fs";
import http from "node:http";
import path5 from "node:path";
import { fileURLToPath as fileURLToPath5 } from "node:url";

// ../../packages/nkap-safinum/src/fees.ts
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

// ../../packages/nkap-safinum/src/intents.ts
var MAP = {
  CHECK_BALANCE: "BALANCE_INQUIRY",
  TRANSFER: "TRANSFER",
  CHECK_FEES: "FEE_INQUIRY",
  TX_HISTORY: "TRANSACTION_HISTORY",
  BUY_AIRTIME: "AIRTIME_PURCHASE",
  PAY_BILL: "BILL_PAYMENT",
  // La sandbox n'a pas d'intention de retrait : on ne peut pas la déclarer sans mentir.
  WITHDRAW: "UNKNOWN",
  EXPLAIN_TERM: "TERM_EXPLANATION",
  CHANGE_LANGUAGE: "LANGUAGE_SWITCH",
  CONFIRM: "CONFIRM",
  CANCEL: "CANCEL",
  GREETING: "UNKNOWN",
  HELP: "TERM_EXPLANATION",
  UNKNOWN: "UNKNOWN"
};
function toSafinumIntent(intent) {
  return MAP[intent];
}

// ../../packages/nkap-safinum/src/protocol.ts
var SAFINUM_LANGUAGES = ["fr", "en", "fub", "dua", "ewo", "bas", "bbj", "byv"];
var SAFINUM_LANGUAGE_SET = new Set(SAFINUM_LANGUAGES);
function isSafinumLanguage(value) {
  return typeof value === "string" && SAFINUM_LANGUAGE_SET.has(value);
}
function normalizeChannel(value) {
  return value === "mobile" || value === "web" || value === "ivr" ? value : "ussd";
}
function isUiTranslation(turn) {
  return turn.type === "ui_translation" || turn.strings !== void 0 && turn.input === void 0;
}
function normalizePhone(raw) {
  const digits = String(raw).replace(/\D+/g, "");
  if (digits.length === 9 && digits.startsWith("6")) return digits;
  if (digits.length === 12 && digits.startsWith("2376")) return digits.slice(3);
  if (digits.length === 13 && digits.startsWith("002376")) return digits.slice(4);
  return null;
}

// ../../packages/nkap-safinum/src/status.ts
var CONTRACT = {
  none: "none",
  pending: "pending",
  // §8 : exécutée → `pending` + id de la transaction confirmée ; annulée / échouée → `none` + id.
  confirmed: "pending",
  cancelled: "none",
  failed: "none"
};
function toContractStatus(status, mode = "lifecycle") {
  return mode === "lifecycle" ? status : CONTRACT[status];
}
function statusModeFrom(value) {
  return value === "contract" ? "contract" : "lifecycle";
}

// src/bank.ts
var DEFAULT_TIMEOUT_MS = 2200;
var SafinumBank = class {
  root;
  teamKey;
  traceId;
  timeoutMs;
  fetchImpl;
  constructor(options) {
    this.root = options.baseUrl.replace(/\/+$/, "");
    this.teamKey = options.teamKey;
    this.traceId = options.traceId;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }
  account(phone) {
    return this.call("GET", `/accounts/${encodeURIComponent(phone)}`).then(
      (r) => r.ok ? { ok: true, status: r.status, data: readAccount(r.data, phone) } : r
    );
  }
  fees(type, amount) {
    return this.call("GET", `/fees?type=${encodeURIComponent(type)}&amount=${encodeURIComponent(amount)}`).then(
      (r) => r.ok ? { ok: true, status: r.status, data: readFees(r.data, type, amount) } : r
    );
  }
  history(phone, limit = 5) {
    return this.call("GET", `/accounts/${encodeURIComponent(phone)}/transactions?limit=${limit}`).then(
      (r) => r.ok ? { ok: true, status: r.status, data: readHistory(r.data) } : r
    );
  }
  beneficiaries(query) {
    return this.call("GET", `/beneficiaries?q=${encodeURIComponent(query)}`).then(
      (r) => r.ok ? { ok: true, status: r.status, data: readBeneficiaries(r.data) } : r
    );
  }
  billers() {
    return this.call("GET", "/billers").then(
      (r) => r.ok ? { ok: true, status: r.status, data: readBillers(r.data) } : r
    );
  }
  create(input) {
    return this.call("POST", "/transactions", input).then(
      (r) => r.ok ? { ok: true, status: r.status, data: readTransaction(r.data) } : r
    );
  }
  update(id, patch) {
    return this.call("POST", `/transactions/${encodeURIComponent(id)}/update`, patch).then(
      (r) => r.ok ? { ok: true, status: r.status, data: readTransaction(r.data) } : r
    );
  }
  confirm(id) {
    return this.call("POST", `/transactions/${encodeURIComponent(id)}/confirm`, {}).then(
      (r) => r.ok ? { ok: true, status: r.status, data: readTransaction(r.data) } : r
    );
  }
  cancel(id) {
    return this.call("POST", `/transactions/${encodeURIComponent(id)}/cancel`, {}).then(
      (r) => r.ok ? { ok: true, status: r.status, data: readTransaction(r.data) } : r
    );
  }
  async call(method, path6, body) {
    const headers = {
      Accept: "application/json",
      "X-Team-Key": this.teamKey
    };
    if (body !== void 0) headers["Content-Type"] = "application/json";
    if (this.traceId) headers["X-Trace-Id"] = this.traceId;
    try {
      const response = await this.fetchImpl(`${this.root}${path6}`, {
        method,
        headers,
        body: body === void 0 ? void 0 : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      const parsed = await response.json().catch(() => ({}));
      if (response.ok) return { ok: true, status: response.status, data: parsed };
      return failure(parsed, response.status);
    } catch (error) {
      const message2 = error instanceof Error ? error.message : String(error);
      return { ok: false, status: 0, error: "UNREACHABLE", message: message2 };
    }
  }
};
function failure(parsed, status) {
  const body = asRecord(parsed);
  const error = typeof body.error === "string" ? body.error : status === 401 ? "UNAUTHORIZED" : "BANK_ERROR";
  const message2 = typeof body.message === "string" ? body.message : void 0;
  const candidates = Array.isArray(body.candidates) ? body.candidates.map(readBeneficiary).filter(isPresent) : void 0;
  const out = { ok: false, status, error };
  return candidates ? { ...out, message: message2, candidates } : { ...out, message: message2 };
}
function asRecord(value) {
  return typeof value === "object" && value !== null ? value : {};
}
function pickNumber(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return void 0;
}
function pickString(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return void 0;
}
function isPresent(value) {
  return value !== null;
}
function readAccount(body, phone) {
  const record = asRecord(body);
  const nested = asRecord(record.account);
  const source = Object.keys(nested).length > 0 ? nested : record;
  return {
    phone: pickString(source, ["phone", "msisdn", "number"]) ?? phone,
    holder: pickString(source, ["holder", "holder_name", "name", "owner", "account_name"]) ?? "",
    balance: pickNumber(source, ["balance", "available_balance", "solde"]) ?? 0,
    currency: pickString(source, ["currency", "devise"]) ?? "XAF"
  };
}
function readFees(body, type, amount) {
  const record = asRecord(body);
  const fee = pickNumber(record, ["fee", "fees"]) ?? 0;
  return {
    amount: pickNumber(record, ["amount", "montant"]) ?? amount,
    fee,
    total: pickNumber(record, ["total"]) ?? amount + fee,
    currency: pickString(record, ["currency", "devise"]) ?? "XAF"
  };
}
function readTransaction(body) {
  const record = asRecord(body);
  const nested = asRecord(record.transaction);
  const source = Object.keys(nested).length > 0 ? nested : record;
  const amount = pickNumber(source, ["amount", "montant"]) ?? 0;
  const fee = pickNumber(source, ["fee", "fees"]) ?? 0;
  return {
    id: pickString(source, ["id", "transaction_id", "reference", "ref"]) ?? "",
    status: pickString(source, ["status", "state"]) ?? "pending",
    type: pickString(source, ["type", "kind"]) ?? "transfer",
    amount,
    fee,
    total: pickNumber(source, ["total"]) ?? amount + fee,
    from: pickString(source, ["from", "sender"]),
    to: pickString(source, ["to", "recipient", "beneficiary"]),
    operator: pickString(source, ["operator"]),
    biller: pickString(source, ["biller", "biller_code"]),
    reference: pickString(source, ["reference", "bill_reference"]),
    balanceAfter: pickNumber(source, ["balance_after", "balanceAfter", "new_balance"])
  };
}
function readBeneficiary(value) {
  const record = asRecord(value);
  const phone = pickString(record, ["phone", "msisdn", "number"]);
  if (!phone) return null;
  return { name: pickString(record, ["name", "holder", "label"]) ?? phone, phone };
}
function readBeneficiaries(body) {
  const record = asRecord(body);
  const list = Array.isArray(body) ? body : Array.isArray(record.beneficiaries) ? record.beneficiaries : [];
  return list.map(readBeneficiary).filter(isPresent);
}
function readBillers(body) {
  const record = asRecord(body);
  const list = Array.isArray(body) ? body : Array.isArray(record.billers) ? record.billers : [];
  const codes = list.map((entry) => {
    const item = asRecord(entry);
    const code = pickString(item, ["code", "id", "name"]);
    if (!code) return null;
    return { code, name: pickString(item, ["name", "label"]) ?? code, kind: "bill" };
  });
  const operators = Array.isArray(record.operators) ? record.operators : [];
  const operatorBillers = operators.map((entry) => {
    const item = asRecord(entry);
    const code = pickString(item, ["code", "id", "name"]);
    if (!code) return null;
    return { code, name: pickString(item, ["name", "label"]) ?? code, kind: "airtime" };
  });
  return [...codes, ...operatorBillers].filter(isPresent);
}
function readHistory(body) {
  const record = asRecord(body);
  const list = Array.isArray(body) ? body : Array.isArray(record.transactions) ? record.transactions : [];
  const entries = list.map((entry) => {
    const item = asRecord(entry);
    const id = pickString(item, ["id", "transaction_id", "reference"]);
    if (!id) return null;
    const rawDirection = pickString(item, ["direction"]) ?? pickString(item, ["type"]) ?? "out";
    return {
      id,
      at: pickString(item, ["at", "date", "created_at", "timestamp"]) ?? "",
      type: pickString(item, ["type", "kind"]) ?? "transfer",
      direction: rawDirection === "in" || rawDirection === "credit" ? "in" : "out",
      amount: pickNumber(item, ["amount", "montant"]) ?? 0,
      label: pickString(item, ["label", "counterparty", "name", "description"]) ?? ""
    };
  });
  return entries.filter(isPresent);
}

// ../../packages/nkap-core/src/lexicon/intents.lexicon.ts
var INTENT_CUES = {
  CHECK_BALANCE: {
    fr: [["solde", 3], ["combien il me reste", 3], ["combien j ai", 3], ["ce qui reste", 2], ["mon compte", 1]],
    en: [["balance", 3], ["how much do i have", 3], ["how much is left", 3]],
    wes: [["balans", 3], ["moni wey remain", 3], ["haw moch i get", 3], ["wetin remain", 3]],
    fub: [["keddii*", 3], ["heddii*", 3], ["ceede am", 1], ["ceede maa", 1]],
    // Duala : « combien d'argent (me reste-t-il) » — mbolo/moni (argent), musongi (compte), Helmlinger 1972.
    dua: [["mbolo", 1], ["moni", 1], ["musongi", 2]],
    bbj: [["nkap", 1], ["ngkap", 1]],
    ewo: [["m\u0254ni a lig", 3], ["lig a nk\u0254p", 2], ["nk\u0254p", 1]]
  },
  TRANSFER: {
    fr: [["envo*", 3], ["transf*", 3], ["virement", 3], ["fais passer", 3], ["donne", 1]],
    en: [["send", 3], ["transfer", 3], ["give", 1]],
    wes: [["sen", 3], ["sen moni", 3], ["giv", 1]],
    fub: [["neld*", 3], ["hokku", 1]],
    dua: [["loma*", 3]],
    bbj: [["shyaa*", 3]],
    ewo: [["lom", 3], ["lom moni", 3]],
    bul: [["lom*", 3], ["lom mone", 3]]
  },
  CHECK_FEES: {
    fr: [["frais", 3], ["commission", 3], ["tarif*", 2], ["combien ca coute", 3], ["ca coute", 2]],
    en: [["fee", 3], ["fees", 3], ["charge", 2], ["charges", 2], ["how much does it cost", 3]],
    wes: [["charges", 3], ["haw moch dem go chop", 3]],
    fub: [["njo\u0253di", 3]],
    ewo: [["moni ba n\u0254\u014B", 3]]
  },
  TX_HISTORY: {
    fr: [["historique", 3], ["dernieres operations", 3], ["mes operations", 3], ["mouvements", 2], ["releve", 2], ["transactions", 2]],
    en: [["history", 3], ["transactions", 2], ["statement", 2], ["last operations", 3]],
    wes: [["history", 3], ["tins wey i don do", 3], ["transaction dem", 3]],
    fub: [["golle \u0253ennu\u0257e", 3], ["golle am", 2]]
  },
  BUY_AIRTIME: {
    fr: [["credit de communication", 4], ["credit telephone", 4], ["recharge*", 3], ["unites", 3], ["airtime", 3], ["credit", 2]],
    en: [["airtime", 3], ["top up", 3], ["topup", 3], ["credit", 2]],
    wes: [["kredit", 3], ["credit for fon", 4], ["top up", 3]],
    fub: [["kerdii", 3]]
  },
  PAY_BILL: {
    fr: [["facture", 3], ["payer", 1], ["eneo", 3], ["camwater", 3], ["canal", 2], ["electricite", 2], ["courant", 1]],
    en: [["bill", 3], ["pay", 1], ["electricity", 2]],
    wes: [["bill", 3], ["pay", 1], ["light bill", 3], ["wata bill", 3]],
    fub: [["fakture", 3], ["yo\u0253*", 1]],
    bbj: [["joa", 2]],
    ewo: [["yan\u0259r", 1]],
    bul: [["ya'ane", 1]]
  },
  WITHDRAW: {
    fr: [["retir*", 3], ["retrait", 3], ["sortir de l argent", 3], ["cash out", 3]],
    en: [["withdraw*", 3], ["cash out", 3], ["cashout", 3]],
    wes: [["comot moni", 3], ["komot moni", 3], ["withdraw", 3]],
    fub: [["yalting*", 3], ["yaltin*", 3]],
    // « nɔŋ moni » figure aussi dans « mód á nɔŋ moni » (bénéficiaire) : poids 2 < envoi (3).
    ewo: [["n\u0254\u014B moni", 2]]
  },
  EXPLAIN_TERM: {
    fr: [["c est quoi", 3], ["qu est ce que", 3], ["que veut dire", 3], ["ca veut dire quoi", 3], ["explique", 3], ["signifie", 3]],
    en: [["what is", 3], ["what are", 3], ["what does", 3], ["explain", 3], ["meaning", 3]],
    wes: [["wetin be", 3], ["wetin mean", 3], ["explain", 3]],
    fub: [["ko woni", 3], ["ko \u0257um woni", 3], ["firo", 3]]
  },
  GREETING: {
    fr: [["bonjour", 2], ["bonsoir", 2], ["salut", 2]],
    en: [["hello", 2], ["hi", 2], ["good morning", 2]],
    wes: [["how na", 2], ["ashia", 2]],
    fub: [["jam", 1], ["a nyalli jam", 2], ["a waali jam", 2], ["a hirti jam", 2], ["sannu", 2]]
  },
  HELP: {
    fr: [["aide", 3], ["aidez moi", 3], ["menu", 2], ["que puis je faire", 3]],
    en: [["help", 3], ["menu", 2]],
    wes: [["hep", 3], ["help", 3]],
    fub: [["ballal", 3], ["wallu", 2]],
    dua: [["ongwane", 3]],
    ewo: [["voili", 3]]
  }
};
var CONFIRM_CUES = [
  ["oui", 3],
  ["ok", 3],
  ["d accord", 3],
  ["confirme", 3],
  ["je confirme", 3],
  ["vas y", 3],
  ["valide", 3],
  ["yes", 3],
  ["confirm", 3],
  ["go ahead", 3],
  ["ehen", 3],
  ["na so", 3],
  ["confam", 3],
  ["eey", 3],
  ["ee", 3],
  ["tabbitin", 3],
  ["owe", 3],
  // ewondo « Owé » (term.yes)
  ["bamse", 3]
  // duala « bâmse » (confirmer), Helmlinger 1972 ; « Ee » (oui) est déjà couvert par « ee »
];
var CANCEL_CUES = [
  ["non", 3],
  ["annule", 3],
  ["annuler", 3],
  ["stop", 3],
  ["laisse tomber", 3],
  ["no", 3],
  ["cancel", 3],
  ["cancel am", 3],
  ["lef am", 3],
  ["no be dat", 2],
  ["ala", 3],
  ["accu", 3],
  ["ha\u0257", 2],
  ["kem", 3],
  ["wunja", 3]
  // duala « kém » (non), « wunja » (annuler une décision), Helmlinger 1972
];
var CORRECTION_LEADS = ["non", "no", "ala", "pardon", "sorry", "sori", "yaafam"];
var CORRECTION_MARKERS = [
  "plutot",
  "en fait",
  "je voulais dire",
  "corrige",
  "finalement",
  "actually",
  "i mean",
  "instead",
  "a mean",
  "no be dat"
];

// ../../packages/nkap-core/src/lexicon/languages.lexicon.ts
var LANGUAGE_NAMES = {
  fr: ["fran\xE7ais", "francais", "french", "faransi"],
  en: ["anglais", "english", "inglisi"],
  fub: ["fulfulde", "foulfould\xE9", "foulfoulde", "peul", "fulani", "fula", "pulaar"],
  wes: ["pidgin", "pidjin", "kamtok", "pigin"],
  ewo: ["ewondo"],
  bul: ["bulu"],
  hau: ["haoussa", "hausa", "haussa", "houssa"],
  dua: ["duala", "douala", "dualla"],
  bas: ["basaa", "bassa", "basa"],
  bbj: ["ghomala", "ghom\xE1l\xE1", "bandjoun"],
  byv: ["medumba", "bangangte"]
};
var SWITCH_CUES = [
  "parle",
  "parlez",
  "en",
  "langue",
  "change",
  "passe",
  "speak",
  "in",
  "language",
  "switch",
  "tok",
  "for",
  "wolwu",
  "haalu",
  "\u0257emngal"
];
var FUNCTION_WORDS = {
  fr: [["je", 2], ["j", 1], ["mon", 2], ["ma", 1], ["mes", 2], ["le", 1], ["la", 1], ["les", 1], ["de", 1], ["du", 1], ["des", 1], ["a", 1], ["est", 1], ["quel", 2], ["quelle", 2], ["combien", 2], ["veux", 2], ["voudrais", 2], ["pour", 1], ["moi", 2], ["envoie", 2], ["s il", 2], ["plait", 2], ["c est", 2], ["quoi", 2], ["mille", 2], ["oui", 2], ["non", 2], ["merci", 2], ["bonjour", 2], ["pouvez", 2], ["aider", 1], ["ne sais pas", 2], ["comment", 1], ["il me reste", 3], ["reste", 1], ["compte", 2], ["operation", 2], ["enregistree", 2], ["application", 2], ["n existe pas", 2], ["me dire", 1]],
  en: [["i", 1], ["my", 2], ["the", 2], ["is", 1], ["what", 2], ["how", 1], ["much", 2], ["want", 2], ["to", 1], ["please", 2], ["send", 1], ["thousand", 2], ["yes", 1], ["thanks", 2], ["of", 1], ["for now", 2], ["do you", 2], ["how long", 2], ["takes", 1]],
  wes: [["wey", 3], ["dey", 3], ["na", 2], ["ya", 2], ["ma", 1], ["di", 2], ["don", 2], ["wetin", 3], ["haw", 3], ["moch", 3], ["wan", 2], ["sen", 2], ["giv", 2], ["give", 1], ["am", 1], ["abeg", 3], ["tok", 2], ["comot", 3], ["tausand", 3], ["balans", 3], ["moni", 3], ["ehen", 3], ["sabi", 3]],
  // Mots distinctifs relevés dans les enregistrements du glossaire ; liste courte, à enrichir avec des locuteurs.
  hau: [["ku\u0257i", 3], ["kudi", 3], ["aika", 3], ["asusu", 3], ["lambar", 3], ["adadin", 3], ["biya", 3], ["sake", 2], ["barka", 3], ["na gode", 3], ["ina", 1], ["ba", 1]],
  fub: [["mi", 1], ["maa", 3], ["am", 1], ["ka", 2], ["ngam", 3], ["ko", 2], ["\u0257um", 3], ["yi\u0257i", 3], ["ceede", 3], ["njelu", 3], ["\u0257oo", 3], ["hande", 3], ["eey", 3], ["ala", 2], ["ujineere", 3], ["jam", 2], ["useni", 3], ["jaraama", 3], ["no", 1], ["e", 1], ["waawi", 2], ["wallude", 2], ["lam", 1]],
  // Aucun mot-outil attesté dans ewo.json / bul.json : liste vide plutôt qu'inventée.
  // Ces langues sont reconnues par leurs indices d'intention ou choisies au menu de langue.
  ewo: [],
  bul: [],
  // Duala : pas de mot-outil fiable relevé (« na » est aussi pidgin) ; reconnu par ses indices d'intention.
  dua: [],
  // Basaa, medumba : aucune source primaire lisible depuis l'environnement (SIL sous connexion, Kemelang
  // refuse les robots) — rien d'inventé, à remplir avec des locuteurs (docs/LANGUES.md).
  bas: [],
  bbj: [],
  byv: []
};
var POSSESSIVES = ["mon", "ma", "mes", "my", "am"];

// ../../packages/nkap-contracts/src/intent.ts
var INTENTS = [
  "CHECK_BALANCE",
  "TRANSFER",
  "CHECK_FEES",
  "TX_HISTORY",
  "BUY_AIRTIME",
  "PAY_BILL",
  "WITHDRAW",
  "EXPLAIN_TERM",
  "CHANGE_LANGUAGE",
  "CONFIRM",
  "CANCEL",
  "GREETING",
  "HELP",
  "UNKNOWN"
];
var TERMS = [
  "balance",
  "fees",
  "total",
  "beneficiary",
  "irreversible",
  "pin",
  "otp",
  "limit",
  "airtime",
  "withdraw",
  "deposit",
  "history",
  "reference",
  "agent",
  "fraud",
  "interest",
  "loan"
];
var BILLERS = ["ENEO", "CAMWATER", "CANAL"];

// ../../packages/nkap-contracts/src/language.ts
var LANGUAGES = ["fr", "en", "fub", "wes", "ewo", "bul", "hau", "dua", "bas", "bbj", "byv"];
var LANGUAGE_INFO = {
  fr: { code: "fr", name: "Fran\xE7ais", nativeName: "Fran\xE7ais", isNational: false, ttsLocale: "fr-FR", sttLocale: "fr-FR" },
  en: { code: "en", name: "Anglais", nativeName: "English", isNational: false, ttsLocale: "en-GB", sttLocale: "en-GB" },
  fub: { code: "fub", name: "Fulfulde (Adamaoua)", nativeName: "Fulfulde", isNational: true, ttsLocale: "fr-FR", sttLocale: null },
  wes: { code: "wes", name: "Pidgin camerounais", nativeName: "Kamtok", isNational: true, ttsLocale: "en-GB", sttLocale: "en-NG" },
  ewo: { code: "ewo", name: "Ewondo", nativeName: "Ewondo", isNational: true, ttsLocale: "fr-FR", sttLocale: null },
  bul: { code: "bul", name: "Bulu", nativeName: "Bulu", isNational: true, ttsLocale: "fr-FR", sttLocale: null },
  hau: { code: "hau", name: "Haoussa", nativeName: "Hausa", isNational: true, ttsLocale: "fr-FR", sttLocale: null },
  // Noms natifs : ceux de la documentation de la sandbox SAFINUM.
  dua: { code: "dua", name: "Duala", nativeName: "Du\xE1l\xE1", isNational: true, ttsLocale: "fr-FR", sttLocale: null },
  bas: { code: "bas", name: "Basaa", nativeName: "\u0181asa\xE1", isNational: true, ttsLocale: "fr-FR", sttLocale: null },
  bbj: { code: "bbj", name: "Ghomala", nativeName: "Gh\u0254m\xE1l\xE1", isNational: true, ttsLocale: "fr-FR", sttLocale: null },
  byv: { code: "byv", name: "Medumba", nativeName: "M\u0259\u0300d\xFBmb\xE0", isNational: true, ttsLocale: "fr-FR", sttLocale: null }
};

// ../../packages/nkap-core/src/text/normalize.ts
var APOSTROPHES = /[’‘`´ʼ]/g;
var PUNCTUATION = /[.,;:!?¡¿"«»“”()[\]…•·|/\\–—_*#>+=]/g;
var NATIONAL_LETTERS = [
  [/ɓ/g, "b"],
  [/ɗ/g, "d"],
  [/ŋ/g, "ng"],
  [/ƴ/g, "y"],
  [/ñ/g, "ny"],
  [/ɛ/g, "e"],
  [/ɔ/g, "o"],
  [/ǝ|ə/g, "e"]
];
function normalize(input) {
  return input.normalize("NFC").toLowerCase().replace(APOSTROPHES, "'").replace(PUNCTUATION, " ").replace(/\s+/g, " ").trim();
}
function fold(input) {
  let out = normalize(input);
  for (const [pattern, replacement] of NATIONAL_LETTERS) out = out.replace(pattern, replacement);
  return out.normalize("NFD").replace(new RegExp("\\p{M}", "gu"), "").replace(/'/g, " ").replace(/\s+/g, " ").trim();
}
function tokenize(folded) {
  return folded.split(" ").filter((t) => t.length > 0);
}
function containsCue(foldedText, cue) {
  const foldedCue = fold(cue.replace(/\*$/, ""));
  if (foldedCue.length === 0) return false;
  const stem = cue.endsWith("*");
  const escaped = foldedCue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  const pattern = new RegExp(`(?:^|\\s)${escaped}${stem ? "\\S*" : ""}(?=\\s|$)`, "u");
  return pattern.test(foldedText);
}
function startsWithCue(foldedText, cue) {
  const foldedCue = fold(cue);
  return foldedText === foldedCue || foldedText.startsWith(`${foldedCue} `);
}

// ../../packages/nkap-core/src/lexicon/runtime.ts
var MIN_WEIGHT = 1;
var MAX_WEIGHT = 5;
var EMPTY = { languages: {} };
var LANGUAGE_SET = new Set(LANGUAGES);
var INTENT_SET = new Set(INTENTS);
function checkWordBase(input) {
  const problems = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) return ["base attendue : un objet { languages: { \u2026 } }"];
  const languages = input.languages;
  if (typeof languages !== "object" || languages === null || Array.isArray(languages)) return ["\xAB languages \xBB doit \xEAtre un objet { code: { \u2026 } }"];
  for (const [code, raw] of Object.entries(languages)) {
    if (!LANGUAGE_SET.has(code)) {
      problems.push(`langue inconnue : \xAB ${code} \xBB (connues : ${LANGUAGES.join(", ")})`);
      continue;
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      problems.push(`${code} : objet attendu`);
      continue;
    }
    const entry = raw;
    if (entry.replace !== void 0 && typeof entry.replace !== "boolean") problems.push(`${code}.replace : true ou false attendu`);
    if (entry.names !== void 0) {
      if (!Array.isArray(entry.names)) problems.push(`${code}.names : liste de cha\xEEnes attendue`);
      else for (const name of entry.names) if (typeof name !== "string" || name.trim() === "") problems.push(`${code}.names : nom vide`);
    }
    problems.push(...checkCues(code, "functionWords", entry.functionWords));
    if (entry.intents !== void 0) {
      if (typeof entry.intents !== "object" || entry.intents === null || Array.isArray(entry.intents)) {
        problems.push(`${code}.intents : objet { INTENTION: [[mot, poids], \u2026] } attendu`);
      } else {
        for (const [intent, cues] of Object.entries(entry.intents)) {
          if (!INTENT_SET.has(intent)) problems.push(`${code}.intents.${intent} : intention inconnue (connues : ${INTENTS.join(", ")})`);
          else problems.push(...checkCues(code, `intents.${intent}`, cues));
        }
      }
    }
    if (entry.replace === true) {
      const words2 = entry.functionWords?.length ?? 0;
      const intents = entry.intents === void 0 ? 0 : Object.values(entry.intents).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
      if (words2 + intents === 0) problems.push(`${code}.replace : la langue serait vid\xE9e de tout mot (lancez \xAB lang exporter ${code} \xBB)`);
    }
  }
  return problems;
}
function checkCues(code, field, raw) {
  if (raw === void 0) return [];
  if (!Array.isArray(raw)) return [`${code}.${field} : liste de [mot, poids] attendue`];
  const problems = [];
  for (const cue of raw) {
    if (!Array.isArray(cue) || cue.length !== 2) {
      problems.push(`${code}.${field} : \xAB ${JSON.stringify(cue)} \xBB n'est pas [mot, poids]`);
      continue;
    }
    const [text2, weight] = cue;
    if (typeof text2 !== "string" || text2.trim() === "") problems.push(`${code}.${field} : mot vide`);
    if (typeof weight !== "number" || !Number.isInteger(weight) || weight < MIN_WEIGHT || weight > MAX_WEIGHT) {
      problems.push(`${code}.${field} : \xAB ${String(text2)} \xBB a un poids ${String(weight)} hors de ${MIN_WEIGHT}\u2013${MAX_WEIGHT}`);
    }
  }
  return problems;
}
var compiled = compile(EMPTY);
function installWordBase(input) {
  const problems = checkWordBase(input);
  if (problems.length > 0) throw new Error(`base de mots refus\xE9e :
- ${problems.join("\n- ")}`);
  compiled = compile(input);
  return compiled.report;
}
function functionWordsOf(lang) {
  return compiled.functionWords.get(lang) ?? [];
}
function intentCuesOf(lang) {
  return compiled.intents.get(lang) ?? [];
}
function languageNamesOf(lang) {
  return compiled.names.get(lang) ?? [];
}
function intentCuesTable() {
  return compiled.table;
}
function compile(base) {
  const functionWords = /* @__PURE__ */ new Map();
  const names = /* @__PURE__ */ new Map();
  const intents = /* @__PURE__ */ new Map();
  const table = {};
  const touched = [];
  const replaced = [];
  let cueCount = 0;
  for (const lang of LANGUAGES) {
    const overlay = base.languages[lang];
    if (overlay !== void 0) touched.push(lang);
    if (overlay?.replace === true) replaced.push(lang);
    const ownWords = overlay?.functionWords ?? [];
    const ownIntents = overlay?.intents ?? {};
    if (overlay !== void 0) {
      cueCount += ownWords.length;
      for (const list of Object.values(ownIntents)) cueCount += list?.length ?? 0;
    }
    const words2 = overlay?.replace === true ? [...ownWords] : dedupe([...FUNCTION_WORDS[lang], ...ownWords]);
    functionWords.set(lang, words2);
    const overlayNames = overlay?.names ?? [];
    const mergedNames = overlay?.replace === true && overlayNames.length > 0 ? dedupeText(overlayNames) : dedupeText([...LANGUAGE_NAMES[lang], ...overlayNames]);
    names.set(lang, mergedNames);
    const all = [];
    for (const intent of INTENTS) {
      const integrated = INTENT_CUES[intent]?.[lang] ?? [];
      const extra = ownIntents[intent] ?? [];
      const list = overlay?.replace === true ? dedupe([...extra]) : dedupe([...integrated, ...extra]);
      if (list.length > 0) {
        const row = table[intent] ?? {};
        row[lang] = list;
        table[intent] = row;
      }
      all.push(...list);
    }
    intents.set(lang, all);
  }
  return { functionWords, names, intents, table, report: { languages: touched, cues: cueCount, replaced } };
}
function dedupe(cues) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const [text2, weight] of cues) {
    const key = fold(text2);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push([text2, weight]);
  }
  return out;
}
function dedupeText(values) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const value of values) {
    const key = fold(value);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

// ../../packages/nkap-core/src/lexicon/terms.lexicon.ts
var TERMS_LEXICON = {
  fees: {
    cues: ["frais", "commission", "fee", "fees", "charges", "njo\u0253di", "m\u0254ni ba n\u0254\u014B"],
    label: { fr: "Frais", en: "Fees", fub: "Njo\u0253di", wes: "Charges", ewo: "\xCD m\u0254\u0304n\xED b\xE1 n\u0254\u0301\u014B" },
    explanation: {
      fr: "Les frais, c'est l'argent que le service prend pour faire l'op\xE9ration. Ils s'ajoutent au montant : montant + frais = total.",
      en: "Fees are the money the service takes to carry out the operation. They are added to the amount: amount + fees = total.",
      fub: { text: "Njo\u0253di ko ceede \u0257e sarwis ittata ngam golle \u0257en. Ceede + njo\u0253di = fof.", status: "draft" },
      wes: { text: "Charges na di moni wey di sevis go chop for do di transaction. Moni + charges = total.", status: "draft" }
    }
  },
  balance: {
    cues: ["solde", "balance", "balans", "ceede keddii\u0257e", "m\u0254ni a lig a nk\u0254p"],
    label: { fr: "Solde", en: "Balance", fub: "Ceede keddii\u0257e", wes: "Balans", ewo: "\xCD m\u0254\u0304n\xED \xE1 l\xEDg \xE1 \u01F9k\u0254\u0301p" },
    explanation: {
      fr: "Le solde, c'est l'argent qui reste sur votre compte maintenant.",
      en: "The balance is the money left in your account right now.",
      fub: "Ceede keddii\u0257e (solde): ko ceede heddii e konte maa jooni.",
      wes: "Balans na di moni wey e remain for ya akaunt now."
    }
  },
  total: {
    cues: ["total", "montant total", "total a debiter", "fof", "ol togeda", "m\u0254ni a s\u0259"],
    label: { fr: "Total", en: "Total", fub: "Fof", wes: "Total", ewo: "M\u0254\u0304n\xED \xE1 s\u0259" },
    explanation: {
      fr: "Le total, c'est tout ce qui sort de votre compte : le montant envoy\xE9 plus les frais.",
      en: "The total is everything that leaves your account: the amount sent plus the fees.",
      fub: "Fuu (ceede + njo\u0253di): ko fof ko yaltata e konte maa.",
      wes: "Ol togeda (moni + charges): na everytin wey go komot for ya akaunt."
    }
  },
  beneficiary: {
    cues: ["beneficiaire", "destinataire", "beneficiary", "recipient", "mo he\u0253ata", "mod a n\u0254\u014B m\u0254ni", "mote a bi mone"],
    label: { fr: "B\xE9n\xE9ficiaire", en: "Beneficiary", fub: "Mo he\u0253ata ceede", wes: "Pesin wey go receive", ewo: "\xCD m\xF3d \xE1 n\u0254\u0301\u014B m\u0254\u0304n\xED", bul: "Mote a bi mon\xE9" },
    explanation: {
      fr: "Le b\xE9n\xE9ficiaire, c'est la personne qui re\xE7oit l'argent. V\xE9rifiez toujours son nom et son num\xE9ro.",
      en: "The beneficiary is the person who receives the money. Always check their name and number.",
      fub: { text: "Mo he\u0253ata ceede. Ndaar innde e limgal makko no feewi.", status: "draft" },
      wes: "Pesin wey go receive di moni. Check di nem an di nomba fine fine."
    }
  },
  irreversible: {
    cues: ["irreversible", "definitif", "waawaa artirteede"],
    label: { fr: "Irr\xE9versible", en: "Irreversible", fub: "Waawaa artirteede", wes: "You no fit change am again" },
    explanation: {
      fr: "Irr\xE9versible : apr\xE8s confirmation, on ne peut plus annuler. L'argent part pour toujours.",
      en: "Irreversible: once confirmed, it cannot be undone. The money is gone for good.",
      fub: "Si a tabbitinii, waawaa artirteede. Ceede \u0257en yahii.",
      wes: "When you confam, you no fit cancel am again. Di moni don go for good."
    }
  },
  pin: {
    cues: ["code pin", "pin", "code secret", "mot de passe", "sirri"],
    label: { fr: "Code secret (PIN)", en: "PIN", fub: "Lammba sirri", wes: "Secret code (PIN)" },
    explanation: {
      fr: "Le code secret prot\xE8ge votre argent. Ne le donnez JAMAIS \xE0 personne, m\xEAme pas \xE0 un agent.",
      en: "Your PIN protects your money. NEVER give it to anyone, not even an agent.",
      fub: "Taa hokku ne\u0257\u0257o sirri maa (PIN) abada! Hay ajan.",
      wes: "Neva give ya secret code (PIN) to anybody. At all at all!"
    }
  },
  otp: {
    cues: ["otp", "code de validation", "code recu par sms"],
    label: { fr: "Code re\xE7u par SMS", en: "One-time code", fub: "Sirri SMS", wes: "SMS code" },
    explanation: {
      fr: "Le code re\xE7u par SMS est secret : ne le donnez JAMAIS \xE0 personne.",
      en: "The code received by SMS is secret: NEVER share it.",
      fub: "Sirri SMS ngon ko sirri: taa hokku ne\u0257\u0257o abada!",
      wes: "Di code wey dem sen for SMS na secret. Neva give am to anybody!"
    }
  },
  limit: {
    cues: ["plafond", "limite", "limit", "keerol"],
    label: { fr: "Plafond", en: "Limit", fub: "Keerol", wes: "Limit" },
    explanation: {
      fr: "Le plafond, c'est le montant maximum que vous pouvez envoyer en une fois ou par jour.",
      en: "The limit is the maximum amount you can send at once or per day.",
      fub: { text: "Keerol ko ceede \u0253ur\u0257e \u0257e waawaa neldude e golle go\u2019o.", status: "draft" },
      wes: "Limit na di moni wey you no fit pass when you sen."
    }
  },
  airtime: {
    cues: ["credit de communication", "unites", "airtime", "kerdii"],
    label: { fr: "Cr\xE9dit de communication", en: "Airtime", fub: { text: "Kerdii", status: "attested" }, wes: "Kredit for fon" },
    explanation: {
      fr: "Le cr\xE9dit de communication, c'est l'argent pour appeler et envoyer des SMS.",
      en: "Airtime is the money used for calls and text messages.",
      fub: { text: "Kerdii: ceede ngam apeel e mesaas.", status: "draft" },
      wes: "Kredit for fon na di moni for call an sen SMS."
    }
  },
  withdraw: {
    cues: ["retrait", "withdrawal", "yaltingo ceede", "n\u0254\u014B m\u0254ni"],
    label: { fr: "Retrait", en: "Withdrawal", fub: "Yaltingo ceede", wes: "Comot moni", ewo: "\xC1 n\u0254\u0301\u014B m\u0254\u0304n\xED" },
    explanation: {
      fr: "Le retrait, c'est sortir votre argent en esp\xE8ces chez un agent ou au guichet automatique, avec un code.",
      en: "A withdrawal means taking your money out in cash at an agent or ATM, with a code.",
      fub: { text: "Yaltingo ceede: he\u0253ugo ceede e juu\u0257e e ajan walla e masi\u014B, e lammba.", status: "draft" },
      wes: "Comot moni na wen you take ya moni for cash for agent or ATM, wit code."
    }
  },
  deposit: {
    cues: ["depot", "deposit", "naatngo ceede", "fud m\u0254ni"],
    label: { fr: "D\xE9p\xF4t", en: "Deposit", fub: "Naatngo ceede e konte", wes: "Put moni for akaunt", ewo: "\xC1 f\xFAd m\u0254\u0304n\xED" },
    explanation: {
      fr: "Le d\xE9p\xF4t, c'est mettre de l'argent sur votre compte, chez un agent.",
      en: "A deposit means putting money into your account at an agent.",
      fub: "Naatngo ceede e konte maa, e ajan.",
      wes: "Put moni for ya akaunt for agent."
    }
  },
  history: {
    cues: ["historique", "history", "releve", "golle \u0253ennu\u0257e"],
    label: { fr: "Historique", en: "History", fub: "Golle \u0253ennu\u0257e", wes: "History" },
    explanation: {
      fr: "L'historique, c'est la liste de vos op\xE9rations pass\xE9es : envois, r\xE9ceptions, paiements.",
      en: "The history is the list of your past operations: sent, received, paid.",
      fub: "Golle \u0253ennu\u0257e: ko a wa\u0257i e konte maa.",
      wes: "Ol di tins wey you don do for ya akaunt."
    }
  },
  reference: {
    cues: ["reference", "numero de transaction", "limgal golle"],
    label: { fr: "R\xE9f\xE9rence", en: "Reference", fub: "Limgal golle", wes: "Transaction nomba" },
    explanation: {
      fr: "La r\xE9f\xE9rence est le num\xE9ro de l'op\xE9ration. Gardez-la : c'est votre preuve.",
      en: "The reference is the operation number. Keep it: it is your proof.",
      fub: "Limgal golle: resu \u0257um ngam seedeeje.",
      wes: "Nomba for di transaction. Keep am as proof."
    }
  },
  agent: {
    cues: ["agent", "point de service", "ajan"],
    label: { fr: "Agent", en: "Agent", fub: "Ajan", wes: "Agent" },
    explanation: {
      fr: "L'agent est un commer\xE7ant agr\xE9\xE9 o\xF9 l'on d\xE9pose et retire de l'argent. Il ne demande jamais votre code secret.",
      en: "An agent is an approved shop where you deposit and withdraw money. They never ask for your PIN.",
      fub: "Ajan goonga naamnataa sirri maa abada.",
      wes: "Agent na sevis point. Real agent neva ask ya secret code."
    }
  },
  fraud: {
    cues: ["arnaque", "fraude", "escroquerie", "scam", "fraud", "feyman", "jamfa", "gujjo"],
    label: { fr: "Arnaque", en: "Scam", fub: "Jamfa", wes: "Feyman bizness" },
    explanation: {
      fr: "Une arnaque, c\u2019est quelqu\u2019un qui veut votre argent ou votre code. Un vrai service ne demande JAMAIS votre code ni de payer pour recevoir un gain.",
      en: "A scam is someone after your money or your code. A real service NEVER asks for your PIN or for payment to receive a prize.",
      fub: "Sarwis goongaajo naamnataa sirri maa abada. \u018Aum jamfa!",
      wes: "Real sevis neva ask ya secret code, an neva ask you pay before you receive prize. Na feyman!"
    }
  },
  interest: {
    cues: ["interet", "interets", "interest", "\u0253eydaari"],
    label: { fr: "Int\xE9r\xEAts", en: "Interest", fub: "\u0181eydaari", wes: "Interest" },
    explanation: {
      fr: "Les int\xE9r\xEAts, c'est l'argent en plus qu'il faut rendre quand on emprunte.",
      en: "Interest is the extra money you pay back when you borrow.",
      fub: "\u0181eydaari (ko \u0253eydete) ngam \xF1amaande.",
      wes: "Interest na moni wey you go add when you pay back loan."
    }
  },
  loan: {
    cues: ["pret", "emprunt", "loan", "\xF1amaande", "kol m\u0254ni"],
    label: { fr: "Pr\xEAt", en: "Loan", fub: "\xD1amaande", wes: "Loan", ewo: "\xCD k\xF3l m\u0254\u0304n\xED" },
    explanation: {
      fr: "Un pr\xEAt, c'est de l'argent emprunt\xE9 qu'il faut rembourser, souvent avec des int\xE9r\xEAts.",
      en: "A loan is borrowed money you must pay back, often with interest.",
      fub: "\xD1amaande: ceede \u0253e artirta.",
      wes: "Loan na moni wey you go pay back."
    }
  }
};

// ../../packages/nkap-core/src/text/numbers.ts
var WORDS = Object.freeze({
  // français
  un: { value: 1, multiplier: false },
  une: { value: 1, multiplier: false },
  deux: { value: 2, multiplier: false },
  trois: { value: 3, multiplier: false },
  quatre: { value: 4, multiplier: false },
  cinq: { value: 5, multiplier: false },
  six: { value: 6, multiplier: false },
  sept: { value: 7, multiplier: false },
  huit: { value: 8, multiplier: false },
  neuf: { value: 9, multiplier: false },
  dix: { value: 10, multiplier: false },
  onze: { value: 11, multiplier: false },
  douze: { value: 12, multiplier: false },
  quinze: { value: 15, multiplier: false },
  vingt: { value: 20, multiplier: false },
  vingts: { value: 20, multiplier: false },
  trente: { value: 30, multiplier: false },
  quarante: { value: 40, multiplier: false },
  cinquante: { value: 50, multiplier: false },
  soixante: { value: 60, multiplier: false },
  cent: { value: 100, multiplier: true },
  cents: { value: 100, multiplier: true },
  mille: { value: 1e3, multiplier: true },
  million: { value: 1e6, multiplier: true },
  millions: { value: 1e6, multiplier: true },
  // anglais
  one: { value: 1, multiplier: false },
  two: { value: 2, multiplier: false },
  three: { value: 3, multiplier: false },
  four: { value: 4, multiplier: false },
  five: { value: 5, multiplier: false },
  seven: { value: 7, multiplier: false },
  eight: { value: 8, multiplier: false },
  nine: { value: 9, multiplier: false },
  ten: { value: 10, multiplier: false },
  twenty: { value: 20, multiplier: false },
  thirty: { value: 30, multiplier: false },
  forty: { value: 40, multiplier: false },
  fifty: { value: 50, multiplier: false },
  hundred: { value: 100, multiplier: true },
  thousand: { value: 1e3, multiplier: true },
  // pidgin (homographes ambigus exclus : « tu », « fo », « et »)
  wan: { value: 1, multiplier: false },
  tri: { value: 3, multiplier: false },
  faiv: { value: 5, multiplier: false },
  siks: { value: 6, multiplier: false },
  sevin: { value: 7, multiplier: false },
  nain: { value: 9, multiplier: false },
  twenti: { value: 20, multiplier: false },
  ondred: { value: 100, multiplier: true },
  tausand: { value: 1e3, multiplier: true },
  tosan: { value: 1e3, multiplier: true },
  // fulfulde (formes repliées : ɗiɗi → didi)
  goo: { value: 1, multiplier: false },
  didi: { value: 2, multiplier: false },
  tati: { value: 3, multiplier: false },
  nay: { value: 4, multiplier: false },
  nayi: { value: 4, multiplier: false },
  jowi: { value: 5, multiplier: false },
  joweego: { value: 6, multiplier: false },
  joweedidi: { value: 7, multiplier: false },
  joweetati: { value: 8, multiplier: false },
  joweenay: { value: 9, multiplier: false },
  sappo: { value: 10, multiplier: false },
  noogas: { value: 20, multiplier: false },
  temerre: { value: 100, multiplier: true },
  teemerre: { value: 100, multiplier: true },
  ujineere: { value: 1e3, multiplier: true },
  ujunere: { value: 1e3, multiplier: true }
});
var CONNECTORS = /* @__PURE__ */ new Set(["e", "et", "and"]);
var FUB_MULTIPLIERS = /* @__PURE__ */ new Set(["temerre", "teemerre", "ujineere", "ujunere"]);
var SUFFIX_THOUSAND = "(?:k|mille|thousand|tausand|tosan)";
var PHONE_RE = /(?:\+?\s?237[\s.-]?)?(?<![\d])6(?:[\s.-]?\d){8}(?![\d])/g;
var DIGIT_AMOUNT_RE = new RegExp(
  `(?<![\\d])(\\d{1,3}(?:[ .,]\\d{3})+|\\d+)(?:\\s?${SUFFIX_THOUSAND}(?![a-z]))?|(?:ujineere|ujunere)\\s(\\d+)`,
  "g"
);
var MIN_AMOUNT2 = 10;
function scanNumbers(folded) {
  const trimmed = folded.trim();
  if (/^[1-9]$/.test(trimmed)) return { phones: [], amounts: [], choice: Number(trimmed) };
  const phones = [];
  const glued = folded.replace(/(^|\s)go o(?=\s|$)/g, "$1goo");
  const withoutPhones = glued.replace(PHONE_RE, (match) => {
    phones.push(match.replace(/\D/g, "").slice(-9));
    return " ";
  });
  const found = [];
  const withoutDigits = withoutPhones.replace(DIGIT_AMOUNT_RE, (match, grouped, afterFub, at) => {
    const value = afterFub !== void 0 ? Number(afterFub) * 1e3 : parseDigitAmount(match, grouped ?? "");
    if (value >= MIN_AMOUNT2) found.push({ at, value });
    return " ".repeat(match.length);
  });
  for (const run of wordRuns(withoutDigits)) {
    const value = parseWordRun(run.words);
    if (value !== null && value >= MIN_AMOUNT2) found.push({ at: run.at, value });
  }
  found.sort((a, b) => a.at - b.at);
  return { phones, amounts: found.map((f) => f.value), choice: null };
}
function parseDigitAmount(match, grouped) {
  const base = Number(grouped.replace(/[ .,]/g, ""));
  const hasThousandSuffix = new RegExp(`${SUFFIX_THOUSAND}$`).test(match.trim());
  return hasThousandSuffix ? base * 1e3 : base;
}
function wordRuns(text2) {
  const runs = [];
  let current = null;
  let offset = 0;
  for (const token of tokenize(text2)) {
    const at = text2.indexOf(token, offset);
    offset = at + token.length;
    const isNumber = token in WORDS;
    const isConnector = CONNECTORS.has(token) && current !== null;
    if (isNumber || isConnector) {
      current ??= { at, words: [] };
      current.words.push(token);
    } else if (current) {
      runs.push(current);
      current = null;
    }
  }
  if (current) runs.push(current);
  return runs.map((r) => ({ at: r.at, words: trimConnectors(r.words) })).filter((r) => r.words.length > 0);
}
function trimConnectors(words2) {
  const out = [...words2];
  while (out.length > 0 && CONNECTORS.has(out[out.length - 1] ?? "")) out.pop();
  return out;
}
function parseWordRun(words2) {
  const first = words2[0];
  if (first === void 0) return null;
  return FUB_MULTIPLIERS.has(first) ? parseMultiplierFirst(words2) : parseMultiplierLast(words2);
}
function parseMultiplierLast(words2) {
  let total = 0;
  let current = 0;
  for (const word of words2) {
    const entry = WORDS[word];
    if (!entry) continue;
    if (!entry.multiplier) {
      current = current === 4 && entry.value === 20 ? 80 : current + entry.value;
    } else if (entry.value === 100) {
      current = (current || 1) * 100;
    } else {
      total += (current || 1) * entry.value;
      current = 0;
    }
  }
  const value = total + current;
  return value > 0 ? value : null;
}
function parseMultiplierFirst(words2) {
  let total = 0;
  let multiplier = 1;
  let count2 = 0;
  const flush = () => {
    total += multiplier * (count2 || 1);
    multiplier = 1;
    count2 = 0;
  };
  for (const word of words2) {
    if (CONNECTORS.has(word)) continue;
    const entry = WORDS[word];
    if (!entry) continue;
    if (entry.multiplier) {
      if (multiplier !== 1 || count2 !== 0) flush();
      multiplier = entry.value;
    } else {
      count2 += entry.value;
    }
  }
  flush();
  return total > 0 ? total : null;
}

// ../../packages/nkap-core/src/nlu/entities.ts
var RECIPIENT_CUES = /* @__PURE__ */ new Set(["a", "pour", "chez", "to", "for", "give", "ka", "na"]);
var NOT_A_NAME = /* @__PURE__ */ new Set([
  "moi",
  "lui",
  "elle",
  "eux",
  "mon",
  "mes",
  "my",
  "mi",
  "maa",
  "the",
  "les",
  "sur",
  "dans",
  "qui",
  "que",
  "quoi",
  "combien",
  "quel",
  "quelle",
  "personne",
  "someone",
  "somebody",
  "credit",
  "facture",
  "bill",
  "agent",
  "compte",
  "account",
  "fon",
  "phone",
  "telephone",
  "numero",
  "number",
  "nomba"
]);
var BILL_REFERENCE_RE = new RegExp(`(?:^|\\s)(${BILLERS.map((b) => b.toLowerCase()).join("|")})\\s+(?:numero\\s+|no\\s+|n\\s+)?(\\d{6,})(?=\\s|$)`);
function extractEntities(raw, knownNames) {
  const folded = fold(raw);
  const billMatch = BILL_REFERENCE_RE.exec(folded);
  const billReference = billMatch?.[2] ?? null;
  const forNumbers = billMatch ? folded.replace(billMatch[2] ?? "", " ") : folded;
  const numbers = scanNumbers(forNumbers);
  return {
    amounts: numbers.amounts,
    phones: numbers.phones,
    choice: numbers.choice,
    recipientQuery: findRecipient(folded, knownNames),
    term: findTerm(folded),
    biller: BILLERS.find((b) => containsCue(folded, b.toLowerCase())) ?? null,
    billReference,
    targetLanguage: LANGUAGES.find((l) => languageNamesOf(l).some((n) => containsCue(folded, n))) ?? null
  };
}
function findRecipient(folded, knownNames) {
  const tokens = tokenize(folded);
  const tokenSet = new Set(tokens);
  let best = null;
  for (const name of knownNames) {
    const nameTokens = tokenize(fold(name)).filter((t) => t.length >= 3);
    const matched = nameTokens.filter((t) => tokenSet.has(t));
    if (matched.length > 0) {
      const candidate = matched.join(" ");
      if (best === null || candidate.length > best.length) best = candidate;
    }
  }
  if (best !== null) return best;
  for (let i = 0; i < tokens.length - 1; i++) {
    const cue = tokens[i] ?? "";
    const next = tokens[i + 1] ?? "";
    const plausibleName = new RegExp("^\\p{L}{3,}$", "u").test(next) && !NOT_A_NAME.has(next) && !isLexiconWord(next);
    if (RECIPIENT_CUES.has(cue) && plausibleName && scanNumbers(next).amounts.length === 0) {
      return next;
    }
  }
  return null;
}
function isLexiconWord(token) {
  for (const lang of LANGUAGES) {
    for (const [cue] of intentCuesOf(lang)) {
      if (cue.includes(" ")) continue;
      const stem = cue.endsWith("*");
      const word = fold(stem ? cue.slice(0, -1) : cue);
      if (stem ? token.startsWith(word) : token === word) return true;
    }
  }
  return false;
}
function findTerm(folded) {
  let best = null;
  for (const term of TERMS) {
    for (const cue of TERMS_LEXICON[term].cues) {
      if (containsCue(folded, cue) && (best === null || cue.length > best.length)) best = { term, length: cue.length };
    }
  }
  return best?.term ?? null;
}

// ../../packages/nkap-core/src/nlu/intent-classifier.ts
function classifyIntent(folded, entities) {
  const scores = new Map(INTENTS.map((i) => [i, 0]));
  const cues = [];
  const counted = /* @__PURE__ */ new Set();
  const add = (intent, weight, cue) => {
    const key = `${intent}:${fold(cue)}`;
    if (counted.has(key)) return;
    counted.add(key);
    scores.set(intent, (scores.get(intent) ?? 0) + weight);
    cues.push(`${intent}:${cue}`);
  };
  for (const [intent, table] of Object.entries(intentCuesTable())) {
    for (const list of Object.values(table ?? {})) {
      for (const [cue, weight] of list ?? []) if (containsCue(folded, cue)) add(intent, weight, cue);
    }
  }
  for (const [cue, weight] of CONFIRM_CUES) if (startsWithCue(folded, cue)) add("CONFIRM", weight, cue);
  for (const [cue, weight] of CANCEL_CUES) if (startsWithCue(folded, cue)) add("CANCEL", weight, cue);
  if (entities.targetLanguage !== null) {
    const short = tokenize(folded).length <= 3;
    const explicit = SWITCH_CUES.some((c) => containsCue(folded, c));
    if (short || explicit) add("CHANGE_LANGUAGE", 6, entities.targetLanguage);
  }
  if ((scores.get("CHECK_FEES") ?? 0) > 0) add("CHECK_FEES", 1, "fees-focus");
  if ((scores.get("EXPLAIN_TERM") ?? 0) > 0) {
    const asksOwnValue = POSSESSIVES.some((p) => containsCue(folded, p)) || entities.amounts.length > 0;
    if (entities.term !== null && !asksOwnValue) add("EXPLAIN_TERM", 2, `term=${entities.term}`);
    else scores.set("EXPLAIN_TERM", 0);
  }
  const ranked = [...scores.entries()].filter(([, score]) => score > 0).map(([intent, score]) => ({ intent, score })).sort((a, b) => b.score - a.score);
  return { ranked, cues };
}

// ../../packages/nkap-core/src/nlu/language-detector.ts
var CUE_WEIGHT = 2;
function detectLanguage(folded, hint) {
  const scored = LANGUAGES.map((lang) => {
    let score = 0;
    const cues = [];
    for (const [word, weight] of functionWordsOf(lang)) {
      if (containsCue(folded, word)) {
        score += weight;
        cues.push(word);
      }
    }
    for (const [cue] of intentCuesOf(lang)) {
      if (containsCue(folded, cue)) {
        score += CUE_WEIGHT;
        cues.push(cue);
      }
    }
    return { lang, score, cues };
  });
  const total = scored.reduce((sum, s) => sum + s.score, 0);
  if (total === 0) return { lang: hint, confidence: 0, evidence: 0, margin: 0, cues: [] };
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const best = ranked[0]?.score ?? 0;
  const second = ranked[1]?.score ?? 0;
  const tied = scored.filter((s) => s.score === best);
  const winner = tied.find((s) => s.lang === hint) ?? tied[0];
  if (winner === void 0) return { lang: hint, confidence: 0, evidence: 0, margin: 0, cues: [] };
  return { lang: winner.lang, confidence: best / total, evidence: best, margin: best - second, cues: winner.cues };
}

// ../../packages/nkap-core/src/nlu/interpreter.ts
function interpret(raw, ctx) {
  const folded = fold(raw);
  const entities = extractEntities(raw, ctx.knownNames);
  const language = detectLanguage(folded, ctx.hintLang);
  const { ranked, cues } = classifyIntent(folded, entities);
  const hasCorrectionCue = CORRECTION_LEADS.some((c) => startsWithCue(folded, c)) || CORRECTION_MARKERS.some((c) => containsCue(folded, c));
  const slots = buildSlots(entities, hasCorrectionCue);
  const carriesValues = slots.amount !== void 0 || slots.recipientQuery !== void 0 || slots.phone !== void 0;
  let intent = ranked[0]?.intent ?? "UNKNOWN";
  const isCorrection = carriesValues && (hasCorrectionCue || intent === "CANCEL");
  if (isCorrection && (intent === "CANCEL" || intent === "CONFIRM")) intent = "UNKNOWN";
  return {
    lang: language.lang,
    langConfidence: round(language.confidence),
    intent,
    confidence: confidenceOf(ranked.map((r) => r.score)),
    alternatives: ranked.slice(0, 3),
    slots,
    isCorrection,
    cues,
    normalizedInput: normalize(raw)
  };
}
function buildSlots(e, correcting) {
  const amount = correcting ? e.amounts[e.amounts.length - 1] : e.amounts[0];
  const slots = {};
  if (amount !== void 0) slots.amount = { amount, currency: "XAF" };
  if (e.phones[0] !== void 0) slots.phone = e.phones[0];
  if (e.recipientQuery !== null) slots.recipientQuery = e.recipientQuery;
  if (e.term !== null) slots.term = e.term;
  if (e.biller !== null) slots.biller = e.biller;
  if (e.billReference !== null) slots.billReference = e.billReference;
  if (e.targetLanguage !== null) slots.targetLanguage = e.targetLanguage;
  if (e.choice !== null) slots.choice = e.choice;
  return slots;
}
function confidenceOf(scores) {
  const [top = 0, second = 0] = scores;
  if (top === 0) return 0;
  const margin = top / (top + second);
  const strength = Math.min(1, top / 3);
  return round(margin * strength);
}
function round(n) {
  return Math.round(n * 100) / 100;
}

// ../../packages/nkap-core/src/text/gsm7.ts
var GSM7_BASIC = `@\xA3$\xA5\xE8\xE9\xF9\xEC\xF2\xC7
\xD8\xF8\r\xC5\xE5\u0394_\u03A6\u0393\u039B\u03A9\u03A0\u03A8\u03A3\u0398\u039E\xC6\xE6\xDF\xC9 !"#\xA4%&'()*+,-./0123456789:;<=>?\xA1ABCDEFGHIJKLMNOPQRSTUVWXYZ\xC4\xD6\xD1\xDC\xA7\xBFabcdefghijklmnopqrstuvwxyz\xE4\xF6\xF1\xFC\xE0`;
var GSM7_EXTENDED = "^{}\\[~]|\u20AC\f";
var BASIC_SET = /* @__PURE__ */ new Set([...GSM7_BASIC]);
var EXTENDED_SET = /* @__PURE__ */ new Set([...GSM7_EXTENDED]);
var FOLD = {
  \u0253: "b",
  \u0181: "B",
  \u0257: "d",
  \u018A: "D",
  \u014B: "ng",
  \u014A: "NG",
  \u01B4: "y",
  \u01B3: "Y",
  \u025B: "e",
  \u0190: "E",
  \u0254: "o",
  \u0186: "O",
  \u0259: "e",
  \u018F: "E",
  \u0268: "i",
  \u0197: "I",
  \u0289: "u",
  "\u0245": "V",
  \u00DF: "ss",
  \u00E6: "ae",
  \u00C6: "AE",
  \u0153: "oe",
  \u0152: "OE",
  "\u2019": "'",
  "\u2018": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\xAB": '"',
  "\xBB": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2212": "-",
  "\u2026": "...",
  "\u2022": "-",
  "\xB7": ".",
  "\xA0": " ",
  "\u202F": " ",
  "	": " "
};
function isGsm7(text2) {
  return [...text2].every((char) => BASIC_SET.has(char) || EXTENDED_SET.has(char));
}
function gsm7Length(text2) {
  let total = 0;
  for (const char of text2) total += EXTENDED_SET.has(char) ? 2 : 1;
  return total;
}
function toGsm7(text2) {
  let out = "";
  for (const char of text2) {
    if (BASIC_SET.has(char) || EXTENDED_SET.has(char)) {
      out += char;
      continue;
    }
    const folded = FOLD[char];
    if (folded !== void 0) {
      out += folded;
      continue;
    }
    const stripped = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (stripped !== char && [...stripped].every((c) => BASIC_SET.has(c) || EXTENDED_SET.has(c))) {
      out += stripped;
      continue;
    }
    out += "?";
  }
  return out;
}
function truncateGsm7(text2, maxSeptets) {
  if (gsm7Length(text2) <= maxSeptets) return text2;
  let out = "";
  let used = 0;
  for (const char of text2) {
    const width = EXTENDED_SET.has(char) ? 2 : 1;
    if (used + width > maxSeptets - 3) break;
    out += char;
    used += width;
  }
  let cut = out.lastIndexOf(" ");
  while (cut > 0 && /\d/.test(out.charAt(cut - 1)) && /\d/.test(out.charAt(cut + 1))) {
    cut = out.lastIndexOf(" ", cut - 1);
  }
  const body = cut > 0 ? out.slice(0, cut) : out;
  return `${body}...`;
}

// src/free-text.ts
var EXPLAINED = /* @__PURE__ */ new Set(["fees", "limit", "beneficiary"]);
var ROUTABLE = /* @__PURE__ */ new Set([
  "CHECK_BALANCE",
  "TX_HISTORY",
  "HELP",
  "EXPLAIN_TERM",
  "CHANGE_LANGUAGE",
  "CHECK_FEES",
  "TRANSFER",
  "BUY_AIRTIME",
  "PAY_BILL"
]);
function understandFreeText(text2, language) {
  const interpretation = interpret(text2, { hintLang: language, knownNames: [] });
  if (!ROUTABLE.has(interpretation.intent)) return null;
  const { amount, recipientQuery, phone, biller, billReference, term, targetLanguage } = interpretation.slots;
  if (interpretation.intent === "EXPLAIN_TERM" && term !== void 0 && EXPLAINED.has(term)) {
    return { route: { kind: "term", term }, intent: "TERM_EXPLANATION", parameters: { term } };
  }
  const value = amount?.amount;
  const parameters = {};
  if (value !== void 0) Object.assign(parameters, { amount: value, currency: "XAF" });
  if (recipientQuery !== void 0) parameters.beneficiary = recipientQuery;
  if (phone !== void 0) parameters.beneficiary_phone = phone;
  if (biller !== void 0) parameters.biller = biller;
  if (billReference !== void 0) parameters.reference = billReference;
  const route = toRoute(interpretation.intent, { value, recipientQuery, phone, biller, billReference });
  if (route === null) return null;
  return {
    route,
    intent: toSafinumIntent(interpretation.intent),
    parameters,
    ...targetLanguage === void 0 ? {} : { targetLanguage }
  };
}
function toRoute(intent, slots) {
  const amount = slots.value === void 0 ? {} : { amount: slots.value };
  switch (intent) {
    case "CHECK_BALANCE":
      return { kind: "balance" };
    case "TX_HISTORY":
      return { kind: "history" };
    case "HELP":
    case "EXPLAIN_TERM":
      return { kind: "help" };
    case "CHANGE_LANGUAGE":
      return { kind: "language" };
    case "CHECK_FEES":
      return { kind: "fees", ...amount };
    case "TRANSFER":
      return {
        kind: "transfer",
        ...amount,
        ...slots.recipientQuery === void 0 ? {} : { recipient: slots.recipientQuery },
        ...slots.phone === void 0 ? {} : { phone: slots.phone }
      };
    case "BUY_AIRTIME":
      return { kind: "airtime", ...amount, ...slots.phone === void 0 ? {} : { phone: slots.phone } };
    case "PAY_BILL":
      return {
        kind: "bill",
        ...amount,
        ...slots.biller !== void 0 && BILLERS.includes(slots.biller) ? { biller: slots.biller } : {},
        ...slots.billReference === void 0 ? {} : { reference: slots.billReference }
      };
    default:
      return null;
  }
}
function isConfirmation(text2) {
  const folded = fold(text2);
  return CONFIRM_CUES.some(([cue]) => startsWithCue(folded, cue));
}
function isCancellation(text2) {
  const folded = fold(text2);
  return CANCEL_CUES.some(([cue]) => startsWithCue(folded, cue)) || startsWithCue(folded, "haaytu");
}
function amountIn(text2) {
  return scanNumbers(fold(text2)).amounts[0] ?? null;
}

// src/packs.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
var PACK_STATUSES = ["proposed", "validated", "draft"];
function defaultPackDir() {
  const packaged = fileURLToPath(new URL("./translations/", import.meta.url));
  if (fs.existsSync(packaged)) return packaged;
  return fileURLToPath(new URL("../translations/", import.meta.url));
}
var DEFAULT_PACK_DIR = process.env.NKAP_TRANSLATIONS_DIR ?? defaultPackDir();
function loadPacks(dir = DEFAULT_PACK_DIR) {
  const packs = /* @__PURE__ */ new Map();
  const rejected = [];
  if (!fs.existsSync(dir)) return { packs, rejected };
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort()) {
    const parsed = parsePack(path.join(dir, file));
    if (typeof parsed === "string") rejected.push({ file, reason: parsed });
    else if (path.basename(file, ".json") !== parsed.language) rejected.push({ file, reason: `le fichier doit s'appeler ${parsed.language}.json` });
    else packs.set(parsed.language, parsed);
  }
  return { packs, rejected };
}
function parsePack(file) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return `JSON illisible : ${error instanceof Error ? error.message : String(error)}`;
  }
  if (typeof raw !== "object" || raw === null) return "objet JSON attendu";
  const record = raw;
  const language = record.language;
  if (!isSafinumLanguage(language) || language === "fr") return `langue inconnue de la sandbox : ${String(language)}`;
  const status = record.status;
  if (!PACK_STATUSES.includes(status)) return `statut invalide : ${String(status)}`;
  const ui = stringMap(record.ui);
  const ussd = stringMap(record.ussd);
  if (ui === null || ussd === null) return "\xAB ui \xBB et \xAB ussd \xBB doivent \xEAtre des objets de cha\xEEnes";
  const sources = Array.isArray(record.sources) ? record.sources.filter((s) => typeof s === "string") : [];
  return { language, status, sources, ui, ussd };
}
function stringMap(value) {
  if (value === void 0) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const out = {};
  for (const [key, text2] of Object.entries(value)) {
    if (typeof text2 === "string" && text2.trim() !== "") out[key] = text2;
  }
  return out;
}
var PLACEHOLDER = /\{([a-z_]+)\}/gi;
function placeholderSet(text2) {
  return [...new Set([...text2.matchAll(PLACEHOLDER)].map((m) => (m[1] ?? "").toLowerCase()))].sort().join(",");
}
function auditPack(pack, references) {
  const problems = [];
  for (const [key, text2] of Object.entries(pack.ui)) {
    const ref = references.ui[key];
    if (ref === void 0) problems.push(`ui.${key} : cl\xE9 inconnue des \xE9crans de la sandbox`);
    else if (placeholderSet(ref) !== placeholderSet(text2)) problems.push(`ui.${key} : emplacements ${placeholderSet(text2) || "aucun"} \u2260 ${placeholderSet(ref) || "aucun"}`);
  }
  for (const [key, text2] of Object.entries(pack.ussd)) {
    const ref = references.ussd[key];
    if (ref === void 0) problems.push(`ussd.${key} : cl\xE9 inconnue`);
    else if (placeholderSet(ref) !== placeholderSet(text2)) problems.push(`ussd.${key} : emplacements ${placeholderSet(text2) || "aucun"} \u2260 ${placeholderSet(ref) || "aucun"}`);
    else if (gsm7Length(toGsm7(text2)) > 182) problems.push(`ussd.${key} : plus de 182 septets apr\xE8s translitt\xE9ration`);
  }
  const ussdTotal = Object.keys(references.ussd).length;
  const ussdTranslated = Object.keys(pack.ussd).filter((k) => k in references.ussd).length;
  return {
    language: pack.language,
    status: pack.status,
    ui: { translated: Object.keys(pack.ui).filter((k) => k in references.ui).length, total: Object.keys(references.ui).length },
    ussd: { translated: ussdTranslated, total: ussdTotal, complete: ussdTranslated === ussdTotal },
    problems
  };
}

// src/i18n.ts
var MENU_KEYS = [
  "menu.balance",
  "menu.transfer",
  "menu.fees",
  "menu.history",
  "menu.airtime",
  "menu.bill",
  "menu.help",
  "menu.language"
];
var FR = {
  "menu.header": "Safinum. Choisissez:",
  "menu.balance": "Mon solde",
  "menu.transfer": "Envoyer de l'argent",
  "menu.fees": "Frais",
  "menu.history": "Historique",
  "menu.airtime": "Acheter du credit",
  "menu.bill": "Payer une facture",
  "menu.help": "Aide",
  "menu.language": "Langue",
  "common.confirm": "Confirmer",
  "common.cancel": "Annuler",
  "common.edit": "Modifier",
  "ask.beneficiary": "Numero du beneficiaire (9 chiffres):",
  "ask.amount": "Montant (FCFA):",
  "ask.feesAmount": "Frais pour quel montant (FCFA) ?",
  "ask.airtimeTarget": "Credit pour:\n1. Mon numero\n2. Un autre numero",
  "ask.airtimePhone": "Numero a recharger (9 chiffres):",
  "ask.biller": "Choisissez le facturier:",
  "ask.billReference": "Numero de facture:",
  "ask.term": "Quel terme ?\n1. Frais\n2. Plafond\n3. Beneficiaire\n4. Confirmation",
  "ask.language": "Choisissez la langue:",
  "confirm.transfer": "Envoi de {amount} a {recipient}. Frais {fee}. Total {total}.",
  "confirm.airtime": "Credit de {amount} pour le {phone}. Frais {fee}. Total {total}.",
  "confirm.bill": "Facture {biller} {reference}: {amount}. Frais {fee}. Total {total}.",
  "confirm.choose": "1. Confirmer\n2. Annuler",
  "confirm.edit": "3. Modifier le montant",
  "confirm.retry": "Repondez 1 pour confirmer ou 2 pour annuler.",
  "done.transfer": "{amount} envoye a {recipient}. Ref {ref}. Solde {balance}.",
  "done.transfer_nobalance": "{amount} envoye a {recipient}. Ref {ref}.",
  "done.airtime": "Credit de {amount} envoye au {phone}. Ref {ref}.",
  "done.bill": "Facture {biller} payee: {amount}. Ref {ref}.",
  "done.cancel": "Operation annulee. Aucun montant debite.",
  balance: "Votre solde est de {balance}.",
  fees: "Pour {amount}: frais {fee}. Total {total}.",
  "history.header": "Vos dernieres operations:",
  "history.line": "{date} {label} {amount}",
  "history.empty": "Aucune operation pour le moment.",
  "invalid.choice": "Choix invalide.",
  "invalid.amount": "Montant invalide. Tapez un nombre, ex: 1000",
  "invalid.phone": "Numero invalide. 9 chiffres, ex: 699000002",
  "invalid.limit": "Montant trop eleve. Plafond: {max} FCFA.",
  "ambiguous.beneficiary": "Plusieurs beneficiaires. Precisez le numero.",
  "term.fee": "Les frais sont ce que la banque retient pour executer une operation.",
  "term.limit": "Le plafond est de 500 000 FCFA par operation.",
  "term.beneficiary": "Le beneficiaire est la personne qui recoit l'argent.",
  "term.confirmation": "Rien n'est debite avant votre confirmation, au tour suivant.",
  "lang.set": "Langue: {language}.",
  "error.INSUFFICIENT_FUNDS": "Solde insuffisant pour cette operation.",
  "error.LIMIT_EXCEEDED": "Montant au-dessus du plafond autorise.",
  "error.UNKNOWN_BENEFICIARY": "Beneficiaire introuvable. Verifiez le numero.",
  "error.UNKNOWN_BILLER": "Facturier inconnu. Choisissez dans la liste.",
  "error.UNKNOWN_ACCOUNT": "Compte introuvable pour ce numero.",
  "error.INVALID_AMOUNT": "Montant invalide.",
  "error.TX_NOT_PENDING": "Cette operation ne peut plus etre modifiee.",
  "error.UNAUTHORIZED": "Service momentanement indisponible. Reessayez plus tard.",
  "error.UNREACHABLE": "Service momentanement indisponible. Reessayez plus tard.",
  "error.GENERIC": "Operation impossible. Reessayez plus tard.",
  "ivr.menu": "Choisissez:\n1. Solde\n2. Envoyer\n3. Frais\n4. Historique\n0. Quitter",
  "ivr.invalid": "Choix invalide.",
  "ivr.askAmount": "Montant (FCFA) puis #:",
  "ivr.askBeneficiary": "Numero du beneficiaire puis #:",
  "ivr.confirmPrompt": "1. Confirmer\n2. Annuler",
  "ivr.hangup": "Merci. Au revoir.",
  "atm.welcome": "Bienvenue au distributeur Safinum, {name}.",
  "atm.card": "Numero de carte (9 chiffres):",
  "atm.pin": "Code a 4 chiffres:",
  "atm.menu": "Choisissez:\n1. Retrait\n2. Solde\n3. Quitter",
  "atm.multiple": "Montant multiple de {step} FCFA.",
  "atm.eject": "Merci. Prenez votre carte.",
  "atm.dispensed": "Retrait de {amount}. Frais {fee}.",
  "atm.simulated": "Simulation locale: aucun debit bancaire."
};
var EN = {
  "menu.header": "Safinum. Choose:",
  "menu.balance": "My balance",
  "menu.transfer": "Send money",
  "menu.fees": "Fees",
  "menu.history": "History",
  "menu.airtime": "Buy airtime",
  "menu.bill": "Pay a bill",
  "menu.help": "Help",
  "menu.language": "Language",
  "common.confirm": "Confirm",
  "common.cancel": "Cancel",
  "common.edit": "Change",
  "ask.beneficiary": "Beneficiary number (9 digits):",
  "ask.amount": "Amount (FCFA):",
  "ask.feesAmount": "Fees for which amount (FCFA)?",
  "ask.airtimeTarget": "Airtime for:\n1. My number\n2. Another number",
  "ask.airtimePhone": "Number to top up (9 digits):",
  "ask.biller": "Choose the service:",
  "ask.billReference": "Bill number:",
  "ask.term": "Which term?\n1. Fee\n2. Limit\n3. Beneficiary\n4. Confirmation",
  "ask.language": "Choose the language:",
  "confirm.transfer": "Sending {amount} to {recipient}. Fee {fee}. Total {total}.",
  "confirm.airtime": "Airtime of {amount} for {phone}. Fee {fee}. Total {total}.",
  "confirm.bill": "Bill {biller} {reference}: {amount}. Fee {fee}. Total {total}.",
  "confirm.choose": "1. Confirm\n2. Cancel",
  "confirm.edit": "3. Change the amount",
  "confirm.retry": "Reply 1 to confirm or 2 to cancel.",
  "done.transfer": "{amount} sent to {recipient}. Ref {ref}. Balance {balance}.",
  "done.transfer_nobalance": "{amount} sent to {recipient}. Ref {ref}.",
  "done.airtime": "Airtime of {amount} sent to {phone}. Ref {ref}.",
  "done.bill": "Bill {biller} paid: {amount}. Ref {ref}.",
  "done.cancel": "Transaction cancelled. Nothing was debited.",
  balance: "Your balance is {balance}.",
  fees: "For {amount}: fee {fee}. Total {total}.",
  "history.header": "Your recent transactions:",
  "history.line": "{date} {label} {amount}",
  "history.empty": "No transactions yet.",
  "invalid.choice": "Invalid choice.",
  "invalid.amount": "Invalid amount. Enter a number, e.g. 1000",
  "invalid.phone": "Invalid number. 9 digits, e.g. 699000002",
  "invalid.limit": "Amount too high. Limit: {max} FCFA.",
  "ambiguous.beneficiary": "Several beneficiaries. Give the number.",
  "term.fee": "The fee is what the bank keeps to carry out a transaction.",
  "term.limit": "The limit is 500 000 FCFA per transaction.",
  "term.beneficiary": "The beneficiary is the person who receives the money.",
  "term.confirmation": "Nothing is debited before you confirm, on the next turn.",
  "lang.set": "Language: {language}.",
  "error.INSUFFICIENT_FUNDS": "Insufficient balance for this transaction.",
  "error.LIMIT_EXCEEDED": "Amount above the authorised limit.",
  "error.UNKNOWN_BENEFICIARY": "Beneficiary not found. Check the number.",
  "error.UNKNOWN_BILLER": "Unknown service. Choose from the list.",
  "error.UNKNOWN_ACCOUNT": "No account for this number.",
  "error.INVALID_AMOUNT": "Invalid amount.",
  "error.TX_NOT_PENDING": "This transaction can no longer be changed.",
  "error.UNAUTHORIZED": "Service temporarily unavailable. Try again later.",
  "error.UNREACHABLE": "Service temporarily unavailable. Try again later.",
  "error.GENERIC": "The transaction did not go through. Try again.",
  "ivr.menu": "Choose:\n1. Balance\n2. Send\n3. Fees\n4. History\n0. Quit",
  "ivr.invalid": "Invalid choice.",
  "ivr.askAmount": "Amount (FCFA) then #:",
  "ivr.askBeneficiary": "Beneficiary number then #:",
  "ivr.confirmPrompt": "1. Confirm\n2. Cancel",
  "ivr.hangup": "Thank you. Goodbye.",
  "atm.welcome": "Welcome to the Safinum ATM, {name}.",
  "atm.card": "Card number (9 digits):",
  "atm.pin": "4-digit code:",
  "atm.menu": "Choose:\n1. Withdraw\n2. Balance\n3. Quit",
  "atm.multiple": "Amount must be a multiple of {step} FCFA.",
  "atm.eject": "Thank you. Take your card.",
  "atm.dispensed": "Withdrawal of {amount}. Fee {fee}.",
  "atm.simulated": "Local simulation: no bank debit."
};
var FUB = {
  "menu.header": "Safinum. Su\u0253o:",
  "menu.balance": "Ceede am keddii\u0257e",
  "menu.transfer": "Neldu ceede",
  "menu.fees": "Njo\u0253di",
  "menu.history": "Golle \u0253ennu\u0257e",
  "menu.airtime": "Soodu kerdii",
  "menu.bill": "Yo\u0253 fakture",
  "menu.help": "Wallu",
  "menu.language": "\u018Aemngal",
  "common.confirm": "Tabbitin",
  "common.cancel": "Haaytu",
  "common.edit": "Waylu",
  "ask.beneficiary": "Limgal ke\u0253oowo ceede (9 limle):",
  "ask.amount": "Ceede (FCFA):",
  "ask.feesAmount": "Njo\u0253di ngam ceede njelu (FCFA)?",
  "ask.airtimeTarget": "Kerdii ngam:\n1. Limgal am\n2. Limgal go\u0257ngal",
  "ask.airtimePhone": "Limgal nde renndintee (9 limle):",
  "ask.biller": "Su\u0253o fakture:",
  "ask.billReference": "Lammba fakture:",
  "ask.term": "Ko hon\u0257um?\n1. Njo\u0253di\n2. Ke\u0253al\n3. Ke\u0253oowo\n4. Tabbitgol",
  "ask.language": "Su\u0253o \u0257emngal:",
  "confirm.transfer": "Neldugol {amount} ka {recipient}. Njo\u0253di {fee}. Fof {total}.",
  "confirm.airtime": "Kerdii {amount} ngam {phone}. Njo\u0253di {fee}. Fof {total}.",
  "confirm.bill": "Fakture {biller} {reference}: {amount}. Njo\u0253di {fee}. Fof {total}.",
  "confirm.choose": "1. Tabbitin\n2. Haaytu",
  "confirm.edit": "3. Waylu ceede",
  "confirm.retry": "Tii 1 ngam tabbitinde walla 2 ngam haaytude.",
  "done.transfer": "{amount} neldaama ka {recipient}. Limgal {ref}. Ceede keddii\u0257e {balance}.",
  "done.transfer_nobalance": "{amount} neldaama ka {recipient}. Limgal {ref}.",
  "done.airtime": "Kerdii {amount} neldaama ka {phone}. Limgal {ref}.",
  "done.bill": "Fakture {biller} yo\u0253aama: {amount}. Limgal {ref}.",
  "done.cancel": "Golle ndee haaytaama. Ceede fof ittaaka.",
  balance: "Ceede maa keddii\u0257e: {balance}.",
  fees: "Ngam {amount}: njo\u0253di {fee}. Fof {total}.",
  "history.header": "Golle maa \u0253ennu\u0257e:",
  "history.line": "{date} {label} {amount}",
  "history.empty": "Golle alaa tawo.",
  "invalid.choice": "Su\u0253al mo\u01B4\u01B4al alaa.",
  "invalid.amount": "Ceede \u0257ee mo\u01B4\u01B4aani. Tii limoore, yeru: 1000",
  "invalid.phone": "Limgal ngal mo\u01B4\u01B4aani. 9 limle, yeru: 699000002",
  "invalid.limit": "Ceede \u0257ee \u0253uri ke\u0253al. Ke\u0253al: {max} FCFA.",
  "ambiguous.beneficiary": "Yim\u0253e \u0257uu\u0257\u0253e. Winndu limgal.",
  "term.fee": "Njo\u0253di ko ceede banki jogitotoo ngam wa\u0257de golle.",
  "term.limit": "Ke\u0253al ko 500 000 FCFA e kala golle.",
  "term.beneficiary": "Ke\u0253oowo ko ne\u0257\u0257o ja\u0253otoo ceede \u0257ee.",
  "term.confirmation": "Ceede ittaaka haa tabbitin-\u0257aa, e turnu garoowo.",
  "lang.set": "\u018Aemngal: {language}.",
  "error.INSUFFICIENT_FUNDS": "Ceede keddii\u0257e \u0257ee pa\u0257aani ngam golle ndee.",
  "error.LIMIT_EXCEEDED": "Ceede \u0257ee \u0253uri ke\u0253al ja\u0253aangal.",
  "error.UNKNOWN_BENEFICIARY": "Ke\u0253oowo tawaaka. \u01B3eewto limgal ngal.",
  "error.UNKNOWN_BILLER": "Fakture anndaaka. Su\u0253o e doggol ngol.",
  "error.UNKNOWN_ACCOUNT": "Konta alaa e limgal ngal.",
  "error.INVALID_AMOUNT": "Ceede \u0257ee mo\u01B4\u01B4aani.",
  "error.TX_NOT_PENDING": "Golle ndee waylaa tawo.",
  "error.UNAUTHORIZED": "Golle \u0257ee ke\u0253aani jooni. \u018Aa\u0253\u0253it caggal.",
  "error.UNREACHABLE": "Golle \u0257ee ke\u0253aani jooni. \u018Aa\u0253\u0253it caggal.",
  "error.GENERIC": "Golle ndee wa\u0257aaka. \u018Aa\u0253\u0253it caggal.",
  "ivr.menu": "Su\u0253o:\n1. Ceede am keddii\u0257e\n2. Neldu ceede\n3. Njo\u0253di\n4. Golle \u0253ennu\u0257e\n0. Yaltu",
  "ivr.invalid": "Su\u0253al mo\u01B4\u01B4al alaa.",
  "ivr.askAmount": "Ceede (FCFA) refti #:",
  "ivr.askBeneficiary": "Limgal ke\u0253oowo refti #:",
  "ivr.confirmPrompt": "1. Tabbitin\n2. Haaytu",
  "ivr.hangup": "A ja\u0253\u0253aama. Yaltu.",
  "atm.welcome": "Bienvenue au distributeur Safinum, {name}.",
  "atm.card": "Numero de carte (9 chiffres):",
  "atm.pin": "Code a 4 chiffres:",
  "atm.menu": "Choisissez:\n1. Retrait\n2. Solde\n3. Quitter",
  "atm.multiple": "Montant multiple de {step} FCFA.",
  "atm.eject": "Merci. Prenez votre carte.",
  "atm.dispensed": "Retrait de {amount}. Frais {fee}.",
  "atm.simulated": "Simulation locale: aucun debit bancaire."
};
var BUILT_IN = { fr: FR, en: EN, fub: FUB };
var PACK_LOAD = loadPacks();
var USSD_REFERENCE = FR;
function catalogueOf(language) {
  const builtIn = BUILT_IN[language];
  if (builtIn) return builtIn;
  const pack = PACK_LOAD.packs.get(language);
  if (!pack) return null;
  const keys = Object.keys(FR);
  return keys.every((key) => key in pack.ussd) ? pack.ussd : null;
}
function isServedLanguage(language) {
  return typeof language === "string" && catalogueOf(language) !== null;
}
function servedLanguages() {
  const packs = [...PACK_LOAD.packs.keys()].filter((l) => !(l in BUILT_IN) && isServedLanguage(l)).sort();
  return ["fr", "en", "fub", ...packs];
}
function resolveLanguage(requested) {
  return isServedLanguage(requested) ? requested : "fr";
}
function languageName(language) {
  return LANGUAGE_INFO[language].nativeName;
}
function message(language, key, vars = {}) {
  const template = (catalogueOf(language) ?? FR)[key];
  return template.replace(
    /\{([a-z_]+)\}/gi,
    (match, name) => Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}
function money(amount, currency = "FCFA") {
  const rounded = Math.round(Number(amount) || 0);
  return `${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ${currency}`;
}
function recipientLabel(name, phone) {
  const shown = displayPhone(phone ?? "");
  if (!name || name === phone || name.replace(/\D+/g, "") === (phone ?? "").replace(/\D+/g, "")) return shown;
  return `${name} (${shown})`;
}
function displayPhone(phone) {
  const national = phone.replace(/^(\+?237)/, "").replace(/\D+/g, "");
  return national.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
}
function shortDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

// src/language.ts
var MIN_MARGIN = 2;
function isServed(lang) {
  return isServedLanguage(lang);
}
function detectLanguage2(text2, fallback = "fr") {
  const guess = detectLanguage(fold(text2), fallback);
  if (guess.margin < MIN_MARGIN || !isServed(guess.lang)) return { language: fallback, confidence: 0, cues: [] };
  return { language: guess.lang, confidence: guess.evidence, cues: guess.cues.slice(0, 5) };
}
function resolveTurnLanguage(options, text2) {
  if (isServedLanguage(options.requested)) {
    return { language: options.requested, source: "turn", confidence: 3 };
  }
  if (options.source === "user" && options.current) {
    return { language: options.current, source: "user", confidence: 3 };
  }
  const guess = detectLanguage2(text2, options.current ?? "fr");
  return { language: guess.language, source: "detected", confidence: guess.confidence };
}

// src/ussd.ts
var MAX_CHARS = 182;
var FALLBACK_BILLERS = ["ENEO", "CAMWATER", "CANAL", "CAMTEL"];
async function handleUssd(turn, deps) {
  const key = turn.session_id || turn.phone || "sans-session";
  const text2 = readText(turn);
  const state = deps.sessions.get(key) ?? newState();
  const resolved = resolveTurnLanguage(
    { requested: turn.language, current: state.language, source: state.languageSource },
    text2
  );
  state.language = resolved.language;
  if (resolved.source !== "user") state.languageSource = resolved.source;
  const language = state.language;
  const result = await advance(state, text2, turn, deps, language);
  if (result.keep) deps.sessions.set(key, state);
  else deps.sessions.delete(key);
  const { transaction } = result.reply;
  return { ...result.reply, transaction: { ...transaction, status: toContractStatus(transaction.status, deps.statusMode) } };
}
function newState() {
  return { step: "menu", language: "fr", languageSource: "detected", draft: {}, updatedAt: Date.now() };
}
async function advance(state, text2, turn, deps, language) {
  const phone = normalizePhone(turn.phone ?? "");
  const upper = text2.toLowerCase();
  if (!phone) {
    return done(reply(language, message(language, "error.UNKNOWN_ACCOUNT"), "UNKNOWN", { end: true }));
  }
  if (text2 === "0" || ["annuler", "cancel", "haaytu", "stop"].includes(upper)) {
    return cancelPending(state, deps, language);
  }
  if (state.step === "menu") return menu(state, text2, phone, deps, language);
  switch (state.step) {
    case "transfer_to":
      return readBeneficiary2(state, text2, phone, deps, language);
    case "transfer_pick":
      return pickBeneficiary(state, text2, phone, deps, language);
    case "transfer_amount":
      return readAmount(state, text2, "transfer", phone, deps, language);
    case "airtime_target":
      if (text2 === "1") {
        state.draft.to = phone;
        return continueWithAmount(state, "airtime", phone, deps, language);
      }
      if (text2 === "2") {
        state.step = "airtime_phone";
        return keep(reply(language, message(language, "ask.airtimePhone"), "CLARIFICATION_NEEDED"));
      }
      return keep(reply(language, message(language, "ask.airtimeTarget"), "CLARIFICATION_NEEDED"));
    case "airtime_phone": {
      const target = normalizePhone(text2);
      if (!target) return keep(reply(language, message(language, "invalid.phone"), "CLARIFICATION_NEEDED"));
      state.draft.to = target;
      return continueWithAmount(state, "airtime", phone, deps, language);
    }
    case "airtime_amount":
      return readAmount(state, text2, "airtime", phone, deps, language);
    case "bill_biller":
      return pickBiller(state, text2, deps, language);
    case "bill_reference": {
      const reference = text2.replace(/\s+/g, "");
      if (!/^[A-Za-z0-9-]{3,20}$/.test(reference)) {
        return keep(reply(language, message(language, "invalid.choice"), "CLARIFICATION_NEEDED"));
      }
      state.draft.billReference = reference;
      return continueWithAmount(state, "bill", phone, deps, language);
    }
    case "bill_amount":
      return readAmount(state, text2, "bill", phone, deps, language);
    case "fees_amount":
      return showFees(state, text2, deps, language);
    case "confirm":
      return atConfirmation(state, text2, phone, deps, language);
    case "help": {
      const terms = {
        "1": "term.fee",
        "2": "term.limit",
        "3": "term.beneficiary",
        "4": "term.confirmation"
      };
      const term = terms[text2];
      if (!term) return done(reply(language, message(language, "ask.term"), "CLARIFICATION_NEEDED", { end: true }));
      return done(reply(language, message(language, term), "TERM_EXPLANATION", { end: true, term: text2 }));
    }
    case "language": {
      const index = Number.parseInt(text2, 10);
      const chosen = Number.isInteger(index) ? servedLanguages()[index - 1] : void 0;
      if (!chosen) {
        return keep(reply(language, languageMenuText(language), "CLARIFICATION_NEEDED", languageMenuOptions()));
      }
      state.language = chosen;
      state.languageSource = "user";
      state.step = "menu";
      return keep(
        reply(chosen, `${message(chosen, "lang.set", { language: chosen })}
${menuText(chosen)}`, "LANGUAGE_SWITCH", {
          end: false,
          language: chosen
        })
      );
    }
    default:
      state.step = "menu";
      return keep(reply(language, menuText(language), "UNKNOWN", menuOptions(language)));
  }
}
async function menu(state, text2, phone, deps, language) {
  const choice = resolveMenuChoice(text2);
  switch (choice) {
    case "balance":
      return balance(state, phone, deps, language);
    case "transfer":
      state.step = "transfer_to";
      return keep(reply(language, message(language, "ask.beneficiary"), "CLARIFICATION_NEEDED"));
    case "fees":
      state.step = "fees_amount";
      return keep(reply(language, message(language, "ask.feesAmount"), "CLARIFICATION_NEEDED"));
    case "history":
      return history(state, phone, deps, language);
    case "airtime":
      state.step = "airtime_target";
      return keep(reply(language, message(language, "ask.airtimeTarget"), "CLARIFICATION_NEEDED"));
    case "bill":
      return chooseBiller(state, deps, language);
    case "help":
      state.step = "help";
      return keep(reply(language, message(language, "ask.term"), "TERM_EXPLANATION"));
    case "language":
      state.step = "language";
      return keep(reply(language, languageMenuText(language), "LANGUAGE_SWITCH", languageMenuOptions()));
    default: {
      if (text2 === "") return keep(reply(language, menuText(language), "UNKNOWN", menuOptions(language)));
      const understood = understandFreeText(text2, language);
      if (understood) return withExtracted(await followFreeText(state, understood, phone, deps, language), understood);
      return keep(reply(language, `${message(language, "invalid.choice")}
${menuText(language)}`, "CLARIFICATION_NEEDED", menuOptions(language)));
    }
  }
}
async function followFreeText(state, understood, phone, deps, language) {
  const route = understood.route;
  switch (route.kind) {
    case "balance":
    case "history":
    case "help":
    case "language":
      return menu(state, String(MENU_KEYS.indexOf(`menu.${route.kind}`) + 1), phone, deps, language);
    case "term": {
      const key = route.term === "fees" ? "term.fee" : route.term === "limit" ? "term.limit" : "term.beneficiary";
      return done(reply(language, message(language, key), "TERM_EXPLANATION", { end: true, term: route.term }));
    }
    case "fees":
      if (route.amount !== void 0) return showFees(state, String(route.amount), deps, language);
      return menu(state, "3", phone, deps, language);
    case "transfer": {
      if (route.amount !== void 0) state.draft.amount = route.amount;
      const who = route.phone ?? route.recipient;
      if (who === void 0) return menu(state, "2", phone, deps, language);
      state.step = "transfer_to";
      return readBeneficiary2(state, who, phone, deps, language);
    }
    case "airtime":
      if (route.amount !== void 0) state.draft.amount = route.amount;
      if (route.phone !== void 0) {
        state.draft.to = route.phone;
        return continueWithAmount(state, "airtime", phone, deps, language);
      }
      return menu(state, "5", phone, deps, language);
    case "bill":
      if (route.amount !== void 0) state.draft.amount = route.amount;
      if (route.biller === void 0) return chooseBiller(state, deps, language);
      state.draft.biller = route.biller;
      if (route.reference === void 0) {
        state.step = "bill_reference";
        return keep(reply(language, message(language, "ask.billReference"), "CLARIFICATION_NEEDED"));
      }
      state.draft.billReference = route.reference;
      return continueWithAmount(state, "bill", phone, deps, language);
  }
}
async function continueWithAmount(state, type, phone, deps, language) {
  const amount = state.draft.amount;
  if (amount !== void 0) return readAmount(state, String(amount), type, phone, deps, language);
  state.step = type === "transfer" ? "transfer_amount" : type === "airtime" ? "airtime_amount" : "bill_amount";
  return keep(reply(language, message(language, "ask.amount"), "CLARIFICATION_NEEDED"));
}
function withExtracted(outcome, understood) {
  const { interpretation } = outcome.reply;
  if (interpretation.intent !== "CLARIFICATION_NEEDED") return outcome;
  return {
    ...outcome,
    reply: { ...outcome.reply, interpretation: { ...interpretation, parameters: { ...understood.parameters, ...interpretation.parameters } } }
  };
}
function resolveMenuChoice(text2) {
  const value = text2.trim().toLowerCase();
  if (value === "1" || value === "solde" || value === "balance" || value === "ceede") return "balance";
  if (["2", "envoyer", "send", "transfert", "transfer", "neldu"].includes(value)) return "transfer";
  if (["3", "frais", "fees", "njo\u0253di", "njobdi"].includes(value)) return "fees";
  if (["4", "historique", "history", "golle"].includes(value)) return "history";
  if (["5", "credit", "cr\xE9dit", "airtime", "kerdii"].includes(value)) return "airtime";
  if (["6", "facture", "bill", "fakture"].includes(value)) return "bill";
  if (["7", "aide", "help", "wallu"].includes(value)) return "help";
  if (["8", "langue", "language", "\u0257emngal", "demngal"].includes(value)) return "language";
  return null;
}
async function balance(state, phone, deps, language) {
  const result = await deps.bank.account(phone);
  if (!result.ok) return failure2(result, "BALANCE_INQUIRY", language);
  return done(
    reply(language, message(language, "balance", { balance: money(result.data.balance, "FCFA") }), "BALANCE_INQUIRY", {
      end: true,
      params: { balance: result.data.balance, currency: result.data.currency }
    })
  );
}
async function showFees(state, text2, deps, language) {
  const amount = parseAmount(text2);
  if (amount === null) return keep(reply(language, message(language, "invalid.amount"), "CLARIFICATION_NEEDED"));
  if (amount > MAX_AMOUNT) return keep(limitReply(language));
  const fees = await deps.bank.fees("transfer", amount);
  const quote = fees.ok ? fees.data : fallbackQuote("transfer", amount);
  return done(
    reply(
      language,
      message(language, "fees", {
        amount: money(quote.amount),
        fee: money(quote.fee),
        total: money(quote.total)
      }),
      "FEE_INQUIRY",
      { end: true, params: { amount, fee: quote.fee, total: quote.total } }
    )
  );
}
async function history(state, phone, deps, language) {
  const result = await deps.bank.history(phone, 4);
  if (!result.ok) return failure2(result, "TRANSACTION_HISTORY", language);
  if (result.data.length === 0) {
    return done(reply(language, message(language, "history.empty"), "TRANSACTION_HISTORY", { end: true }));
  }
  const lines = result.data.slice(0, 4).map(
    (entry) => message(language, "history.line", {
      date: shortDate(entry.at),
      label: entry.label || entry.type,
      amount: `${entry.direction === "in" ? "+" : "-"}${money(entry.amount)}`
    })
  );
  const text2 = [message(language, "history.header"), ...lines].join("\n");
  return done(reply(language, text2, "TRANSACTION_HISTORY", { end: true }));
}
async function readBeneficiary2(state, text2, phone, deps, language) {
  const direct = normalizePhone(text2);
  if (direct) {
    state.draft.to = direct;
    state.draft.name = direct;
    return continueWithAmount(state, "transfer", phone, deps, language);
  }
  const query = text2.trim();
  if (query.length === 0) return keep(reply(language, message(language, "ask.beneficiary"), "CLARIFICATION_NEEDED"));
  const found = await deps.bank.beneficiaries(query);
  if (!found.ok) {
    return keep(reply(language, message(language, "invalid.phone"), "CLARIFICATION_NEEDED"));
  }
  if (found.data.length === 1) {
    const only = found.data[0];
    if (!only) return keep(reply(language, message(language, "invalid.phone"), "CLARIFICATION_NEEDED"));
    state.draft.to = only.phone;
    state.draft.name = only.name;
    if (state.draft.amount !== void 0) return continueWithAmount(state, "transfer", phone, deps, language);
    state.step = "transfer_amount";
    return keep(reply(language, `${only.name}
${message(language, "ask.amount")}`, "CLARIFICATION_NEEDED"));
  }
  if (found.data.length === 0) {
    return keep(reply(language, message(language, "error.UNKNOWN_BENEFICIARY"), "CLARIFICATION_NEEDED"));
  }
  const candidates = found.data.slice(0, 5);
  state.draft.candidates = candidates;
  state.step = "transfer_pick";
  return keep(
    reply(language, message(language, "ambiguous.beneficiary"), "CLARIFICATION_NEEDED", {
      options: candidates.map((c) => `${c.name} ${displayPhone(c.phone)}`)
    })
  );
}
async function pickBeneficiary(state, text2, phone, deps, language) {
  const candidates = state.draft.candidates ?? [];
  const index = Number.parseInt(text2, 10);
  const chosen = Number.isInteger(index) ? candidates[index - 1] : void 0;
  if (!chosen) return keep(reply(language, message(language, "invalid.choice"), "CLARIFICATION_NEEDED"));
  state.draft.to = chosen.phone;
  state.draft.name = chosen.name;
  state.draft.candidates = void 0;
  return continueWithAmount(state, "transfer", phone, deps, language);
}
async function readAmount(state, text2, type, phone, deps, language) {
  const amount = parseAmount(text2);
  if (amount === null) return keep(reply(language, message(language, "invalid.amount"), "CLARIFICATION_NEEDED"));
  if (amount > MAX_AMOUNT) return keep(limitReply(language));
  const to = state.draft.to ?? phone;
  const fees = await deps.bank.fees(type, amount);
  const quote = fees.ok ? fees.data : fallbackQuote(type, amount);
  const input = {
    type,
    from: phone,
    to,
    amount,
    ...type === "bill" ? { biller: state.draft.biller ?? FALLBACK_BILLERS[0], reference: state.draft.billReference ?? "" } : {}
  };
  const result = state.pending ? await deps.bank.update(state.pending.id, { amount, to }) : await deps.bank.create(input);
  if (!result.ok) return failure2(result, transactionalIntent(type), language);
  const tx = result.data;
  state.pending = {
    id: tx.id,
    type,
    amount: tx.amount || amount,
    fee: tx.fee || quote.fee,
    total: tx.total || quote.total,
    to: tx.to ?? to,
    name: state.draft.name ?? tx.to ?? to,
    biller: tx.biller ?? state.draft.biller,
    reference: state.draft.billReference
  };
  state.step = "confirm";
  return keep(confirmation(state, language));
}
function confirmation(state, language) {
  const pending = state.pending;
  if (!pending) return reply(language, message(language, "invalid.choice"), "CLARIFICATION_NEEDED");
  const key = pending.type === "transfer" ? "confirm.transfer" : pending.type === "airtime" ? "confirm.airtime" : "confirm.bill";
  const body = message(language, key, {
    amount: money(pending.amount),
    fee: money(pending.fee),
    total: money(pending.total),
    recipient: recipientLabel(pending.name, pending.to),
    name: pending.name ?? "",
    phone: displayPhone(pending.to ?? ""),
    biller: pending.biller ?? "",
    reference: pending.reference ?? ""
  });
  return reply(language, body, transactionalIntent(pending.type), {
    options: confirmOptions(language),
    transaction: { id: pending.id, status: "pending" },
    params: compact({
      amount: pending.amount,
      fee: pending.fee,
      total: pending.total,
      beneficiary: pending.name,
      beneficiary_phone: pending.to,
      biller: pending.biller,
      transaction_id: pending.id
    })
  });
}
async function atConfirmation(state, text2, phone, deps, language) {
  const pending = state.pending;
  if (!pending) {
    state.step = "menu";
    return keep(reply(language, menuText(language), "UNKNOWN", menuOptions(language)));
  }
  const value = text2.trim().toLowerCase();
  if (value === "1" || isConfirmation(text2)) {
    const contact = pending.type === "transfer" ? deps.secondLook?.applies(phone, pending.total) : void 0;
    if (deps.secondLook && contact) {
      const request = await deps.secondLook.open(
        {
          transactionId: pending.id,
          userPhone: phone,
          userLanguage: language,
          amount: pending.amount,
          fee: pending.fee,
          total: pending.total,
          ...pending.name === void 0 ? {} : { recipientName: pending.name },
          ...pending.to === void 0 ? {} : { recipientPhone: pending.to }
        },
        contact,
        deps.bank
      );
      const shown = language === "en" ? "en" : "fr";
      const wait = shown === "en" ? `Waiting for ${contact.name} to approve. You will get an SMS.` : `En attente de ${contact.name}. Vous recevrez un SMS.`;
      return done(
        reply(shown, wait, "CONFIRM", {
          language: shown,
          end: true,
          transaction: { id: pending.id, status: "pending" },
          params: { second_look: request.id }
        })
      );
    }
    const result = await deps.bank.confirm(pending.id);
    if (!result.ok) return failure2(result, "CONFIRM", language, pending.id);
    const tx = result.data;
    const amount2 = tx.amount || pending.amount;
    const baseKey = pending.type === "transfer" ? "done.transfer" : pending.type === "airtime" ? "done.airtime" : "done.bill";
    const balanceAfter = tx.balanceAfter ?? await deps.bank.account(phone).then((r) => r.ok ? r.data.balance : void 0).catch(() => void 0);
    const key = baseKey === "done.transfer" && balanceAfter === void 0 ? "done.transfer_nobalance" : baseKey;
    const text3 = message(language, key, {
      amount: money(amount2),
      recipient: recipientLabel(pending.name, pending.to),
      name: pending.name ?? displayPhone(pending.to ?? ""),
      phone: displayPhone(pending.to ?? ""),
      ref: tx.id || pending.id,
      biller: pending.biller ?? "",
      balance: money(balanceAfter ?? 0)
    });
    return done(
      reply(language, text3, "CONFIRM", {
        end: true,
        transaction: { id: tx.id || pending.id, status: statusAfterConfirm(result.data.status) },
        params: { amount: amount2, transaction_id: tx.id || pending.id }
      })
    );
  }
  if (value === "2" || isCancellation(text2) && !/\d/.test(text2)) {
    return cancelPending(state, deps, language);
  }
  if (value === "3" || ["modifier", "corriger", "correction", "change", "waylu"].includes(value)) {
    const correction = await applyCorrection(state, text2, phone, deps, language);
    if (correction) return correction;
    return keep(reply(language, message(language, "ask.amount"), "CORRECTION"));
  }
  const amount = parseAmount(text2) ?? amountIn(text2);
  if (amount !== null) {
    const correction = await applyCorrection(state, text2, phone, deps, language);
    if (correction) return correction;
  }
  const understood = understandFreeText(text2, language);
  if (understood !== null && understood.route.kind === "language" && understood.targetLanguage !== void 0) {
    const next = resolveLanguage(understood.targetLanguage);
    state.language = next;
    state.languageSource = "user";
    const recap = confirmation(state, next);
    return keep({
      ...recap,
      interpretation: {
        ...recap.interpretation,
        intent: "LANGUAGE_SWITCH",
        parameters: { ...recap.interpretation.parameters, target_language: understood.targetLanguage, served_language: next }
      }
    });
  }
  return keep(
    reply(language, message(language, "confirm.retry"), "CLARIFICATION_NEEDED", {
      options: confirmOptions(language),
      transaction: { id: pending.id, status: "pending" }
    })
  );
}
async function applyCorrection(state, text2, phone, deps, language) {
  const pending = state.pending;
  if (!pending) return null;
  const amount = parseAmount(text2) ?? amountIn(text2);
  if (amount === null) return null;
  if (amount > MAX_AMOUNT) return keep(limitReply(language));
  const result = await deps.bank.update(pending.id, { amount });
  if (!result.ok) return failure2(result, "CORRECTION", language, pending.id);
  const tx = result.data;
  const newAmount = tx.amount || amount;
  const fees = await deps.bank.fees(pending.type, newAmount);
  const quote = fees.ok ? fees.data : fallbackQuote(pending.type, newAmount);
  const fee = tx.fee && tx.amount === newAmount ? tx.fee : quote.fee;
  state.pending = {
    ...pending,
    amount: newAmount,
    fee,
    total: tx.total && tx.amount === newAmount ? tx.total : newAmount + fee
  };
  state.step = "confirm";
  const recap = confirmation(state, language);
  return keep({ ...recap, interpretation: { ...recap.interpretation, intent: "CORRECTION" } });
}
async function cancelPending(state, deps, language) {
  const pending = state.pending;
  if (!pending) {
    return done(reply(language, message(language, "done.cancel"), "CANCEL", { end: true }));
  }
  const result = await deps.bank.cancel(pending.id);
  if (!result.ok) return failure2(result, "CANCEL", language, pending.id);
  return done(
    reply(language, message(language, "done.cancel"), "CANCEL", {
      end: true,
      transaction: { id: result.data.id || pending.id, status: "cancelled" }
    })
  );
}
async function chooseBiller(state, deps, language) {
  const result = await deps.bank.billers();
  const billers = result.ok && result.data.length > 0 ? result.data.filter((b) => b.kind === "bill") : [];
  const codes = billers.length > 0 ? billers.map((b) => b.code) : [...FALLBACK_BILLERS];
  state.step = "bill_biller";
  state.draft.candidates = void 0;
  return keep(
    reply(language, `${message(language, "ask.biller")}
${numbered(codes)}`, "CLARIFICATION_NEEDED", {
      options: codes
    })
  );
}
async function pickBiller(state, text2, deps, language) {
  const result = await deps.bank.billers();
  const billers = result.ok ? result.data.filter((b) => b.kind === "bill") : [];
  const codes = billers.length > 0 ? billers.map((b) => b.code) : [...FALLBACK_BILLERS];
  const index = Number.parseInt(text2, 10);
  const byNumber = Number.isInteger(index) ? codes[index - 1] : void 0;
  const byName = codes.find((code) => code.toLowerCase() === text2.trim().toLowerCase());
  const chosen = byNumber ?? byName;
  if (!chosen) return keep(reply(language, message(language, "invalid.choice"), "CLARIFICATION_NEEDED"));
  state.draft.biller = chosen;
  state.step = "bill_reference";
  return keep(reply(language, message(language, "ask.billReference"), "CLARIFICATION_NEEDED"));
}
function reply(language, text2, intent, options = {}) {
  const optionLabels = options.options ?? [];
  const body = options.listedInText ? truncateGsm7(toGsm7(text2), MAX_CHARS) : finalizeText(text2, optionLabels, MAX_CHARS);
  const params = { ...options.params ?? {} };
  if (options.term) params.term = options.term;
  return {
    response: {
      text: body,
      end_session: options.end ?? false,
      options: optionLabels.map((label) => toGsm7(label))
    },
    interpretation: { intent, parameters: params, language: options.language ?? language },
    transaction: options.transaction ?? { id: null, status: "none" }
  };
}
function finalizeText(text2, options, maxChars) {
  const optionsBlock = options.length > 0 ? options.map((label, index) => `${index + 1}. ${toGsm7(label)}`).join("\n") : "";
  const budget = optionsBlock ? maxChars - gsm7Length(optionsBlock) - 1 : maxChars;
  const body = truncateGsm7(toGsm7(text2), Math.max(24, budget));
  return optionsBlock ? `${body}
${optionsBlock}` : body;
}
function languageMenuText(language) {
  return `${message(language, "ask.language")}
${numbered(servedLanguages().map(languageName))}`;
}
function languageMenuOptions() {
  return { options: servedLanguages().map(languageName), listedInText: true };
}
function menuOptions(language) {
  return { options: MENU_KEYS.map((key) => message(language, key)), listedInText: true };
}
function menuText(language) {
  const items = MENU_KEYS.map((key, index) => `${index + 1}. ${message(language, key)}`);
  return `${message(language, "menu.header")}
${items.join("\n")}`;
}
function confirmOptions(language) {
  return [message(language, "common.confirm"), message(language, "common.cancel"), message(language, "common.edit")];
}
function numbered(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}
function compact(values) {
  const out = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== void 0) out[key] = value;
  }
  return out;
}
function transactionalIntent(type) {
  return type === "transfer" ? "TRANSFER" : type === "airtime" ? "AIRTIME_PURCHASE" : "BILL_PAYMENT";
}
function keep(replyValue) {
  return { reply: replyValue, keep: true };
}
function done(replyValue) {
  return { reply: replyValue, keep: false };
}
function statusAfterConfirm(status) {
  if (status === "pending") return "pending";
  return "confirmed";
}
function limitReply(language) {
  return reply(language, message(language, "invalid.limit", { max: money(MAX_AMOUNT) }), "CLARIFICATION_NEEDED");
}
function failure2(result, intent, language, transactionId) {
  const known2 = /* @__PURE__ */ new Set([
    "INSUFFICIENT_FUNDS",
    "LIMIT_EXCEEDED",
    "UNKNOWN_BENEFICIARY",
    "UNKNOWN_BILLER",
    "UNKNOWN_ACCOUNT",
    "INVALID_AMOUNT",
    "TX_NOT_PENDING",
    "UNAUTHORIZED",
    "UNREACHABLE"
  ]);
  const key = known2.has(result.error) ? `error.${result.error}` : "error.GENERIC";
  return done(
    reply(language, message(language, key), intent, {
      end: true,
      transaction: transactionId ? { id: transactionId, status: "failed" } : { id: null, status: "none" },
      params: { error: result.error }
    })
  );
}
function fallbackQuote(type, amount) {
  const fee = officialFee(type, amount) ?? 0;
  return { amount, fee, total: amount + fee };
}
function readText(turn) {
  const raw = String(turn.input?.text ?? "").trim();
  if (raw.length > 0) return raw.replace(/\u00a0|\u202f/g, " ");
  const ussd = String(turn.input?.ussd_text ?? "").trim();
  if (!ussd) return "";
  const segments = ussd.split("*").filter((segment) => /[0-9A-Za-z]/.test(segment));
  return segments[segments.length - 1]?.trim() ?? "";
}
function parseAmount(text2) {
  const cleaned = text2.replace(/fcfa|xaf/gi, "").trim();
  if (!/^\d[\d\s.,]*$/.test(cleaned)) return null;
  const digits = cleaned.replace(/[\s.,]/g, "");
  if (digits.length === 0 || digits.length > 9) return null;
  const amount = Number.parseInt(digits, 10);
  return Number.isInteger(amount) && amount > 0 ? amount : null;
}

// src/ui-dictionaries.ts
var EN2 = {
  "nav.home": "Home",
  "nav.transfer": "Send",
  "nav.pay": "Pay",
  "nav.history": "History",
  "shell.greeting": "Hello {name}",
  "shell.logout": "Log out",
  "shell.secure": "Secure connection",
  "common.back": "Back",
  "common.continue": "Continue",
  "common.cancel": "Cancel",
  "common.loading": "Loading",
  "common.listen": "Listen",
  "common.stop_listening": "Stop reading",
  "home.balance_label": "Available balance",
  "home.account": "Account {phone}",
  "home.quick_actions": "What would you like to do?",
  "home.action_transfer": "Send money",
  "home.action_bill": "Pay a bill",
  "home.action_airtime": "Buy airtime",
  "home.action_history": "My transactions",
  "home.recent": "Recent transactions",
  "home.see_all": "See all",
  "home.empty": "No transactions yet.",
  "tx.transfer_out": "Sent to {name}",
  "tx.transfer_in": "Received from {name}",
  "tx.airtime": "{operator} airtime",
  "tx.bill": "{biller} bill",
  "tx.withdrawal": "Withdrawal",
  "tx.status.confirmed": "Completed",
  "tx.status.pending": "Pending",
  "tx.status.failed": "Failed",
  "tx.status.cancelled": "Cancelled",
  "transfer.title": "Send money",
  "transfer.to_label": "Beneficiary",
  "transfer.to_hint": "Phone number or name",
  "transfer.amount_label": "Amount",
  "transfer.amount_hint": "Up to {max} per transaction",
  "transfer.fee_preview": "Fee: {fee}",
  "transfer.saved": "My beneficiaries",
  "pay.title": "Pay",
  "pay.tab_airtime": "Airtime",
  "pay.tab_bill": "Bills",
  "pay.biller_label": "Choose the service",
  "pay.operator_label": "Operator",
  "pay.operator_detected": "Operator detected: {operator}",
  "pay.phone_label": "Number to top up",
  "pay.phone_hint": "Yours or someone else's",
  "pay.amount_label": "Amount",
  "review.title": "Check before you confirm",
  "review.to": "Recipient",
  // « Service » est identique au français : la sandbox le compte `untranslated`. On nomme
  // ce que l'écran affiche (l'opérateur ou le service payé) pour que l'anglais soit réel.
  "review.service": "Service used",
  "review.amount": "Amount",
  "review.fee": "Fee",
  "review.total": "Total debited",
  "review.balance_after": "Balance afterwards",
  "review.warning": "The money leaves as soon as you confirm.",
  "review.confirm": "Confirm",
  "review.edit": "Edit",
  "receipt.success": "Transaction successful",
  "receipt.done": "Done",
  "receipt.reference": "Reference",
  "receipt.new_balance": "New balance",
  "receipt.transfer": "{amount} sent to {name}.",
  "receipt.airtime": "{operator} airtime of {amount} sent to {phone}.",
  "receipt.bill": "{biller} bill of {amount} paid.",
  "receipt.cancelled": "Transaction cancelled. Nothing was debited.",
  "history.title": "History",
  "history.empty": "No transactions yet.",
  // Idem : « Date » ne se distingue pas du français. L'en-tête annonce date ET heure.
  "history.col_date": "Date & time",
  "history.col_label": "Transaction",
  "history.col_amount": "Amount",
  "history.col_status": "Status",
  "history.filter_all": "All",
  "history.filter_in": "Incoming",
  "history.filter_out": "Outgoing",
  "help.fee": "The fee is the amount the bank keeps to carry out the transaction.",
  "help.limit": "The limit is the most you can send in one go.",
  "help.beneficiary": "The beneficiary is the person who receives the money.",
  "biller.ENEO": "Electricity",
  "biller.CAMWATER": "Water",
  "biller.CANAL": "Television",
  "biller.CAMTEL": "Internet and phone",
  "error.INSUFFICIENT_FUNDS": "Insufficient balance: you are {missing} short.",
  "error.LIMIT_EXCEEDED": "Amount too high: the limit is {max} per transaction.",
  "error.UNKNOWN_BENEFICIARY": "Beneficiary not found. Check the number or name.",
  "error.UNKNOWN_BILLER": "Unknown service. Choose from the list.",
  "error.AMBIGUOUS_BENEFICIARY": "Several beneficiaries have this name. Pick the right one.",
  "error.INVALID_AMOUNT": "Invalid amount. Enter a whole number.",
  "error.GENERIC": "The transaction did not go through. Try again.",
  // Écrans ATM (47 clés envoyées par la sandbox, relevées le 27/11 dans docs/preuves/ecrans-2026-11-27.json).
  // Le canal ATM est une traduction d'écran comme mobile/web : mêmes règles d'emplacements.
  "atm.amount_rule": "Notes: 5,000 and 10,000 FCFA",
  "atm.amount_title": "Choose the amount",
  "atm.another": "Another transaction?",
  "atm.available": "Service available 24/7",
  "atm.balance_title": "Available balance",
  "atm.bank": "Safinum Bank",
  "atm.cancel_hint": "Red key: cancel",
  "atm.confirm_amount": "Amount: {amount}",
  "atm.confirm_fee": "Fee: {fee}",
  "atm.confirm_title": "Confirm the withdrawal",
  "atm.confirm_total": "Total debited: {total}",
  "atm.count_cash": "Count it at the counter",
  "atm.error_funds": "Insufficient balance",
  "atm.error_generic": "Transaction failed",
  "atm.error_max": "Limit of {max} per withdrawal",
  "atm.error_step": "Amount must be a multiple of {step}",
  "atm.goodbye": "Thank you, goodbye",
  "atm.insert_card": "Insert your card",
  "atm.key_back": "Back",
  "atm.key_balance": "Balance",
  "atm.key_cancel": "Cancel",
  "atm.key_confirm": "Confirm",
  "atm.key_done": "Finish",
  "atm.key_exit": "Eject card",
  "atm.key_no": "No",
  "atm.key_other": "Other amount",
  "atm.key_receipt_no": "No thanks",
  "atm.key_receipt_yes": "Yes, a receipt",
  "atm.key_statement": "Mini statement",
  "atm.key_withdraw": "Withdraw",
  "atm.key_yes": "Yes",
  "atm.menu_title": "Choose a transaction",
  "atm.other_rule": "Multiple of {step}, up to {max}",
  "atm.other_title": "Enter the amount",
  "atm.pin_confirm": "Then press the green key",
  "atm.pin_hide": "Cover the keypad with your hand",
  "atm.pin_title": "Enter your PIN",
  "atm.please_wait": "Please wait",
  "atm.receipt_question": "Would you like a receipt?",
  "atm.receipt_ref": "Reference {ref}",
  "atm.receipt_thanks": "Thank you for your visit",
  "atm.receipt_title": "Withdrawal receipt",
  "atm.statement_empty": "No recent transactions",
  "atm.statement_title": "Recent transactions",
  "atm.take_card": "Take your card",
  "atm.take_cash": "Take your notes",
  "atm.welcome": "Welcome"
};
var FUB2 = {
  "nav.home": "Fu\u0257\u0257orde",
  "nav.transfer": "Neldu",
  "nav.pay": "Yo\u0253",
  "nav.history": "Golle",
  "shell.greeting": "A ja\u0253\u0253aama {name}",
  // Glossaire fub.json : term.logout « Yaltu » (proposé). « Connexion sécurisée » n'a pas d'équivalent
  // relu : la clé `shell.secure` reste absente → repli français clé par clé.
  "shell.logout": "Yaltu",
  "common.back": "Rutto",
  "common.continue": "Jokku",
  "common.cancel": "Haaytu",
  "common.loading": "Ina loowa",
  "common.listen": "Nan",
  "common.stop_listening": "Dartin nanugol",
  "home.balance_label": "Ceede keddii\u0257e",
  "home.account": "Konta {phone}",
  "home.quick_actions": "Ko nji\u0257-\u0257aa wa\u0257ude?",
  "home.action_transfer": "Neldu ceede",
  "home.action_bill": "Yo\u0253 fakture",
  "home.action_airtime": "Soodu kerdii",
  "home.action_history": "Golle am",
  "home.recent": "Golle \u0253ennu\u0257e",
  "home.see_all": "Ndaar fof",
  "home.empty": "Golle alaa tawo.",
  "tx.transfer_out": "Neldaama ka {name}",
  "tx.transfer_in": "Ja\u0253aama ko {name}",
  "tx.airtime": "Kerdii {operator}",
  "tx.bill": "Fakture {biller}",
  "tx.withdrawal": "Yaltinirgol",
  "tx.status.confirmed": "Wa\u0257aama",
  "tx.status.pending": "Ina fadii",
  "tx.status.failed": "Wa\u0257aaka",
  "tx.status.cancelled": "Haaytaama",
  "transfer.title": "Neldu ceede",
  "transfer.to_label": "Ke\u0253oowo",
  "transfer.to_hint": "Limgal walla innde",
  "transfer.amount_label": "Ceede",
  "transfer.amount_hint": "Haa {max} e kala golle",
  "transfer.fee_preview": "Njo\u0253di: {fee}",
  "transfer.saved": "Yim\u0253e am",
  "pay.title": "Yo\u0253",
  "pay.tab_airtime": "Kerdii",
  "pay.tab_bill": "Fakture",
  "pay.biller_label": "Su\u0253o fakture",
  "pay.operator_label": "Operatoor",
  "pay.operator_detected": "Operatoor anndaama: {operator}",
  "pay.phone_label": "Limgal nde renndintee",
  "pay.phone_hint": "Am walla go\u0257\u0257o",
  "pay.amount_label": "Ceede",
  "review.title": "\u01B3eewto ado tabbitinde",
  "review.to": "Ke\u0253oowo",
  "review.service": "Golle",
  "review.amount": "Ceede",
  "review.fee": "Njo\u0253di",
  "review.total": "Fof itteteengol",
  "review.balance_after": "Ceede keddii\u0257e caggal",
  "review.warning": "Ceede \u0257ee ittay so tabbitin-\u0257aa.",
  "review.confirm": "Tabbitin",
  "review.edit": "Waylu",
  "receipt.success": "Golle ndee wa\u0257aama",
  "receipt.done": "Gollii",
  "receipt.reference": "Limgal",
  "receipt.new_balance": "Ceede keddii\u0257e kesee",
  "receipt.transfer": "{amount} neldaama ka {name}.",
  "receipt.airtime": "Kerdii {operator} {amount} neldaama ka {phone}.",
  "receipt.bill": "Fakture {biller} {amount} yo\u0253aama.",
  "receipt.cancelled": "Golle ndee haaytaama. Ceede ittaaka.",
  "history.title": "Golle \u0253ennu\u0257e",
  "history.empty": "Golle alaa tawo.",
  "history.col_date": "\xD1alngu",
  "history.col_label": "Golle",
  "history.col_amount": "Ceede",
  "history.col_status": "Ngonka",
  "history.filter_all": "Fof",
  "history.filter_in": "Ja\u0253aama",
  "history.filter_out": "Neldaama",
  "help.fee": "Njo\u0253di ko ceede banki jogitotoo ngam wa\u0257de golle.",
  "help.limit": "Ke\u0253al ko \u0253uri \u0257uu\u0257ude \u0257e mbaawi neldude e gootel.",
  "help.beneficiary": "Ke\u0253oowo ko ne\u0257\u0257o ja\u0253otoo ceede \u0257ee.",
  "biller.ENEO": "Letti",
  "biller.CAMWATER": "Ndiyam",
  "biller.CANAL": "Tele",
  "biller.CAMTEL": "Internet e telefon",
  "error.INSUFFICIENT_FUNDS": "Ceede keddii\u0257e \u0257ee pa\u0257aani: {missing} ina \u014Bakki.",
  "error.LIMIT_EXCEEDED": "Ceede \u0257ee \u0253uri ke\u0253al: {max} e kala golle.",
  "error.UNKNOWN_BENEFICIARY": "Ke\u0253oowo tawaaka. \u01B3eewto limgal walla innde.",
  "error.UNKNOWN_BILLER": "Fakture anndaaka. Su\u0253o e doggol ngol.",
  "error.AMBIGUOUS_BENEFICIARY": "Yim\u0253e \u0257uu\u0257\u0253e njogii ndee innde. Su\u0253o gooto.",
  "error.INVALID_AMOUNT": "Ceede \u0257ee mo\u01B4\u01B4aani. Winndu limoore.",
  "error.GENERIC": "Golle ndee wa\u0257aaka. \u018Aa\u0253\u0253it caggal."
};
var UI_DICTIONARIES = { fr: {}, en: EN2, fub: FUB2 };
function resolveUiLanguage(requested) {
  if (!isSafinumLanguage(requested)) return "fr";
  return requested in UI_DICTIONARIES || PACK_LOAD.packs.has(requested) ? requested : "fr";
}
function dictionaryFor(language) {
  if (language === "fr") return null;
  const builtIn = UI_DICTIONARIES[language];
  const pack = PACK_LOAD.packs.get(language)?.ui;
  if (!builtIn && !pack) return null;
  return { ...builtIn ?? {}, ...pack ?? {} };
}

// src/ui.ts
var MAX_FRENCH_SHARE = 0.25;
var PLACEHOLDER2 = /\{([a-z_]+)\}/g;
function handleUi(turn, overlay) {
  return translate(turn.strings ?? {}, resolveUiLanguage(turn.language), overlay);
}
function translate(source, language, overlay) {
  const base = dictionaryFor(language);
  const dictionary = base ? { ...base, ...overlay ?? {} } : null;
  if (!dictionary) return { language: "fr", strings: plain(source) };
  const strings = {};
  let french = 0;
  for (const [key, entry] of Object.entries(source)) {
    const value = dictionary[key];
    const text2 = isValidTranslation(entry, value) ? value : entry.text;
    if (text2 === entry.text) french += 1;
    strings[key] = text2;
  }
  const total = Object.keys(source).length;
  if (total > 0 && french / total > MAX_FRENCH_SHARE) return { language: "fr", strings: plain(source) };
  return { language, strings };
}
function isValidTranslation(entry, value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  if (placeholders(entry.text) !== placeholders(value)) return false;
  return typeof entry.max_chars !== "number" || [...value].length <= entry.max_chars;
}
function plain(source) {
  const strings = {};
  for (const [key, entry] of Object.entries(source)) strings[key] = entry.text;
  return strings;
}
function placeholders(text2) {
  return [...new Set([...String(text2).matchAll(PLACEHOLDER2)].map((match) => match[1] ?? ""))].filter((name) => name.length > 0).sort().join(",");
}

// src/session.ts
var TTL_MS = 18e4;
var TtlStore = class {
  constructor(ttlMs = TTL_MS, now = Date.now) {
    this.ttlMs = ttlMs;
    this.now = now;
  }
  ttlMs;
  now;
  states = /* @__PURE__ */ new Map();
  get(key) {
    const entry = this.states.get(key);
    if (!entry) return void 0;
    if (this.now() - entry.updatedAt > this.ttlMs) {
      this.states.delete(key);
      return void 0;
    }
    return entry.value;
  }
  set(key, value) {
    this.states.set(key, { value, updatedAt: this.now() });
  }
  delete(key) {
    this.states.delete(key);
  }
};
var InMemorySessions = class {
  states = /* @__PURE__ */ new Map();
  get(key) {
    const state = this.states.get(key);
    if (!state) return void 0;
    if (Date.now() - state.updatedAt > TTL_MS) {
      this.states.delete(key);
      return void 0;
    }
    return state;
  }
  set(key, state) {
    state.updatedAt = Date.now();
    this.states.set(key, state);
    if (this.states.size > 5e3) this.evict();
  }
  delete(key) {
    this.states.delete(key);
  }
  evict() {
    for (const [key, state] of this.states) {
      if (Date.now() - state.updatedAt > TTL_MS) this.states.delete(key);
    }
  }
};

// src/offline.ts
import fs2 from "node:fs";
var USSD_MAX_CHARS = 182;
var PLACEHOLDER3 = /\{([a-z_]+)\}/gi;
function placeholders2(text2) {
  return [...new Set([...text2.matchAll(PLACEHOLDER3)].map((m) => (m[1] ?? "").toLowerCase()))].sort().join(",");
}
function checkConstraints(text2, max, charset) {
  if (text2.trim() === "") return "EMPTY";
  if (charset === "gsm7") {
    if (!isGsm7(text2)) return "NOT_GSM7";
    if (max !== null && gsm7Length(text2) > max) return "OVER_LENGTH";
    return null;
  }
  if (max !== null && [...text2].length > max) return "OVER_LENGTH";
  return null;
}
var TranslationCache = class _TranslationCache {
  map = /* @__PURE__ */ new Map();
  /** Un cache déjà garni avec les catalogues USSD (gsm7, 182) et écrans (utf8) embarqués. */
  static bundled() {
    const cache = new _TranslationCache();
    for (const language of servedLanguages()) {
      for (const key of USSD_KEYS) {
        const text2 = message(language, key);
        cache.map.set(cacheKey(language, key), { text: text2, max_chars: USSD_MAX_CHARS, charset: "gsm7" });
      }
    }
    for (const [language, dictionary] of Object.entries(UI_DICTIONARIES)) {
      for (const [key, text2] of Object.entries(dictionary)) {
        cache.map.set(cacheKey(language, `ui:${key}`), { text: text2, max_chars: null, charset: "utf8" });
      }
    }
    return cache;
  }
  get(language, key) {
    return this.map.get(cacheKey(language, key));
  }
  /** Les textes d'écran d'une langue, tels que la sandbox les attend (clé sans préfixe). */
  uiStrings(language) {
    const prefix = `${language}|ui:`;
    const out = {};
    for (const [k, v] of this.map) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v.text;
    return out;
  }
  /**
   * Ajoute ou corrige une chaîne. Refuse (retourne la raison) si elle viole `max_chars`, le charset,
   * ou change les emplacements `{x}` de la chaîne déjà connue.
   */
  put(language, key, text2, max_chars, charset) {
    const violation = checkConstraints(text2, max_chars, charset);
    if (violation) return violation;
    const previous = this.map.get(cacheKey(language, key));
    if (previous && placeholders2(previous.text) !== placeholders2(text2)) return "PLACEHOLDERS";
    this.map.set(cacheKey(language, key), { text: text2, max_chars, charset });
    return null;
  }
  get size() {
    return this.map.size;
  }
  toJSON() {
    return Object.fromEntries(this.map);
  }
  /** Recharge un instantané ; les entrées invalides sont ignorées, jamais appliquées à moitié. */
  load(snapshot) {
    let loaded = 0;
    for (const [k, v] of Object.entries(snapshot)) {
      if (!v || typeof v.text !== "string") continue;
      if (checkConstraints(v.text, v.max_chars ?? null, v.charset === "gsm7" ? "gsm7" : "utf8")) continue;
      this.map.set(k, { text: v.text, max_chars: v.max_chars ?? null, charset: v.charset === "gsm7" ? "gsm7" : "utf8" });
      loaded += 1;
    }
    return loaded;
  }
  saveTo(file) {
    fs2.writeFileSync(file, JSON.stringify(this.toJSON(), null, 1), "utf8");
  }
  loadFrom(file) {
    if (!fs2.existsSync(file)) return 0;
    return this.load(JSON.parse(fs2.readFileSync(file, "utf8")));
  }
  /** Menu USSD complet, depuis le cache seul : aucun appel réseau, GSM-7, 182 septets. */
  offlineMenu(language) {
    const pick = (key) => this.get(language, key)?.text ?? message("fr", key);
    const items = MENU_KEYS.map((key, index) => `${index + 1}. ${pick(key)}`);
    const body = `${pick("error.UNREACHABLE")}
${pick("menu.header")}
${items.join("\n")}`;
    return truncateGsm7(toGsm7(body), USSD_MAX_CHARS);
  }
};
var USSD_KEYS = ["menu.header", ...MENU_KEYS, "error.UNREACHABLE"];
function cacheKey(language, key) {
  return `${language}|${key}`;
}
var Connectivity = class {
  constructor(retryMs = 15e3, now = Date.now) {
    this.retryMs = retryMs;
    this.now = now;
  }
  retryMs;
  now;
  offline = false;
  nextProbe = 0;
  get isOffline() {
    return this.offline;
  }
  /** En ligne : toujours. Hors-ligne : une sonde toutes les `retryMs`, le reste du temps on répond depuis le cache. */
  shouldAttempt() {
    return !this.offline || this.now() >= this.nextProbe;
  }
  /** Retourne `true` si on vient de repasser en ligne. */
  markOnline() {
    const wasOffline = this.offline;
    this.offline = false;
    return wasOffline;
  }
  markOffline() {
    this.offline = true;
    this.nextProbe = this.now() + this.retryMs;
  }
};
var SyncQueue = class {
  constructor(file) {
    this.file = file;
    if (file && fs2.existsSync(file)) {
      try {
        this.items = JSON.parse(fs2.readFileSync(file, "utf8"));
        this.counter = this.items.length;
      } catch {
        this.items = [];
      }
    }
  }
  file;
  items = [];
  counter = 0;
  flushing = false;
  get pending() {
    return this.items;
  }
  enqueue(change) {
    this.items = this.items.filter((c) => !(c.language === change.language && c.key === change.key));
    const entry = { ...change, id: `q${Date.now().toString(36)}-${this.counter++}`, queuedAt: (/* @__PURE__ */ new Date()).toISOString() };
    this.items.push(entry);
    this.persist();
    return entry;
  }
  /** Rejoue la file. Retourne le nombre de changements synchronisés. */
  async flush(sender) {
    if (this.flushing || this.items.length === 0) return 0;
    this.flushing = true;
    const batch = [...this.items];
    try {
      const ok = await sender(batch);
      if (!ok) return 0;
      const sent = new Set(batch.map((c) => c.id));
      this.items = this.items.filter((c) => !sent.has(c.id));
      this.persist();
      return batch.length;
    } catch {
      return 0;
    } finally {
      this.flushing = false;
    }
  }
  persist() {
    if (this.file) fs2.writeFileSync(this.file, JSON.stringify(this.items, null, 1), "utf8");
  }
};
var ResilientBank = class {
  constructor(inner, connectivity, onReconnect = () => void 0) {
    this.inner = inner;
    this.connectivity = connectivity;
    this.onReconnect = onReconnect;
  }
  inner;
  connectivity;
  onReconnect;
  account(phone) {
    return this.guard(() => this.inner.account(phone));
  }
  fees(type, amount) {
    return this.guard(() => this.inner.fees(type, amount));
  }
  history(phone, limit) {
    return this.guard(() => this.inner.history(phone, limit));
  }
  beneficiaries(query) {
    return this.guard(() => this.inner.beneficiaries(query));
  }
  billers() {
    return this.guard(() => this.inner.billers());
  }
  create(input) {
    return this.guard(() => this.inner.create(input));
  }
  update(id, patch) {
    return this.guard(() => this.inner.update(id, patch));
  }
  confirm(id) {
    return this.guard(() => this.inner.confirm(id));
  }
  cancel(id) {
    return this.guard(() => this.inner.cancel(id));
  }
  async guard(call) {
    if (!this.connectivity.shouldAttempt()) {
      return { ok: false, status: 0, error: "UNREACHABLE", message: "hors-ligne" };
    }
    let result;
    try {
      result = await call();
    } catch (error) {
      this.connectivity.markOffline();
      return { ok: false, status: 0, error: "UNREACHABLE", message: error instanceof Error ? error.message : String(error) };
    }
    if (!result.ok && result.status === 0 && result.error === "UNREACHABLE") {
      this.connectivity.markOffline();
    } else if (this.connectivity.markOnline()) {
      this.onReconnect();
    }
    return result;
  }
};

// src/gateway.ts
var Gateway = class {
  options;
  sessions;
  secondLook;
  cache;
  queue;
  connectivity;
  constructor(options) {
    this.options = options;
    this.sessions = options.sessions ?? new InMemorySessions();
    this.secondLook = options.secondLook;
    this.cache = options.offline?.cache ?? TranslationCache.bundled();
    this.queue = options.offline?.queue ?? new SyncQueue();
    this.connectivity = options.offline?.connectivity ?? new Connectivity();
    if (options.offline?.cacheFile) this.cache.loadFrom(options.offline.cacheFile);
  }
  /**
   * Correction ou nouvelle traduction : appliquée tout de suite au cache local (valable hors-ligne),
   * puis mise en file pour la synchronisation. Retourne la raison du refus si une contrainte est violée.
   */
  correct(language, key, text2, max_chars, charset = "utf8") {
    const known2 = this.cache.get(language, key) !== void 0;
    const violation = this.cache.put(language, key, text2, max_chars, charset);
    if (violation) return violation;
    this.queue.enqueue({ kind: known2 ? "correction" : "new", language, key, text: text2, max_chars, charset });
    if (this.options.offline?.cacheFile) this.cache.saveTo(this.options.offline.cacheFile);
    if (!this.connectivity.isOffline) void this.sync();
    return null;
  }
  /** Rejoue la file de synchronisation. Sans `sender` configuré, ne fait rien. */
  async sync() {
    const sender = this.options.offline?.sender;
    return sender ? this.queue.flush(sender) : 0;
  }
  async handle(turn) {
    return (await this.handleWithMeta(turn)).reply;
  }
  async handleWithMeta(turn) {
    const channel = normalizeChannel(turn.channel);
    const traceId = String(turn.trace_id ?? "");
    if (isUiTranslation(turn)) {
      const overlay = this.cache.uiStrings(resolveUiLanguage(turn.language));
      return { reply: handleUi(turn, overlay), channel, traceId };
    }
    const bank = this.bankFactory(turn);
    const reply2 = await this.ussd(turn, bank);
    return { reply: channel === "ivr" ? { ...reply2, speech: { text: reply2.response.text, language: reply2.interpretation.language } } : reply2, channel, traceId };
  }
  async ussd(turn, bank) {
    const reply2 = await handleUssd(turn, {
      bank,
      sessions: this.sessions,
      ...this.options.statusMode === void 0 ? {} : { statusMode: this.options.statusMode },
      ...this.options.secondLook ? { secondLook: this.options.secondLook } : {}
    });
    if (reply2.interpretation.parameters.error === "UNREACHABLE") {
      const language = resolveLanguage(reply2.interpretation.language);
      this.sessions.delete(turn.session_id || turn.phone || "sans-session");
      return {
        response: { text: this.cache.offlineMenu(language), end_session: false, options: [] },
        interpretation: { intent: "UNKNOWN", parameters: { offline: true }, language },
        transaction: { id: null, status: "none" }
      };
    }
    return reply2;
  }
  bankFactory(turn) {
    const inner = this.rawBank(turn);
    return new ResilientBank(inner, this.connectivity, () => void this.sync());
  }
  rawBank(turn) {
    if (this.options.bankFactory) return this.options.bankFactory(turn);
    const baseUrl = this.options.bankUrl || turn.bank_api?.base_url || "https://safinum.cm/api/v1";
    return new SafinumBank({
      baseUrl,
      teamKey: this.options.teamKey,
      traceId: String(turn.trace_id ?? ""),
      ...this.options.timeoutMs === void 0 ? {} : { timeoutMs: this.options.timeoutMs },
      ...this.options.fetchImpl === void 0 ? {} : { fetchImpl: this.options.fetchImpl }
    });
  }
};

// src/local.ts
var LOCAL_ONLY_NOTE = "Canal local : aucun appel de retrait n'existe dans l'API bancaire SAFINUM, le distributeur ne fait que simuler la remise d'esp\xE8ces.";
function readDigits(turn) {
  const raw = String(turn.input?.digits ?? turn.input?.text ?? "");
  const cancel = raw.includes("*");
  const submitted = raw.includes("#");
  return { digits: raw.replace(/\D+/g, ""), submitted, cancel };
}
function digitsToAmount(digits) {
  if (!/^\d{1,9}$/.test(digits)) return null;
  const amount = Number.parseInt(digits, 10);
  return Number.isInteger(amount) && amount > 0 ? amount : null;
}
function failureText(language, failure3) {
  const known2 = /* @__PURE__ */ new Set([
    "INSUFFICIENT_FUNDS",
    "LIMIT_EXCEEDED",
    "UNKNOWN_BENEFICIARY",
    "UNKNOWN_BILLER",
    "UNKNOWN_ACCOUNT",
    "INVALID_AMOUNT",
    "TX_NOT_PENDING",
    "UNAUTHORIZED",
    "UNREACHABLE"
  ]);
  const key = known2.has(failure3.error) ? `error.${failure3.error}` : "error.GENERIC";
  return message(language, key);
}

// src/atm.ts
var TIMEOUT_MS = 15e3;
var STEP = 5e3;
var NOTES = [1e4, 5e3];
var defaultSessions = new TtlStore(18e4);
async function handleAtm(turn, deps) {
  const sessions = deps.sessions ?? defaultSessions;
  const key = turn.session_id ?? turn.card ?? "carte-anonyme";
  const language = resolveLanguage(turn.language);
  const state = sessions.get(key) ?? { step: "card", language };
  state.language = language;
  if (!state.card) {
    const fromBody = normalizePhone(turn.card ?? "");
    if (fromBody) state.card = fromBody;
  }
  const input = readDigits(turn);
  const reply2 = await advance2(state, input, deps);
  if (reply2.end) sessions.delete(key);
  else sessions.set(key, state);
  return reply2;
}
async function advance2(state, input, deps) {
  const language = state.language;
  if (input.cancel) {
    state.step = "menu";
    return eject(state, message(language, "done.cancel"));
  }
  switch (state.step) {
    case "card":
      if (!state.card || input.digits !== "") {
        const typed = normalizePhone(input.digits);
        if (typed) state.card = typed;
      }
      if (!state.card) {
        return prompt(state, message(language, "atm.card"), "card", [9, 9]);
      }
      state.step = "pin";
      return prompt(state, message(language, "atm.pin"), "pin", [4, 4]);
    case "pin":
      if (input.digits.length !== 4) {
        return prompt(state, message(language, "ivr.invalid"), "pin", [4, 4]);
      }
      return welcome(state, deps);
    case "menu":
      return menu2(state, input.digits, deps);
    case "amount":
      return withdraw(state, input.digits, deps);
    default:
      state.step = "menu";
      return prompt(state, message(language, "atm.menu"), "menu", [1, 1]);
  }
}
async function welcome(state, deps) {
  const language = state.language;
  const card = state.card ?? "";
  const account = await deps.bank.account(card);
  if (!account.ok) return eject(state, failureText(language, account));
  state.holder = account.data.holder;
  state.step = "menu";
  return prompt(
    state,
    `${message(language, "atm.welcome", { name: account.data.holder || displayPhone(card) })}
${message(language, "atm.menu")}`,
    "menu",
    [1, 1]
  );
}
async function menu2(state, digits, deps) {
  const language = state.language;
  if (digits === "4") return eject(state, message(language, "atm.eject"));
  if (digits === "2") {
    const account = await deps.bank.account(state.card ?? "");
    if (!account.ok) return eject(state, failureText(language, account));
    return {
      ...eject(state, message(language, "balance", { balance: money(account.data.balance) })),
      receipt: { kind: "balance", balance: account.data.balance }
    };
  }
  if (digits === "3") {
    const history2 = await deps.bank.history(state.card ?? "", 3);
    if (!history2.ok) return eject(state, failureText(language, history2));
    if (history2.data.length === 0) return eject(state, message(language, "history.empty"));
    const lines = history2.data.slice(0, 3).map(
      (entry) => message(language, "history.line", {
        date: entry.at.slice(5, 10),
        label: entry.label || entry.type,
        amount: `${entry.direction === "in" ? "+" : "-"}${money(entry.amount)}`
      })
    );
    return {
      ...eject(state, [message(language, "history.header"), ...lines].join("\n")),
      receipt: { kind: "history", lines }
    };
  }
  if (digits === "1") {
    state.step = "amount";
    return prompt(state, message(language, "ivr.askAmount"), "amount", [4, 6]);
  }
  return prompt(state, `${message(language, "ivr.invalid")}
${message(language, "atm.menu")}`, "menu", [1, 1]);
}
async function withdraw(state, digits, deps) {
  const language = state.language;
  const amount = digitsToAmount(digits);
  if (amount === null) return prompt(state, message(language, "invalid.amount"), "amount", [4, 6]);
  if (amount % STEP !== 0) {
    return prompt(
      state,
      `${message(language, "atm.multiple", { step: money(STEP, "").trim() })}`,
      "amount",
      [4, 6]
    );
  }
  if (amount > MAX_AMOUNT) {
    return prompt(state, message(language, "invalid.limit", { max: money(MAX_AMOUNT) }), "amount", [4, 6]);
  }
  const account = await deps.bank.account(state.card ?? "");
  if (!account.ok) return eject(state, failureText(language, account));
  const fee = officialFee("withdrawal", amount) ?? 0;
  if (amount + fee > account.data.balance) {
    return eject(state, message(language, "error.INSUFFICIENT_FUNDS"));
  }
  return {
    ...eject(
      state,
      `${message(language, "atm.dispensed", { amount: money(amount), fee: money(fee) })}
${message(language, "atm.simulated")}`
    ),
    receipt: {
      kind: "withdrawal",
      amount,
      fee,
      total: amount + fee,
      notes: notesFor(amount),
      simulated: true
    }
  };
}
function notesFor(amount) {
  const notes = [];
  let remaining = amount;
  for (const note of NOTES) {
    while (remaining >= note) {
      notes.push(note);
      remaining -= note;
    }
  }
  return notes;
}
function prompt(state, screen, type, digits) {
  return {
    channel: "atm",
    language: state.language,
    screen,
    gather: { type, digits, terminator: "#", cancel: "*", timeout_ms: TIMEOUT_MS },
    simulation: simulation(),
    state: state.card ? { step: state.step, card: state.card } : { step: state.step },
    end: false
  };
}
function eject(state, screen) {
  return {
    channel: "atm",
    language: state.language,
    screen,
    gather: null,
    simulation: simulation(),
    state: state.card ? { step: state.step, card: state.card } : { step: state.step },
    end: true
  };
}
function simulation() {
  return { localOnly: true, bankRoute: "none", pinVerified: false, note: LOCAL_ONLY_NOTE };
}

// src/ivr.ts
var TIMEOUT_MS2 = 8e3;
var defaultSessions2 = new TtlStore(3e5);
async function handleIvr(turn, deps) {
  const sessions = deps.sessions ?? defaultSessions2;
  const key = turn.call_id ?? turn.session_id ?? turn.phone ?? "appel-sans-cle";
  const language = resolveLanguage(turn.language);
  const state = sessions.get(key) ?? { step: "menu", language };
  state.language = language;
  const phone = normalizePhone(turn.phone ?? "");
  if (!phone) {
    return finish(state, message(language, "error.UNKNOWN_ACCOUNT"));
  }
  const input = readDigits(turn);
  const reply2 = await advance3(state, phone, input, deps);
  if (reply2.end) sessions.delete(key);
  else sessions.set(key, state);
  return reply2;
}
async function advance3(state, phone, input, deps) {
  const language = state.language;
  if (input.cancel) {
    if (state.pending) await deps.bank.cancel(state.pending.id);
    state.pending = void 0;
    state.step = "menu";
    return prompt2(state, `${message(language, "done.cancel")}
${message(language, "ivr.menu")}`, "menu", [1, 1]);
  }
  if (state.step === "menu" && input.digits === "" && !input.submitted) {
    return prompt2(state, message(language, "ivr.menu"), "menu", [1, 1]);
  }
  switch (state.step) {
    case "menu":
      return menu3(state, phone, input.digits, deps);
    case "beneficiary": {
      const target = normalizePhone(input.digits);
      if (!target) {
        return prompt2(state, message(language, "ivr.invalid"), "digits", [9, 9]);
      }
      state.to = target;
      state.name = target;
      state.step = "amount";
      return prompt2(state, message(language, "ivr.askAmount"), "amount", [1, 6]);
    }
    case "amount":
      return createTransfer(state, phone, input.digits, deps);
    case "fees_amount": {
      const amount = digitsToAmount(input.digits);
      if (amount === null || amount > MAX_AMOUNT) {
        return prompt2(state, message(language, "invalid.amount"), "amount", [1, 6]);
      }
      const quote = await deps.bank.fees("transfer", amount);
      const fee = quote.ok ? quote.data.fee : officialFee("transfer", amount) ?? 0;
      return finish(
        state,
        message(language, "fees", {
          amount: money(amount),
          fee: money(fee),
          total: money(amount + fee)
        })
      );
    }
    case "confirm":
      return atConfirmation2(state, input.digits, deps);
    default:
      state.step = "menu";
      return prompt2(state, message(language, "ivr.menu"), "menu", [1, 1]);
  }
}
async function menu3(state, phone, digits, deps) {
  const language = state.language;
  if (digits === "0") return finish(state, message(language, "ivr.hangup"));
  if (digits === "1") {
    const account = await deps.bank.account(phone);
    if (!account.ok) return finish(state, failureText(language, account));
    return finish(state, message(language, "balance", { balance: money(account.data.balance) }));
  }
  if (digits === "2") {
    state.step = "beneficiary";
    return prompt2(state, message(language, "ivr.askBeneficiary"), "digits", [9, 9]);
  }
  if (digits === "3") {
    state.step = "fees_amount";
    return prompt2(state, message(language, "ivr.askAmount"), "amount", [1, 6]);
  }
  return prompt2(
    state,
    `${message(language, "ivr.invalid")}
${message(language, "ivr.menu")}`,
    "menu",
    [1, 1]
  );
}
async function createTransfer(state, phone, digits, deps) {
  const language = state.language;
  const amount = digitsToAmount(digits);
  if (amount === null) return prompt2(state, message(language, "invalid.amount"), "amount", [1, 6]);
  if (amount > MAX_AMOUNT) {
    return prompt2(state, message(language, "invalid.limit", { max: money(MAX_AMOUNT) }), "amount", [1, 6]);
  }
  const to = state.to ?? phone;
  const created = await deps.bank.create({ type: "transfer", from: phone, to, amount });
  if (!created.ok) return finish(state, failureText(language, created));
  const transaction = created.data;
  const fee = transaction.fee || officialFee("transfer", amount) || 0;
  state.pending = {
    id: transaction.id,
    amount: transaction.amount || amount,
    fee,
    total: transaction.total || amount + fee
  };
  state.step = "confirm";
  const recap = message(language, "confirm.transfer", {
    amount: money(state.pending.amount),
    fee: money(state.pending.fee),
    total: money(state.pending.total),
    recipient: recipient(state)
  });
  return prompt2(state, `${recap}
${message(language, "ivr.confirmPrompt")}`, "confirm", [1, 1]);
}
async function atConfirmation2(state, digits, deps) {
  const language = state.language;
  const pending = state.pending;
  if (!pending) {
    state.step = "menu";
    return prompt2(state, message(language, "ivr.menu"), "menu", [1, 1]);
  }
  if (digits === "1") {
    const confirmed = await deps.bank.confirm(pending.id);
    if (!confirmed.ok) return finish(state, failureText(language, confirmed));
    const transaction = confirmed.data;
    return finish(
      state,
      message(language, "done.transfer", {
        amount: money(transaction.amount || pending.amount),
        recipient: recipient(state),
        ref: transaction.id || pending.id,
        balance: money(transaction.balanceAfter ?? 0)
      })
    );
  }
  if (digits === "2") {
    await deps.bank.cancel(pending.id);
    state.pending = void 0;
    return finish(state, message(language, "done.cancel"));
  }
  return prompt2(state, message(language, "ivr.confirmPrompt"), "confirm", [1, 1]);
}
function recipient(state) {
  const phone = displayPhone(state.to ?? "");
  if (!state.name || state.name === state.to) return phone;
  return `${state.name} (${phone})`;
}
function prompt2(state, say, type, digits) {
  return {
    channel: "ivr",
    language: state.language,
    say,
    gather: { type, digits, terminator: "#", cancel: "*", timeout_ms: TIMEOUT_MS2 },
    state: stateView(state),
    end: false
  };
}
function finish(state, say) {
  return {
    channel: "ivr",
    language: state.language,
    say,
    gather: null,
    state: stateView(state),
    end: true
  };
}
function stateView(state) {
  return state.pending ? { step: state.step, pending_id: state.pending.id } : { step: state.step };
}

// src/sms.ts
var SMS_MAX_SINGLE_GSM7 = 160;
var SMS_MAX_SINGLE_UCS2 = 70;
var SMS_MAX_SEGMENT_GSM7 = 153;
var SMS_MAX_SEGMENT_UCS2 = 67;
var GSM7 = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
function smsSegment(text2) {
  const gsm7 = GSM7.test(text2);
  const single = gsm7 ? SMS_MAX_SINGLE_GSM7 : SMS_MAX_SINGLE_UCS2;
  const per = gsm7 ? SMS_MAX_SEGMENT_GSM7 : SMS_MAX_SEGMENT_UCS2;
  const length = text2.length;
  const segments = length <= single ? 1 : Math.ceil(length / per);
  return {
    encoding: gsm7 ? "gsm7" : "ucs2",
    length,
    segments,
    // Limite réellement appliquée : 160/70 pour un message seul, 153/67 dès qu'il est découpé.
    per_segment: segments === 1 ? single : per
  };
}
async function handleSms(turn, deps) {
  const reply2 = await handleUssd({ ...turn, channel: "sms" }, deps);
  return {
    channel: "sms",
    response: reply2.response,
    interpretation: reply2.interpretation,
    transaction: reply2.transaction,
    sms: smsSegment(reply2.response.text)
  };
}

// src/word-base.ts
import fs3 from "node:fs";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
function emptyDb() {
  return {
    _lisez_moi: "Base de mots de NkapLingua. Ajoutez une langue ou des mots avec : pnpm --filter @nkap/gateway lang \u2026 Le lexique TypeScript reste la r\xE9f\xE9rence ; cette base s'y ajoute. \xAB remplace: true \xBB (produit par \xAB lang exporter <code> \xBB) fait venir la langue enti\xE8rement d'ici. Poids de 1 (indice faible) \xE0 5 (mot sans ambigu\xEFt\xE9).",
    langues: {}
  };
}
function wordDbPath() {
  return process.env.NKAP_WORD_DB ?? fileURLToPath2(new URL("../data/langues.json", import.meta.url));
}
function readDb(file = wordDbPath()) {
  if (!fs3.existsSync(file)) return { file, exists: false, db: emptyDb(), problems: [] };
  let raw;
  try {
    raw = JSON.parse(fs3.readFileSync(file, "utf8"));
  } catch (error) {
    return { file, exists: true, db: emptyDb(), problems: [`JSON illisible : ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { file, exists: true, db: emptyDb(), problems: ['objet JSON attendu : { "langues": { \u2026 } }'] };
  }
  const record = raw;
  const langues = record.langues;
  if (typeof langues !== "object" || langues === null || Array.isArray(langues)) {
    return { file, exists: true, db: emptyDb(), problems: ["\xAB langues \xBB doit \xEAtre un objet { code: { \u2026 } }"] };
  }
  const problems = checkDbLanguage(record.langues);
  return { file, exists: true, db: { ...record }, problems };
}
function checkDbLanguage(langues) {
  const problems = [];
  for (const [code, raw] of Object.entries(langues)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      problems.push(`${code} : objet attendu`);
      continue;
    }
    const entry = raw;
    if (entry.alias !== void 0 && !Array.isArray(entry.alias)) problems.push(`${code}.alias : liste de cha\xEEnes attendue`);
    if (entry.sources !== void 0 && !Array.isArray(entry.sources)) problems.push(`${code}.sources : liste de cha\xEEnes attendue`);
  }
  return problems;
}
function writeDb(db, file = wordDbPath()) {
  fs3.mkdirSync(path2.dirname(file), { recursive: true });
  fs3.writeFileSync(file, `${JSON.stringify(db, null, 2)}
`);
  return file;
}
function toWordBase(db) {
  const languages = {};
  for (const [code, entry] of Object.entries(db.langues ?? {})) {
    const intents = {};
    for (const [intent, cues] of Object.entries(entry.mots ?? {})) {
      if (Array.isArray(cues) && cues.length > 0) intents[intent] = cues;
    }
    languages[code] = {
      ...entry.alias === void 0 ? {} : { names: entry.alias },
      ...entry.remplace === void 0 ? {} : { replace: entry.remplace },
      ...entry.mots_outils === void 0 ? {} : { functionWords: entry.mots_outils },
      ...Object.keys(intents).length === 0 ? {} : { intents }
    };
  }
  return { languages };
}
function checkDbProblems(db) {
  const structural = checkDbLanguage(db.langues ?? {});
  return [...structural, ...checkWordBase(toWordBase(db))];
}
var lastApply = { file: wordDbPath(), exists: false, ok: true, problems: [], report: null };
function lastWordBase() {
  return lastApply;
}
function applyWordDb(file = wordDbPath()) {
  const load = readDb(file);
  if (load.problems.length > 0) {
    lastApply = { file: load.file, exists: load.exists, ok: false, problems: load.problems, report: null };
    return lastApply;
  }
  const base = toWordBase(load.db);
  const problems = checkWordBase(base);
  if (problems.length > 0) {
    lastApply = { file: load.file, exists: load.exists, ok: false, problems, report: null };
    return lastApply;
  }
  const report = installWordBase(base);
  lastApply = { file: load.file, exists: load.exists, ok: true, problems: [], report };
  return lastApply;
}

// src/language-catalog.ts
var UI_REFERENCE = UI_DICTIONARIES.en ?? {};
function languageCatalog() {
  return SAFINUM_LANGUAGES.map((code) => {
    const pack = PACK_LOAD.packs.get(code);
    const served = isServedLanguage(code);
    const audit = pack === void 0 ? null : auditPack(pack, { ui: UI_REFERENCE, ussd: USSD_REFERENCE });
    return {
      code,
      nom: LANGUAGE_INFO[code].nativeName,
      mots: functionWordsOf(code).length + intentCuesOf(code).length,
      pack: pack === void 0 ? code === "fr" || code === "en" || code === "fub" ? "int\xE9gr\xE9" : "absent" : pack.status,
      ecrans: audit === null ? code === "fr" || code === "en" || code === "fub" ? "int\xE9gr\xE9s" : "0/" + String(Object.keys(UI_REFERENCE).length) : `${audit.ui.translated}/${audit.ui.total}`,
      ussd: served ? "servi" : "repli fr",
      sources: pack?.sources ?? []
    };
  });
}

// src/lang-admin.ts
var SANDBOX = new Set(languageCatalog().map((entry) => entry.code));
var INTENT_SET2 = new Set(INTENTS);
function words(list) {
  return (list ?? []).map(([texte, poids]) => ({ texte, poids }));
}
function entryOf(db, code) {
  return db.langues[code] ?? {};
}
function withEntry(db, code, entry) {
  return { ...db, langues: { ...db.langues, [code]: entry } };
}
function count(entry) {
  return (entry.mots_outils?.length ?? 0) + Object.values(entry.mots ?? {}).reduce((total, list) => total + list.length, 0);
}
function adminState() {
  const load = readDb();
  const catalog = new Map(languageCatalog().map((entry) => [entry.code, entry]));
  const languages = Object.entries(load.db.langues ?? {}).map(([code, entry]) => {
    const known2 = LANGUAGES.includes(code);
    const mots = Object.fromEntries(
      Object.entries(entry.mots ?? {}).map(([intent, list]) => [intent, words(list)])
    );
    const served = catalog.get(code);
    return {
      code,
      nom: entry.nom ?? (known2 ? LANGUAGE_INFO[code].nativeName : code),
      sandbox: SANDBOX.has(code),
      alias: [...entry.alias ?? []],
      remplace: entry.remplace === true,
      sources: [...entry.sources ?? []],
      mots_outils: words(entry.mots_outils),
      mots,
      total: count(entry),
      service: served === void 0 ? "hors sandbox" : served.ussd
    };
  }).sort((a, b) => a.code.localeCompare(b.code));
  const inDb = new Set(languages.map((language) => language.code));
  const disponibles = LANGUAGES.filter((code) => !inDb.has(code)).map((code) => ({
    code,
    nom: LANGUAGE_INFO[code].nativeName,
    sandbox: SANDBOX.has(code)
  }));
  const applied = applyWordDb();
  return {
    file: load.file,
    ok: load.problems.length === 0,
    problems: [...load.problems, ...applied.problems],
    languages,
    disponibles,
    intents: [...INTENTS],
    weights: { min: MIN_WEIGHT, max: MAX_WEIGHT },
    applied: {
      ok: applied.ok,
      words: applied.report?.cues ?? 0,
      languages: [...applied.report?.languages ?? []]
    }
  };
}
function bad(problems) {
  return { status: 400, body: { ok: false, problems } };
}
function saved(db, message2) {
  const problems = checkDbProblems(db);
  if (problems.length > 0) return bad(problems);
  const file = writeDb(db);
  const applied = applyWordDb(file);
  if (!applied.ok) return { status: 400, body: { ok: false, file, problems: applied.problems } };
  return {
    status: 200,
    body: { ok: true, file, message: message2, words: applied.report?.cues ?? 0, languages: applied.report?.languages ?? [] }
  };
}
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function textList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter((item) => item !== "");
}
function weightOf(value) {
  const weight = typeof value === "number" ? value : Number(value);
  return Number.isInteger(weight) && weight >= MIN_WEIGHT && weight <= MAX_WEIGHT ? weight : null;
}
function loadForWrite() {
  const load = readDb();
  if (load.problems.length > 0) return bad([`base existante invalide : ${load.problems.join(" ; ")}`]);
  return { db: load.exists ? load.db : emptyDb() };
}
function known(code) {
  return LANGUAGES.includes(code);
}
function upsertLanguage(payload) {
  const code = text(payload.code);
  if (!known(code)) return bad([`langue inconnue : \xAB ${code} \xBB (connues : ${LANGUAGES.join(", ")})`]);
  const loaded = loadForWrite();
  if ("status" in loaded) return loaded;
  const previous = entryOf(loaded.db, code);
  const nom = text(payload.nom) || previous.nom || LANGUAGE_INFO[code].nativeName;
  const alias = payload.alias === void 0 ? [...previous.alias ?? []] : textList(payload.alias);
  const sources = payload.sources === void 0 ? [...previous.sources ?? ["\xC0 compl\xE9ter : locuteur, ville, date de la session"]] : textList(payload.sources);
  const next = {
    ...previous,
    nom,
    alias,
    remplace: previous.remplace === true,
    sources
  };
  return saved(withEntry(loaded.db, code, next), `langue \xAB ${code} \xBB enregistr\xE9e`);
}
function upsertWord(payload) {
  const code = text(payload.code);
  const texte = text(payload.texte);
  const weight = weightOf(payload.poids ?? 3);
  const outil = payload.intention === null || payload.intention === void 0 || payload.intention === "";
  const intention = outil ? null : text(payload.intention);
  if (!known(code)) return bad([`langue inconnue : \xAB ${code} \xBB`]);
  if (texte === "") return bad(["mot manquant"]);
  if (weight === null) return bad([`poids invalide : entier ${MIN_WEIGHT}\u2013${MAX_WEIGHT} attendu`]);
  if (intention !== null && !INTENT_SET2.has(intention)) return bad([`intention inconnue : \xAB ${intention} \xBB`]);
  const loaded = loadForWrite();
  if ("status" in loaded) return loaded;
  const entry = entryOf(loaded.db, code);
  const target = texte.toLowerCase();
  if (intention === null) {
    const list2 = [...entry.mots_outils ?? []];
    const index2 = list2.findIndex(([existing]) => existing.toLowerCase() === target);
    if (index2 === -1) list2.push([texte, weight]);
    else list2[index2] = [list2[index2][0], weight];
    const next2 = { ...entry, mots_outils: list2 };
    return saved(withEntry(loaded.db, code, next2), index2 === -1 ? `mot-outil \xAB ${texte} \xBB ajout\xE9` : `poids de \xAB ${texte} \xBB mis \xE0 jour`);
  }
  const mots = { ...entry.mots ?? {} };
  const list = [...mots[intention] ?? []];
  const index = list.findIndex(([existing]) => existing.toLowerCase() === target);
  if (index === -1) list.push([texte, weight]);
  else list[index] = [list[index][0], weight];
  mots[intention] = list;
  const next = { ...entry, mots };
  return saved(
    withEntry(loaded.db, code, next),
    index === -1 ? `${intention} \u2190 \xAB ${texte} \xBB (${weight}) ajout\xE9` : `poids de \xAB ${texte} \xBB mis \xE0 jour`
  );
}
function deleteWord(payload) {
  const code = text(payload.code);
  const texte = text(payload.texte).toLowerCase();
  if (!known(code)) return bad([`langue inconnue : \xAB ${code} \xBB`]);
  if (texte === "") return bad(["mot manquant"]);
  const loaded = loadForWrite();
  if ("status" in loaded) return loaded;
  const entry = entryOf(loaded.db, code);
  const motsOutils = (entry.mots_outils ?? []).filter(([existing]) => existing.toLowerCase() !== texte);
  const mots = {};
  let removed = (entry.mots_outils?.length ?? 0) - motsOutils.length;
  for (const [intent, cues] of Object.entries(entry.mots ?? {})) {
    const kept = cues.filter(([existing]) => existing.toLowerCase() !== texte);
    removed += cues.length - kept.length;
    if (kept.length > 0) mots[intent] = kept;
  }
  if (removed === 0) {
    return {
      status: 404,
      body: {
        ok: false,
        problems: [
          `\xAB ${texte} \xBB n'est pas dans la base pour ${code}` + (entry.remplace === true ? "" : ` \u2014 lancez \xAB exporter ${code} \xBB s'il vient du lexique int\xE9gr\xE9`)
        ]
      }
    };
  }
  const next = { ...entry, mots_outils: motsOutils, mots };
  return saved(withEntry(loaded.db, code, next), `\xAB ${texte} \xBB retir\xE9 (${removed} entr\xE9e(s))`);
}
function exportLanguage(payload) {
  const code = text(payload.code);
  if (!known(code)) return bad([`langue inconnue : \xAB ${code} \xBB`]);
  const loaded = loadForWrite();
  if ("status" in loaded) return loaded;
  const table = intentCuesTable();
  const mots = {};
  for (const intent of INTENTS) {
    const list = table[intent]?.[code] ?? [];
    if (list.length > 0) mots[intent] = list.map(([texte, poids]) => [texte, poids]);
  }
  const motsOutils = functionWordsOf(code).map(([texte, poids]) => [texte, poids]);
  const total = motsOutils.length + Object.values(mots).reduce((sum, list) => sum + list.length, 0);
  if (total === 0) {
    return bad([`aucun mot \xE0 exporter pour ${code} : ajoutez d'abord des mots (le moteur n'en conna\xEEt aucun)`]);
  }
  const previous = entryOf(loaded.db, code);
  const next = {
    nom: previous.nom ?? LANGUAGE_INFO[code].nativeName,
    alias: [...previous.alias ?? []],
    remplace: true,
    sources: previous.sources && previous.sources.length > 0 ? previous.sources : ["lexique int\xE9gr\xE9 (packages/core/src/lexicon)"],
    mots_outils: motsOutils,
    mots
  };
  return saved(withEntry(loaded.db, code, next), `${code} export\xE9 (${total} mot(s)) \u2014 la base fait foi`);
}
function test(payload) {
  const phrase = text(payload.phrase);
  if (phrase === "") return bad(["phrase vide"]);
  const result = interpret(phrase, { hintLang: "fr", knownNames: [] });
  return {
    status: 200,
    body: {
      ok: true,
      phrase,
      langue: result.lang,
      confiance: result.langConfidence,
      intention: result.intent,
      intention_confiance: result.confidence,
      parametres: result.slots,
      indices: [...result.cues].slice(0, 12)
    }
  };
}
function adminAction(action, payload) {
  switch (action) {
    case "langue":
      return upsertLanguage(payload);
    case "mot":
      return upsertWord(payload);
    case "supprimer":
      return deleteWord(payload);
    case "exporter":
      return exportLanguage(payload);
    case "tester":
      return test(payload);
    default:
      return { status: 404, body: { ok: false, problems: [`action inconnue : \xAB ${action} \xBB`] } };
  }
}

// src/voice.ts
import fs4 from "node:fs";
import path3 from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
var VOICE_MODELS = {
  fr: "facebook/mms-tts-fra",
  en: "facebook/mms-tts-eng"
};
var NO_VOICE_MODEL = ["fub", "dua", "ewo", "bas", "bbj", "byv", "wes"];
function audioDir() {
  return process.env.NKAP_AUDIO_DIR ?? fileURLToPath3(new URL("../audio", import.meta.url));
}
function voiceModel(lang) {
  return VOICE_MODELS[lang] ?? null;
}
function loadAudioIndex(dir = audioDir()) {
  const file = path3.join(dir, "index.json");
  if (!fs4.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs4.readFileSync(file, "utf8"));
    if (!Array.isArray(raw.clips)) return null;
    return raw;
  } catch {
    return null;
  }
}
function normalize2(text2) {
  return text2.replace(/\s+/g, " ").trim();
}
function clipForText(lang, text2, dir = audioDir()) {
  const index = loadAudioIndex(dir);
  if (index === null) return null;
  const wanted = normalize2(text2);
  return index.clips.find((clip) => clip.lang === lang && normalize2(clip.text) === wanted) ?? null;
}
function audioUrl(clip) {
  return `/audio/${clip.lang}/${clip.key}.wav`;
}
function voiceSummary(dir = audioDir()) {
  const index = loadAudioIndex(dir);
  const counts = /* @__PURE__ */ new Map();
  const models = /* @__PURE__ */ new Map();
  for (const clip of index?.clips ?? []) {
    counts.set(clip.lang, (counts.get(clip.lang) ?? 0) + 1);
    if (!models.has(clip.lang)) models.set(clip.lang, clip.model);
  }
  return {
    engine: index?.engine ?? "facebook/mms-tts",
    available: index !== null && index.clips.length > 0,
    generated_at: index?.generated_at ?? null,
    languages: [...counts.entries()].map(([lang, clips]) => ({ lang, model: VOICE_MODELS[lang] ?? models.get(lang) ?? "inconnu", clips })).sort((a, b) => a.lang.localeCompare(b.lang)),
    withoutModel: [...NO_VOICE_MODEL],
    licence: index?.licence ?? "facebook/mms-tts \u2014 CC-BY-NC 4.0"
  };
}

// src/env.ts
import fs5 from "node:fs";
import path4 from "node:path";
import { fileURLToPath as fileURLToPath4 } from "node:url";
function loadEnv(file) {
  const candidates = file ? [file] : [path4.join(process.cwd(), ".env"), fileURLToPath4(new URL("../.env", import.meta.url))];
  for (const candidate of candidates) read(candidate);
}
function read(file) {
  if (!fs5.existsSync(file)) return;
  for (const line of fs5.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (line.trim().startsWith("#")) continue;
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!match) continue;
    const key = match[1];
    const raw = match[2];
    if (key === void 0 || raw === void 0) continue;
    if (process.env[key] !== void 0) continue;
    process.env[key] = raw.replace(/^(['"])(.*)\1$/, "$2");
  }
}

// src/server.ts
var MAX_BODY_BYTES = 512 * 1024;
var KNOWN_CHANNELS = /* @__PURE__ */ new Set(["ussd", "mobile", "web", "sms", "atm", "ivr"]);
var V2_CHANNELS = /* @__PURE__ */ new Set(["sms", "atm", "ivr"]);
function createMiddlewareServer(options) {
  const gateway = new Gateway({
    teamKey: options.teamKey,
    bankUrl: options.bankUrl,
    ...options.statusMode === void 0 ? {} : { statusMode: options.statusMode }
  });
  const log = options.log ?? ((line) => console.log(line));
  const ivrSessions = new TtlStore(3e5);
  const smsSessions = new TtlStore(6e5);
  return http.createServer((req, res) => {
    void (async () => {
      const started = Date.now();
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && (url.pathname === "/console" || url.pathname === "/console/")) {
        const page = fs6.readFileSync(fileURLToPath5(new URL("../public/console.html", import.meta.url)), "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page);
        return;
      }
      if (req.method === "GET" && (url.pathname === "/langues-admin" || url.pathname === "/langues-admin/")) {
        if (!isLoopback(req)) return json(res, 403, { error: "Page locale uniquement" });
        const page = fs6.readFileSync(fileURLToPath5(new URL("../public/langues.html", import.meta.url)), "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page);
        return;
      }
      if (url.pathname === "/api/langues" || url.pathname.startsWith("/api/langues/")) {
        if (!isLoopback(req)) return json(res, 403, { error: "Administration locale uniquement" });
        if (url.pathname === "/api/langues" || url.pathname === "/api/langues/") {
          if (req.method !== "GET") return json(res, 405, { error: "GET attendu" });
          return json(res, 200, adminState());
        }
        if (req.method !== "POST") return json(res, 405, { error: "POST attendu" });
        let body;
        try {
          body = await readJson(req);
        } catch (error) {
          const message2 = error instanceof Error ? error.message : String(error);
          return json(res, message2 === "TOO_LARGE" ? 413 : 400, { error: message2 === "TOO_LARGE" ? "Corps trop volumineux" : "JSON invalide" });
        }
        const action = url.pathname.split("/")[3] ?? "";
        const result = adminAction(action, typeof body === "object" && body !== null ? body : {});
        log(`lang-admin ${action} HTTP ${result.status}`);
        return json(res, result.status, result.body);
      }
      if (req.method === "GET" && (url.pathname === "/langues" || url.pathname === "/langues/")) {
        const words2 = lastWordBase();
        return json(res, 200, {
          languages: languageCatalog(),
          wordBase: {
            file: words2.file,
            loaded: words2.report !== null,
            ok: words2.ok,
            languages: words2.report?.languages ?? [],
            words: words2.report?.cues ?? 0,
            problems: words2.problems
          }
        });
      }
      if (req.method === "GET" && (url.pathname === "/voix" || url.pathname === "/voix/")) {
        const page = fs6.readFileSync(fileURLToPath5(new URL("../public/voix.html", import.meta.url)), "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page);
        return;
      }
      if (req.method === "GET" && url.pathname === "/audio/index.json") {
        const index = loadAudioIndex();
        if (index === null) return json(res, 404, { error: "Aucun clip : lancez pnpm --filter @nkap/gateway tts" });
        return json(res, 200, index);
      }
      const audioClip = url.pathname.match(/^\/audio\/([a-z]{2,3})\/([a-z0-9._-]+)\.wav$/i);
      if (req.method === "GET" && audioClip) {
        const lang = audioClip[1] ?? "";
        const key = audioClip[2] ?? "";
        const dir = path5.resolve(audioDir());
        const file = path5.resolve(dir, lang, `${key}.wav`);
        if (!file.startsWith(dir + path5.sep) || !fs6.existsSync(file)) {
          return json(res, 404, { error: "Clip inconnu" });
        }
        res.writeHead(200, {
          "Content-Type": "audio/wav",
          "Content-Length": fs6.statSync(file).size,
          "Cache-Control": "public, max-age=3600"
        });
        fs6.createReadStream(file).pipe(res);
        return;
      }
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        const words2 = lastWordBase();
        return json(res, 200, {
          ok: true,
          service: "nkaplingua-safinum-middleware",
          channels: ["ussd", "mobile", "web", "sms", "atm", "ivr"],
          localChannels: options.localChannels ? ["ivr", "atm"] : [],
          teamKeyConfigured: options.teamKey.length > 0,
          bankUrl: options.bankUrl,
          wordBase: { file: words2.file, ok: words2.ok, languages: words2.report?.languages ?? [], words: words2.report?.cues ?? 0, problems: words2.problems },
          voice: voiceSummary()
        });
      }
      const second = url.pathname.match(/^\/second-look\/([\w-]+)\/answer$/);
      if (req.method === "POST" && second) {
        if (!gateway.secondLook) return json(res, 404, { error: "Second regard d\xE9sactiv\xE9" });
        let body;
        try {
          body = await readJson(req);
        } catch {
          return json(res, 400, { error: "JSON invalide" });
        }
        const outcome = await gateway.secondLook.answer(second[1] ?? "", typeof body.text === "string" ? body.text : "");
        return json(res, outcome === "unknown" ? 404 : 200, { decision: outcome });
      }
      if (req.method === "POST" && url.pathname === "/ivr") {
        if (!options.localChannels) return json(res, 404, { error: "Route inconnue" });
        let ivrBody;
        try {
          ivrBody = await readJson(req);
        } catch (error) {
          const message2 = error instanceof Error ? error.message : String(error);
          return json(res, message2 === "TOO_LARGE" ? 413 : 400, { error: message2 === "TOO_LARGE" ? "Corps trop volumineux" : "JSON invalide" });
        }
        const trace = traceFrom(req.headers["x-trace-id"], ivrBody.trace_id) ?? "";
        const bank = new SafinumBank({ baseUrl: options.bankUrl, teamKey: options.teamKey, traceId: trace });
        const reply2 = await handleIvr(
          {
            call_id: ivrBody.call_id,
            session_id: ivrBody.session_id,
            phone: ivrBody.phone,
            language: ivrBody.language ?? null,
            input: ivrBody.input
          },
          { bank, sessions: ivrSessions }
        );
        log(`trace=${trace || "-"} channel=ivr`);
        const clip = clipForText(reply2.language, reply2.say);
        const model = clip?.model ?? voiceModel(reply2.language);
        return json(res, 200, {
          ...reply2,
          audio: clip === null ? null : { url: audioUrl(clip), duration_ms: clip.duration_ms, model: clip.model, engine: clip.engine, status: clip.status },
          voice: model === null ? { model: null, note: "Aucun mod\xE8le MMS-TTS publi\xE9 pour cette langue : pas de voix synth\xE9tique." } : { model }
        });
      }
      if (req.method === "POST" && url.pathname === "/atm") {
        if (!options.localChannels) return json(res, 404, { error: "Route inconnue" });
        let atmBody;
        try {
          atmBody = await readJson(req);
        } catch (error) {
          const message2 = error instanceof Error ? error.message : String(error);
          return json(res, message2 === "TOO_LARGE" ? 413 : 400, { error: message2 === "TOO_LARGE" ? "Corps trop volumineux" : "JSON invalide" });
        }
        const trace = traceFrom(req.headers["x-trace-id"], void 0) ?? "";
        const bank = new SafinumBank({ baseUrl: options.bankUrl, teamKey: options.teamKey, traceId: trace });
        const reply2 = await handleAtm(
          {
            session_id: atmBody.session_id,
            card: atmBody.card,
            language: atmBody.language ?? null,
            input: atmBody.input
          },
          { bank }
        );
        log(`trace=${trace || "-"} channel=atm`);
        return json(res, 200, reply2);
      }
      if (req.method !== "POST") return json(res, 405, { error: "POST attendu" });
      if (url.pathname !== "/" && !url.pathname.startsWith("/middleware/") && url.pathname !== "/channel/ivr") {
        return json(res, 404, { error: "Route inconnue" });
      }
      let payload;
      try {
        payload = await readJson(req);
      } catch (error) {
        const message2 = error instanceof Error ? error.message : String(error);
        return json(res, message2 === "TOO_LARGE" ? 413 : 400, { error: message2 === "TOO_LARGE" ? "Corps trop volumineux" : "JSON invalide" });
      }
      const hasLanguageKey = Object.prototype.hasOwnProperty.call(payload, "language");
      if (isUiTranslation(payload) && (!hasLanguageKey || payload.language !== null && !isSafinumLanguage(payload.language) || typeof payload.strings !== "object" || payload.strings === null || Array.isArray(payload.strings))) {
        return json(res, 400, { error: "INVALID_RESPONSE" });
      }
      const pathChannel = url.pathname.startsWith("/middleware/") ? url.pathname.split("/")[2] : void 0;
      if (pathChannel !== void 0 && !KNOWN_CHANNELS.has(pathChannel) || typeof payload.channel === "string" && !KNOWN_CHANNELS.has(payload.channel)) {
        return json(res, 404, { error: "Canal inconnu" });
      }
      if (pathChannel !== void 0 && typeof payload.channel === "string" && payload.channel !== pathChannel) {
        return json(res, 404, { error: "CANAL_CONTRADICTOIRE" });
      }
      const requestChannel = pathChannel ?? payload.channel ?? (url.pathname === "/channel/ivr" ? "ivr" : void 0);
      const traceId = traceFrom(req.headers["x-trace-id"], payload.trace_id);
      const turn = {
        ...payload,
        ...traceId === void 0 ? {} : { trace_id: traceId },
        ...requestChannel ? { channel: payload.channel ?? requestChannel } : {}
      };
      if (requestChannel !== void 0 && V2_CHANNELS.has(requestChannel) && url.pathname !== "/channel/ivr") {
        const v2Trace = traceFrom(req.headers["x-trace-id"], payload.trace_id) ?? "";
        const v2Bank = new SafinumBank({ baseUrl: options.bankUrl, teamKey: options.teamKey, traceId: v2Trace });
        if (requestChannel === "sms") {
          const sms = await handleSms(turn, { bank: v2Bank, sessions: smsSessions });
          log(`trace=${v2Trace || "-"} channel=sms segments=${sms.sms.segments} ${sms.sms.encoding}`);
          return json(res, 200, sms);
        }
        if (requestChannel === "ivr") {
          const reply2 = await handleIvr(
            {
              call_id: payload.session_id,
              session_id: payload.session_id,
              phone: payload.phone,
              language: payload.language ?? null,
              input: payload.input
            },
            { bank: v2Bank, sessions: ivrSessions }
          );
          log(`trace=${v2Trace || "-"} channel=ivr`);
          return json(res, 200, {
            ...reply2,
            response: { text: reply2.say, end_session: reply2.end, options: [] },
            interpretation: { intent: "UNKNOWN", parameters: {}, language: reply2.language },
            transaction: {
              id: reply2.state.pending_id ?? null,
              status: reply2.state.pending_id === void 0 ? "none" : "pending"
            }
          });
        }
        if (payload.strings !== void 0 && payload.strings !== null) {
          const reply2 = handleUi(turn);
          log(
            `trace=${v2Trace || "-"} channel=atm screen=${payload.screen ?? "-"} strings=${Object.keys(payload.strings).length} language=${reply2.language}`
          );
          return json(res, 200, { screen: payload.screen, ...reply2 });
        }
        const atm = await handleAtm(
          {
            session_id: payload.session_id,
            language: payload.language ?? null,
            input: payload.input
          },
          { bank: v2Bank }
        );
        log(`trace=${v2Trace || "-"} channel=atm`);
        return json(res, 200, {
          ...atm,
          response: { text: atm.screen, end_session: atm.end, options: [] },
          interpretation: { intent: "UNKNOWN", parameters: {}, language: atm.language },
          transaction: { id: null, status: "none" }
        });
      }
      try {
        const handled = await gateway.handleWithMeta(turn);
        const elapsed = Date.now() - started;
        log(
          [
            `trace=${handled.traceId || "-"}`,
            `channel=${handled.channel}`,
            `intent=${"interpretation" in handled.reply ? handled.reply.interpretation.intent : "UI_TRANSLATION"}`,
            `ms=${elapsed}`
          ].join(" ")
        );
        return json(res, 200, handled.reply);
      } catch (error) {
        const message2 = error instanceof Error ? error.message : String(error);
        log(`ERREUR trace=${turn.trace_id ?? "-"} ${message2}`);
        return json(res, 500, { error: message2 });
      }
    })();
  });
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("TOO_LARGE"));
        req.destroy();
        return;
      }
      raw += chunk.toString("utf8");
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("JSON invalide"));
      }
    });
    req.on("error", reject);
  });
}
function traceFrom(header, body) {
  const fromHeader = (Array.isArray(header) ? header[0] : header)?.trim();
  if (fromHeader) return fromHeader;
  const fromBody = body?.trim();
  return fromBody ? fromBody : void 0;
}
function isLoopback(req) {
  const address = req.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
async function startMiddleware(port = Number(process.env.PORT ?? 8080), host = process.env.HOST ?? "127.0.0.1") {
  const { server } = { server: createMiddlewareServer(defaultOptions()) };
  await new Promise((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  return {
    url: `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}
function defaultOptions() {
  const bankUrl = process.env.SAFINUM_BANK_URL || "https://safinum.cm/api/v1";
  return {
    teamKey: process.env.SAFINUM_TEAM_KEY ?? "",
    bankUrl,
    statusMode: statusModeFrom(process.env.SAFINUM_STATUS),
    localChannels: process.env.ENABLE_V2_CHANNELS === "1"
  };
}
if (process.argv[1] && fileURLToPath5(import.meta.url) === process.argv[1]) {
  loadEnv();
  const words2 = applyWordDb();
  if (!words2.ok) {
    console.warn(`ATTENTION : base de mots ignor\xE9e (${words2.problems.length} probleme(s)) :`);
    for (const problem of words2.problems) console.warn(`  - ${problem}`);
    console.warn("  Corrigez data/langues.json (pnpm --filter @nkap/gateway lang verifier), puis redemarrez.");
  } else if (words2.report !== null && words2.report.languages.length > 0) {
    console.log(`Base de mots : ${words2.report.languages.join(", ")} (${words2.report.cues} indice(s)) depuis ${words2.file}`);
  }
  void startMiddleware().then(({ url }) => {
    const options = defaultOptions();
    console.log(`Middleware NkapLingua a l'ecoute sur ${url}`);
    console.log(`Banque : ${options.bankUrl}`);
    if (!options.teamKey) {
      console.warn("ATTENTION : SAFINUM_TEAM_KEY est vide. Copiez .env.example en .env et collez votre cle sbx_...");
    }
  });
}
export {
  createMiddlewareServer,
  defaultOptions,
  startMiddleware,
  traceFrom
};
//# sourceMappingURL=server.js.map
