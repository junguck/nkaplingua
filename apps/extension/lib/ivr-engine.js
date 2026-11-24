// Moteur IVR (simulation). Pur : pas de DOM, pas de chrome.* -> testable avec node.
// press(key) renvoie { say: [{key, params}], effects: [...] }.
// Règles : <= 3 choix par menu ; jamais de frais ni de code opérateur prononcé ;
// aucun vrai argent, aucun vrai PIN (le prototype ne touche pas aux fonds).
import { fmtAmount, spokenAmount, fmtPhone, digitsSpoken, fmtDate } from './fr.js';

export const DEFAULT_LEDGER = () => ({
  balance: 50000,
  contacts: [
    { name: 'Maman (Mbalmayo)', phone: '690000001' },
    { name: 'Boutique du marché (Ngaoundéré)', phone: '690000002' },
    { name: 'Frère Paul (Meiganga)', phone: '690000003' },
  ],
  tontine: { name: 'Tontine du marché', share: 5000, members: ['Mariama', 'Adèle', 'Fanta', 'Ngono'], turn: 0, nextDate: null },
  loans: [],
  history: [],
});

const MAX_CREDIT = 50000;
const OFFERED = (s) => s.langs;

export function createEngine({ ledger, settings, langNames, now = () => Date.now(), rand = Math.random }) {
  const s = { node: 'lang', buf: '', ctx: {}, lang: settings.lang ?? 'fr-facile', langs: settings.offeredLangs, readyMap: {} };
  const ref = () => 'NK' + String(Math.floor(rand() * 1e6)).padStart(6, '0');
  const code6 = () => String(Math.floor(rand() * 1e6)).padStart(6, '0');
  const day = (n) => new Date(now() + n * 864e5).toISOString();
  const fast = () => !!settings.demoFast;

  const S = (key, params = {}) => ({ key, params });
  const menu = (keys) => [...keys.map((k) => S(k)), S('ivr.repeat_hint')];
  const go = (node, extra = {}) => { s.node = node; s.buf = ''; Object.assign(s.ctx, extra); return enter(); };

  const nameFor = (phone) => ledger.contacts.find((c) => c.phone === phone)?.name ?? 'ce numéro';
  const params = () => ({
    AMOUNT: s.ctx.amount, NAME: s.ctx.name, PHONE: s.ctx.phone, REF: s.ctx.ref, CODE: s.ctx.code, DATE: s.ctx.date,
  });

  // --- noeuds : enter() = ce qu'on dit en arrivant ; handlers : touche -> résultat
  const nodes = {
    lang: {
      parent: null,
      enter: () => [S('ivr.welcome'), ...OFFERED(s).map((c, i) => S('ivr.lang_menu_item', { LANG: langNames[c] ?? c, DIGIT: i + 1 })), S('ivr.repeat_hint')],
      key: (k) => {
        const i = Number(k) - 1;
        if (OFFERED(s)[i]) { s.lang = OFFERED(s)[i]; const say = s.lang !== 'fr-facile' && !s.readyMap[s.lang] ? [S('ivr.lang_fallback')] : []; return { say, then: 'main', effects: [{ type: 'lang', lang: s.lang }] }; }
      },
    },
    main: {
      parent: null,
      enter: () => menu(['ivr.main_1', 'ivr.main_2', 'ivr.main_3', 'ivr.main_9']),
      key: (k) => ({ 1: { then: 'money' }, 2: { then: 'save' }, 3: { then: 'bill' }, 9: { then: 'lang' } })[k],
    },
    money: { parent: 'main', enter: () => menu(['ivr.money_1', 'ivr.money_2', 'ivr.money_3']), key: (k) => ({ 1: { then: 'send_phone' }, 2: { then: 'wd_amount' }, 3: { then: 'balance' } })[k] },
    balance: { parent: 'money', enter: () => [S('ph.balance_is', { AMOUNT: ledger.balance }), S('ivr.pin_never'), S('ivr.repeat_hint')], key: () => ({ then: 'main' }) },

    send_phone: { parent: 'money', input: true, enter: () => [S('ivr.ask_phone')], submit: (v) => {
      if (!/^6\d{8}$/.test(v)) return { say: [S('ivr.invalid')], then: 'send_phone' };
      return { then: 'send_amount', ctx: { phone: v, name: nameFor(v) } };
    } },
    send_amount: { parent: 'money', input: true, enter: () => [S('ivr.ask_amount')], submit: (v) => {
      const a = parseInt(v, 10);
      if (!a) return { say: [S('ivr.invalid')], then: 'send_amount' };
      if (a > ledger.balance) return { say: [S('ivr.insufficient')], then: 'main' };
      return { then: 'send_confirm', ctx: { amount: a } };
    } },
    send_confirm: { parent: 'money', enter: () => [S('ivr.confirm_send', params())], key: (k) => {
      if (k === '1') {
        ledger.balance -= s.ctx.amount; s.ctx.ref = ref();
        ledger.history.unshift({ t: now(), kind: 'send', amount: s.ctx.amount, to: s.ctx.name, ref: s.ctx.ref });
        return { say: [S('ivr.send_ok', params()), S('ivr.pin_never')], then: 'main', effects: [
          { type: 'notify', titleKey: 'ivr.notif_sent_title', bodyKey: 'ivr.send_ok', params: params(), route: '#money' },
          { type: 'save-ledger' }] };
      }
      if (k === '2') return { say: [S('ivr.send_cancel', params())], then: 'main' };
    } },

    wd_amount: { parent: 'money', input: true, enter: () => [S('ivr.ask_amount')], submit: (v) => {
      const a = parseInt(v, 10);
      if (!a) return { say: [S('ivr.invalid')], then: 'wd_amount' };
      if (a > ledger.balance) return { say: [S('ivr.insufficient')], then: 'main' };
      return { then: 'wd_confirm', ctx: { amount: a } };
    } },
    wd_confirm: { parent: 'money', enter: () => [S('ivr.withdraw_confirm', params())], key: (k) => {
      if (k === '1') {
        s.ctx.code = code6(); s.ctx.ref = ref();
        ledger.balance -= s.ctx.amount;
        ledger.history.unshift({ t: now(), kind: 'withdraw', amount: s.ctx.amount, ref: s.ctx.ref });
        return { say: [S('ivr.withdraw_code', params()), S('ivr.pin_never')], then: 'main', effects: [
          { type: 'alarm', name: 'wd-' + s.ctx.ref, delayMin: fast() ? 1 : 10, route: '#money', titleKey: 'ivr.notif_tip_title', bodyKey: 'ivr.withdraw_expired', params: {} },
          { type: 'save-ledger' }] };
      }
      if (k === '2') return { say: [S('ivr.send_cancel')], then: 'main' };
    } },

    save: { parent: 'main', enter: () => menu(['ivr.save_1', 'ivr.save_2']), key: (k) => ({ 1: { then: 'tontine' }, 2: { then: 'credit_intro' } })[k] },
    tontine: { parent: 'save', enter: () => menu(['ivr.tontine_1', 'ivr.tontine_2', 'ivr.tontine_3']), key: (k) => {
      const t = ledger.tontine;
      if (k === '1') {
        if (t.share > ledger.balance) return { say: [S('ivr.insufficient')], then: 'main' };
        ledger.balance -= t.share;
        ledger.history.unshift({ t: now(), kind: 'tontine', amount: t.share, to: t.name });
        return { say: [S('ivr.tontine_paid', { AMOUNT: t.share, NAME: t.name })], then: 'tontine', effects: [{ type: 'save-ledger' }] };
      }
      if (k === '2') {
        t.nextDate ??= day(7);
        return { say: [S('ivr.tontine_next', { NAME: t.members[t.turn % t.members.length], DATE: t.nextDate })], then: 'tontine', effects: [{ type: 'save-ledger' }] };
      }
      if (k === '3') return { say: [S('ivr.tontine_reminder_set')], then: 'tontine', effects: [
        { type: 'alarm', name: 'tontine', delayMin: fast() ? 1 : 6 * 1440, route: '#save', titleKey: 'ivr.tontine_reminder', bodyKey: 'ivr.tontine_reminder', params: { AMOUNT: t.share } }] };
    } },
    credit_intro: { parent: 'save', input: true, enter: () => [S('ivr.credit_intro'), S('ivr.ask_amount')], submit: (v) => {
      const a = parseInt(v, 10);
      if (!a) return { say: [S('ivr.invalid')], then: 'credit_intro' };
      if (a > MAX_CREDIT) return { say: [S('ivr.credit_too_big')], then: 'credit_intro' };
      return { then: 'credit_confirm', ctx: { amount: a, date: day(30) } };
    } },
    credit_confirm: { parent: 'save', enter: () => [S('ivr.credit_confirm', params())], key: (k) => {
      if (k === '1') {
        ledger.balance += s.ctx.amount;
        ledger.loans.push({ amount: s.ctx.amount, due: s.ctx.date });
        ledger.history.unshift({ t: now(), kind: 'credit', amount: s.ctx.amount });
        return { say: [S('ivr.credit_ok', params())], then: 'main', effects: [
          { type: 'alarm', name: 'credit-' + now(), delayMin: fast() ? 2 : 29 * 1440, route: '#save', titleKey: 'ivr.credit_reminder', bodyKey: 'ivr.credit_reminder', params: { AMOUNT: s.ctx.amount, DATE: s.ctx.date } },
          { type: 'save-ledger' }] };
      }
      if (k === '2') return { say: [S('ivr.send_cancel')], then: 'main' };
    } },

    bill: { parent: 'main', enter: () => menu(['ivr.bill_1', 'ivr.bill_2']), key: (k) => ({ 1: { then: 'bill_ref', ctx: { name: 'CAMWATER (eau)' } }, 2: { then: 'bill_ref', ctx: { name: 'ENEO (lumière)' } } })[k] },
    bill_ref: { parent: 'bill', input: true, enter: () => [S('ivr.bill_ask_ref')], submit: (v) => v.length < 4 ? { say: [S('ivr.invalid')], then: 'bill_ref' } : { then: 'bill_amount', ctx: { ref: v } } },
    bill_amount: { parent: 'bill', input: true, enter: () => [S('ivr.ask_amount')], submit: (v) => {
      const a = parseInt(v, 10);
      if (!a) return { say: [S('ivr.invalid')], then: 'bill_amount' };
      if (a > ledger.balance) return { say: [S('ivr.insufficient')], then: 'main' };
      return { then: 'bill_confirm', ctx: { amount: a } };
    } },
    bill_confirm: { parent: 'bill', enter: () => [S('ivr.bill_confirm', params())], key: (k) => {
      if (k === '1') {
        ledger.balance -= s.ctx.amount; const proof = ref();
        ledger.history.unshift({ t: now(), kind: 'bill', amount: s.ctx.amount, to: s.ctx.name, ref: proof });
        return { say: [S('ivr.bill_ok', { REF: proof })], then: 'main', effects: [{ type: 'save-ledger' }] };
      }
      if (k === '2') return { say: [S('ivr.send_cancel')], then: 'main' };
    } },
  };

  function enter() { return nodes[s.node].enter(); }
  function apply(res) {
    if (!res) return { say: [S('ivr.invalid')], effects: [] };
    const say = [...(res.say ?? [])];
    if (res.ctx) Object.assign(s.ctx, res.ctx);
    if (res.then) { s.node = res.then; s.buf = ''; say.push(...enter()); }
    return { say, effects: res.effects ?? [] };
  }

  return {
    state: s,
    setReady(map) { s.readyMap = map; },
    setLangs(l) { s.langs = l; },
    start() { s.node = 'lang'; s.buf = ''; s.ctx = {}; return { say: enter(), effects: [] }; },
    repeat() { return { say: enter(), effects: [] }; },
    press(k) {
      const n = nodes[s.node];
      if (k === '*') { s.buf = ''; return { say: enter(), effects: [] }; }
      if (n.input) {
        if (k === '#') {
          if (!s.buf) return n.parent ? apply({ then: n.parent }) : apply({ then: 'main' });
          const v = s.buf; s.buf = ''; return apply(n.submit(v));
        }
        if (/^\d$/.test(k)) { s.buf += k; return { say: [], effects: [], buffer: s.buf }; }
        return apply(null);
      }
      if (k === '#') return n.parent ? apply({ then: n.parent }) : { say: enter(), effects: [] };
      if (!/^\d$/.test(k)) return apply(null);
      return apply(n.key(k));
    },
    timeout() { return { say: [S('ivr.timeout')], effects: [] }; },
    format: { fmtAmount, spokenAmount, fmtPhone, digitsSpoken, fmtDate },
  };
}
