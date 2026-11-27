/**
 * Moteur conversationnel commun à l'USSD, au SMS et à l'IVR (DTMF).
 *
 * Fonction pure du point de vue du canal : (session, saisie) -> (écran, intention, transaction).
 * Le rendu (langue, GSM-7, longueur) est fait après, par le canal.
 *
 * Règles du jury tenues ici :
 *  - une opération est créée dans un tour et confirmée dans un tour SUIVANT ;
 *  - un montant ou un bénéficiaire n'est jamais deviné (CLARIFICATION_NEEDED) ;
 *  - après création, les montants affichés viennent de la banque, pas de notre session.
 */

import type { Intent, Language, TxStatus } from '@nkap/lingua-core';
import type { BankFailure, BankPort, Beneficiary, CallContext, Transaction } from '../bank/client.ts';
import { keyed, line, literal, money, screen, type Option, type Screen } from '../i18n/render.ts';
import { freshSession, type Session } from '../session/store.ts';
import { LANGUAGE_NAMES, detectLanguageSwitch, detectTerm, parseAmount, parsePhone, type Lexicon, type TermId } from '../understand.ts';

export const MAX_AMOUNT = 500_000;

export const BILLERS: readonly { readonly code: string; readonly name: string }[] = [
  { code: 'ENEO', name: 'ENEO' },
  { code: 'CAMWATER', name: 'CAMWATER' },
  { code: 'CANAL', name: 'Canal+' },
  { code: 'CAMTEL', name: 'CAMTEL' },
];

export interface EngineDeps {
  readonly bank: BankPort;
  readonly lexicon: Lexicon;
  /** Langues proposées dans le menu Langue (celles qui ont réellement un catalogue). */
  readonly servedLanguages: () => readonly Language[];
}

export interface TurnInput {
  readonly phone: string;
  readonly text: string;
  readonly ctx: CallContext;
}

type Params = Record<string, string | number | boolean | null>;

export interface Outcome {
  readonly screen: Screen;
  readonly intent: Intent;
  readonly params: Params;
  readonly end: boolean;
  readonly tx: { readonly id: string | null; readonly status: TxStatus };
  readonly session: Session;
}

const NO_TX = { id: null, status: 'none' } as const;

const MENU: readonly Option[] = [
  keyed(1, 'menu.balance'),
  keyed(2, 'menu.transfer'),
  keyed(3, 'menu.airtime'),
  keyed(4, 'menu.bill'),
  keyed(5, 'menu.fees'),
  keyed(6, 'menu.history'),
  keyed(7, 'menu.language'),
  keyed(8, 'menu.help'),
];

const RECAP_OPTIONS: readonly Option[] = [keyed(1, 'opt.confirm'), keyed(2, 'opt.edit'), keyed(0, 'opt.cancel')];

function out(session: Session, s: Screen, intent: Intent, extra: Partial<Pick<Outcome, 'params' | 'end' | 'tx'>> = {}): Outcome {
  const end = extra.end ?? false;
  return { screen: s, intent, params: extra.params ?? {}, end, tx: extra.tx ?? NO_TX, session: end ? session : { ...session, screen: s } };
}

function menu(session: Session, prefix: readonly ReturnType<typeof line>[] = []): Outcome {
  const next: Session = { ...session, step: 'menu', to: null, toName: null, candidates: [], biller: null, kind: null };
  return out(next, screen([...prefix, line('menu.title')], MENU), prefix.length > 0 ? 'CLARIFICATION_NEEDED' : 'UNKNOWN');
}

function ask(session: Session, step: Session['step'], key: string, options: readonly Option[] = [], prefix: readonly ReturnType<typeof line>[] = []): Outcome {
  return out({ ...session, step }, screen([...prefix, line(key)], options), 'CLARIFICATION_NEEDED');
}

function errorLine(code: string): ReturnType<typeof line> {
  switch (code) {
    case 'INSUFFICIENT_FUNDS':
    case 'UNKNOWN_BENEFICIARY':
    case 'INVALID_AMOUNT':
    case 'UNKNOWN_BILLER':
    case 'UNKNOWN_ACCOUNT':
    case 'TX_NOT_PENDING':
    case 'TX_NOT_FOUND':
    case 'UNREACHABLE':
      return line(`error.${code}`);
    case 'LIMIT_EXCEEDED':
      return line('error.LIMIT_EXCEEDED', { max: money(MAX_AMOUNT) });
    default:
      return line('error.GENERIC');
  }
}

function failed(session: Session, failure: BankFailure, intent: Intent): Outcome {
  return out(session, screen([errorLine(failure.code)]), intent, {
    end: true,
    params: { error: failure.code },
    tx: session.txId === null ? NO_TX : { id: session.txId, status: 'failed' },
  });
}

function local(phone: string): string {
  return phone.replace(/^237/, '');
}

function recap(session: Session, tx: Transaction, intent: Intent): Outcome {
  const amount = money(tx.amount);
  const fee = money(tx.fee);
  const total = money(tx.total ?? tx.amount + tx.fee);
  // Le nom vient de la banque quand elle le connaît (saisie par numéro).
  const toName = tx.to_name ?? session.toName;
  const next: Session = { ...session, step: 'confirm', txId: tx.id, toName };
  let first: ReturnType<typeof line>;
  const params: Params = { amount: tx.amount, fee: tx.fee, total: tx.total ?? tx.amount + tx.fee, currency: 'XAF' };
  switch (session.kind) {
    case 'airtime':
      first = line('recap.airtime', { operator: tx.operator ?? '', amount, phone: local(tx.to ?? session.to ?? ''), fee, total });
      params.to = tx.to ?? session.to;
      params.operator = tx.operator ?? null;
      break;
    case 'bill':
      first = line('recap.bill', { biller: session.biller ?? tx.biller ?? '', amount, fee, total });
      params.biller = session.biller ?? tx.biller ?? null;
      break;
    default:
      first = line('recap.transfer', { amount, name: toName ?? local(tx.to ?? ''), fee, total });
      params.beneficiary = toName ?? null;
      params.to = tx.to ?? session.to;
  }
  return out(next, screen([first], RECAP_OPTIONS), intent, { params, tx: { id: tx.id, status: 'pending' } });
}

function done(session: Session, tx: Transaction): Outcome {
  const amount = money(tx.amount);
  const ref = tx.id;
  let s: Screen;
  switch (session.kind) {
    case 'airtime':
      s = screen([line('done.airtime', { amount, phone: local(tx.to ?? session.to ?? ''), ref })]);
      break;
    case 'bill':
      s = screen([line('done.bill', { biller: session.biller ?? '', amount, ref })]);
      break;
    default:
      s = screen([line('done.transfer', { amount, name: session.toName ?? local(tx.to ?? ''), ref })]);
  }
  return out(session, s, 'CONFIRM', { end: true, params: { transaction_id: tx.id }, tx: { id: tx.id, status: 'confirmed' } });
}

async function cancelPending(session: Session, input: TurnInput, deps: EngineDeps): Promise<Outcome> {
  if (session.txId === null) return out(session, screen([line('goodbye')]), 'CANCEL', { end: true });
  const result = await deps.bank.cancel(session.txId, input.ctx);
  if (!result.ok && result.code !== 'TX_NOT_PENDING') return failed(session, result, 'CANCEL');
  return out(session, screen([line('done.cancel')]), 'CANCEL', {
    end: true,
    params: { transaction_id: session.txId },
    tx: { id: session.txId, status: result.ok ? 'cancelled' : 'failed' },
  });
}

async function create(session: Session, amount: number, input: TurnInput, deps: EngineDeps, retryStep: Session['step'], intent: Intent): Promise<Outcome> {
  const body =
    session.kind === 'bill'
      ? ({ type: 'bill', from: input.phone, biller: session.biller ?? '', amount } as const)
      : ({ type: session.kind === 'airtime' ? 'airtime' : 'transfer', from: input.phone, to: session.to ?? '', amount } as const);
  const result = await deps.bank.create(body, input.ctx);
  if (result.ok) return recap(session, result.data, intent);
  // Une issue plutôt qu'un cul-de-sac : solde ou plafond -> on redemande un montant.
  if (['INSUFFICIENT_FUNDS', 'LIMIT_EXCEEDED', 'INVALID_AMOUNT'].includes(result.code)) {
    return { ...ask(session, retryStep, 'ask.amount', [], [errorLine(result.code)]), intent, params: { error: result.code } };
  }
  return failed(session, result, intent);
}

function pickList(candidates: readonly Beneficiary[]): Option[] {
  return candidates.slice(0, 5).map((c, i) => literal(i + 1, `${c.name} (${local(c.phone).slice(-3)})`));
}

async function resolveBeneficiary(session: Session, query: string, amount: number | null, input: TurnInput, deps: EngineDeps): Promise<Outcome> {
  const phone = parsePhone(query);
  if (phone !== null) return withBeneficiary({ ...session, to: phone, toName: local(phone) }, amount, input, deps);

  const result = await deps.bank.beneficiaries(query, input.phone, input.ctx);
  const list = result.ok ? result.data : result.candidates;
  if (!result.ok && result.code !== 'UNKNOWN_BENEFICIARY' && list.length === 0) return failed(session, result, 'TRANSFER');
  if (list.length === 0) return ask(session, 'transfer.to', 'ask.beneficiary', [], [line('error.UNKNOWN_BENEFICIARY')]);
  const only = list[0];
  if (list.length === 1 && only !== undefined) return withBeneficiary({ ...session, to: only.phone, toName: only.name }, amount, input, deps);
  // Homonymes : on ne choisit JAMAIS à la place de la personne.
  const candidates = list.slice(0, 5).map((c) => ({ name: c.name, phone: c.phone }));
  return {
    ...ask({ ...session, candidates }, 'transfer.pick', 'choose.beneficiary', pickList(candidates)),
    params: { candidates: candidates.length, pending_amount: amount },
  };
}

async function withBeneficiary(session: Session, amount: number | null, input: TurnInput, deps: EngineDeps): Promise<Outcome> {
  if (amount === null) return ask(session, 'transfer.amount', 'ask.amount');
  return create(session, amount, input, deps, 'transfer.amount', 'TRANSFER');
}

function explain(session: Session, term: TermId): Outcome {
  const s = term === 'limit' ? screen([line('term.limit', { max: money(MAX_AMOUNT) })]) : screen([line(`term.${term}`)]);
  return out(session, s, 'TERM_EXPLANATION', { end: true, params: { term } });
}

async function fromMenu(session: Session, intent: Intent, text: string, input: TurnInput, deps: EngineDeps): Promise<Outcome> {
  const amount = parseAmount(text);
  switch (intent) {
    case 'BALANCE_INQUIRY': {
      const result = await deps.bank.account(input.phone, input.ctx);
      if (!result.ok) return failed(session, result, 'BALANCE_INQUIRY');
      return out(session, screen([line('balance.result', { amount: money(result.data.balance) })]), 'BALANCE_INQUIRY', {
        end: true,
        params: { currency: result.data.currency },
      });
    }
    case 'TRANSFER': {
      const next: Session = { ...session, kind: 'transfer' };
      const query = deps.lexicon.leftover(text);
      if (query !== '' || parsePhone(text) !== null) return resolveBeneficiary(next, parsePhone(text) ?? query, amount, input, deps);
      return ask(next, 'transfer.to', 'ask.beneficiary');
    }
    case 'AIRTIME_PURCHASE':
      return ask({ ...session, kind: 'airtime' }, 'airtime.target', 'choose.airtime', [keyed(1, 'opt.my_number'), keyed(2, 'opt.other_number')]);
    case 'BILL_PAYMENT':
      return ask({ ...session, kind: 'bill' }, 'bill.biller', 'choose.bill', BILLERS.map((b, i) => literal(i + 1, b.name)));
    case 'FEE_INQUIRY':
      if (amount !== null) return fees(session, amount, input, deps);
      return ask(session, 'fees.amount', 'ask.amount');
    case 'TRANSACTION_HISTORY':
      return history(session, input, deps);
    case 'LANGUAGE_SWITCH':
      return ask(session, 'language', 'language.choose', languageOptions(deps));
    case 'TERM_EXPLANATION': {
      const term = detectTerm(text);
      if (term !== null) return explain(session, term);
      return ask(session, 'help', 'help.choose', [keyed(1, 'term.fee.label'), keyed(2, 'term.limit.label'), keyed(3, 'term.beneficiary.label')]);
    }
    default:
      return menu(session, [line('invalid.choice')]);
  }
}

async function fees(session: Session, amount: number, input: TurnInput, deps: EngineDeps): Promise<Outcome> {
  const result = await deps.bank.fees('transfer', amount, input.ctx);
  if (!result.ok) return failed(session, result, 'FEE_INQUIRY');
  const q = result.data;
  return out(session, screen([line('fees.result', { amount: money(q.amount), fee: money(q.fee), total: money(q.total) })]), 'FEE_INQUIRY', {
    end: true,
    params: { amount: q.amount, fee: q.fee, total: q.total, currency: 'XAF' },
  });
}

async function history(session: Session, input: TurnInput, deps: EngineDeps): Promise<Outcome> {
  const result = await deps.bank.history(input.phone, 3, input.ctx);
  if (!result.ok) return failed(session, result, 'TRANSACTION_HISTORY');
  if (result.data.length === 0) return out(session, screen([line('history.empty')]), 'TRANSACTION_HISTORY', { end: true });
  const rows = result.data.slice(0, 3).map((entry, i) => {
    const sign = entry.direction === 'in' || entry.direction === 'credit' ? '+' : '-';
    const label = (entry.label ?? entry.counterparty ?? entry.name ?? entry.type ?? '').slice(0, 18);
    return literal(i + 1, `${sign}${money(entry.amount)} ${label}`.trim());
  });
  return out(session, screen([line('history.title')], rows), 'TRANSACTION_HISTORY', { end: true, params: { count: rows.length } });
}

function languageOptions(deps: EngineDeps): Option[] {
  return deps.servedLanguages().map((lang, i) => literal(i + 1, LANGUAGE_NAMES[lang].native));
}

const MENU_DIGITS: Readonly<Record<string, Intent>> = {
  '1': 'BALANCE_INQUIRY',
  '2': 'TRANSFER',
  '3': 'AIRTIME_PURCHASE',
  '4': 'BILL_PAYMENT',
  '5': 'FEE_INQUIRY',
  '6': 'TRANSACTION_HISTORY',
  '7': 'LANGUAGE_SWITCH',
  '8': 'TERM_EXPLANATION',
};

export async function converse(previous: Session | null, input: TurnInput, deps: EngineDeps): Promise<Outcome> {
  const session = previous ?? freshSession();
  const text = input.text.trim();

  // Premier tour (code composé, texte vide) : menu, ou reprise d'une opération en attente.
  // Un premier SMS « solde » n'est pas vide : il est compris directement.
  if (text === '') {
    if (session.step === 'confirm' && session.screen !== null) return out(session, session.screen as Screen, 'CLARIFICATION_NEEDED', { tx: { id: session.txId, status: 'pending' } });
    return menu(session);
  }

  // Changement de langue à n'importe quelle étape : on rejoue l'écran courant, rien n'est perdu.
  const switched = detectLanguageSwitch(text);
  if (switched !== null && !/^\d+$/.test(text)) {
    const next: Session = { ...session, chosenLang: switched };
    const replay = (session.screen as Screen | null) ?? screen([line('menu.title')], MENU);
    return {
      ...out(next, screen([line('language.done'), ...replay.lines], replay.options), 'LANGUAGE_SWITCH', {
        params: { language: switched },
        tx: session.txId === null ? NO_TX : { id: session.txId, status: 'pending' },
      }),
      session: { ...next, screen: replay },
    };
  }

  // Annulation universelle : « 0 », ou « annuler » sans montant (« non, plutôt 3000 » est une correction).
  const free = deps.lexicon.intent(text);
  const carriesAmount = parseAmount(text) !== null && !/^\d$/.test(text);
  if (text === '0' || (free?.intent === 'CANCEL' && session.step !== 'menu' && !carriesAmount)) return cancelPending(session, input, deps);

  switch (session.step) {
    case 'menu': {
      const digit = MENU_DIGITS[text];
      // Un chiffre de menu n'est pas un montant : on ne passe pas la saisie au moteur de phrases.
      if (digit !== undefined) return fromMenu(session, digit, '', input, deps);
      return fromMenu(session, free?.intent ?? 'UNKNOWN', text, input, deps);
    }

    case 'transfer.to':
      return resolveBeneficiary(session, parsePhone(text) ?? text, null, input, deps);

    case 'transfer.pick': {
      const chosen = session.candidates[Number(text) - 1];
      if (!/^\d$/.test(text) || chosen === undefined) {
        return ask(session, 'transfer.pick', 'choose.beneficiary', pickList(session.candidates), [line('invalid.choice')]);
      }
      return withBeneficiary({ ...session, to: chosen.phone, toName: chosen.name, candidates: [] }, null, input, deps);
    }

    case 'transfer.amount':
    case 'airtime.amount':
    case 'bill.amount': {
      const amount = parseAmount(text);
      if (amount === null) return ask(session, session.step, 'ask.amount', [], [line('invalid.amount')]);
      const intent: Intent = session.kind === 'airtime' ? 'AIRTIME_PURCHASE' : session.kind === 'bill' ? 'BILL_PAYMENT' : 'TRANSFER';
      return create(session, amount, input, deps, session.step, intent);
    }

    case 'airtime.target':
      if (text === '1') return ask({ ...session, to: input.phone, toName: local(input.phone) }, 'airtime.amount', 'ask.amount');
      if (text === '2') return ask(session, 'airtime.phone', 'ask.phone');
      return ask(session, 'airtime.target', 'choose.airtime', [keyed(1, 'opt.my_number'), keyed(2, 'opt.other_number')], [line('invalid.choice')]);

    case 'airtime.phone': {
      const phone = parsePhone(text);
      if (phone === null) return ask(session, 'airtime.phone', 'ask.phone', [], [line('invalid.phone')]);
      return ask({ ...session, to: phone, toName: local(phone) }, 'airtime.amount', 'ask.amount');
    }

    case 'bill.biller': {
      const biller = BILLERS[Number(text) - 1];
      if (!/^\d$/.test(text) || biller === undefined) {
        return ask(session, 'bill.biller', 'choose.bill', BILLERS.map((b, i) => literal(i + 1, b.name)), [line('invalid.choice')]);
      }
      return ask({ ...session, biller: biller.code }, 'bill.amount', 'ask.amount');
    }

    case 'fees.amount': {
      const amount = parseAmount(text);
      if (amount === null) return ask(session, 'fees.amount', 'ask.amount', [], [line('invalid.amount')]);
      return fees(session, amount, input, deps);
    }

    case 'confirm': {
      if (session.txId === null) return menu(session);
      if (text === '1' || free?.intent === 'CONFIRM') {
        const result = await deps.bank.confirm(session.txId, input.ctx);
        if (!result.ok) return failed(session, result, 'CONFIRM');
        return done(session, result.data);
      }
      if (text === '2') return { ...ask(session, 'edit.amount', 'ask.amount'), intent: 'CORRECTION' };
      // « non, plutôt 3000 » : correction directe du montant.
      const amount = parseAmount(text);
      if (amount !== null && amount > 9) return correct(session, amount, input, deps);
      return {
        ...out(session, screen([line('confirm.prompt')], RECAP_OPTIONS), 'CLARIFICATION_NEEDED'),
        tx: { id: session.txId, status: 'pending' },
      };
    }

    case 'edit.amount': {
      const amount = parseAmount(text);
      if (amount === null) return { ...ask(session, 'edit.amount', 'ask.amount', [], [line('invalid.amount')]), intent: 'CORRECTION' };
      return correct(session, amount, input, deps);
    }

    case 'language': {
      const chosen = deps.servedLanguages()[Number(text) - 1];
      if (!/^\d+$/.test(text) || chosen === undefined) return ask(session, 'language', 'language.choose', languageOptions(deps), [line('invalid.choice')]);
      const next: Session = { ...session, chosenLang: chosen };
      return { ...menu(next, [line('language.done')]), intent: 'LANGUAGE_SWITCH', params: { language: chosen } };
    }

    case 'help': {
      const term: TermId | null = text === '1' ? 'fee' : text === '2' ? 'limit' : text === '3' ? 'beneficiary' : detectTerm(text);
      if (term === null) return ask(session, 'help', 'help.choose', [keyed(1, 'term.fee.label'), keyed(2, 'term.limit.label'), keyed(3, 'term.beneficiary.label')], [line('invalid.choice')]);
      return explain(session, term);
    }
  }
}

async function correct(session: Session, amount: number, input: TurnInput, deps: EngineDeps): Promise<Outcome> {
  if (session.txId === null) return menu(session);
  const result = await deps.bank.update(session.txId, { amount }, input.ctx);
  if (result.ok) return recap(session, result.data, 'CORRECTION');
  if (['INSUFFICIENT_FUNDS', 'LIMIT_EXCEEDED', 'INVALID_AMOUNT'].includes(result.code)) {
    return { ...ask(session, 'edit.amount', 'ask.amount', [], [errorLine(result.code)]), intent: 'CORRECTION', tx: { id: session.txId, status: 'pending' } };
  }
  return failed(session, result, 'CORRECTION');
}
