/**
 * IVR DTMF — canal local, hors sandbox.
 *
 * Un appelant n'a qu'un pavé : le dialogue est une suite de `gather` (chiffres + `#` pour valider,
 * `*` pour annuler). On réutilise les mêmes règles que l'USSD là où elles comptent :
 *   - la transaction est créée en `pending` puis confirmée dans un tour séparé, avec un `trace_id`
 *     distinct (le cycle du jury) ;
 *   - aucune devinette : un numéro ou un montant illisible fait répéter, il ne fait pas agir ;
 *   - la langue de l'appel est portée par la session et n'est plus détectée sur des chiffres.
 *
 * La réponse n'utilise pas le contrat SAFINUM (`say` + `gather` au lieu de `response`), parce que
 * ce canal n'est jamais déclaré à la passerelle : `channel` vaut `ivr` et `end` ferme l'appel.
 */

import { MAX_AMOUNT, normalizePhone, officialFee } from '@nkap/safinum';
import type { BankPort } from './bank.js';
import { displayPhone, message, money, resolveLanguage, type GatewayLanguage } from './i18n.js';
import { digitsToAmount, failureText, readDigits } from './local.js';
import { TtlStore } from './session.js';

export type IvrStep = 'menu' | 'beneficiary' | 'amount' | 'fees_amount' | 'confirm';

export interface IvrGather {
  readonly type: 'menu' | 'digits' | 'amount' | 'confirm';
  readonly digits: readonly [number, number];
  readonly terminator: '#';
  readonly cancel: '*';
  readonly timeout_ms: number;
}

export interface IvrTurn {
  readonly call_id?: string;
  readonly session_id?: string;
  readonly phone?: string;
  readonly language?: string | null;
  readonly input?: { readonly digits?: string; readonly text?: string };
}

export interface IvrState {
  step: IvrStep;
  language: GatewayLanguage;
  to?: string;
  name?: string;
  pending?: { id: string; amount: number; fee: number; total: number };
}

export interface IvrReply {
  readonly channel: 'ivr';
  readonly language: GatewayLanguage;
  readonly say: string;
  readonly gather: IvrGather | null;
  readonly state: { readonly step: IvrStep; readonly pending_id?: string };
  readonly end: boolean;
}

export interface IvrDeps {
  readonly bank: BankPort;
  readonly sessions?: TtlStore<IvrState>;
}

const TIMEOUT_MS = 8_000;

const defaultSessions = new TtlStore<IvrState>(300_000);

export async function handleIvr(turn: IvrTurn, deps: IvrDeps): Promise<IvrReply> {
  const sessions = deps.sessions ?? defaultSessions;
  const key = turn.call_id ?? turn.session_id ?? turn.phone ?? 'appel-sans-cle';
  const language = resolveLanguage(turn.language);
  const state = sessions.get(key) ?? { step: 'menu', language };
  state.language = language;

  const phone = normalizePhone(turn.phone ?? '');
  if (!phone) {
    return finish(state, message(language, 'error.UNKNOWN_ACCOUNT'));
  }

  const input = readDigits(turn);
  const reply = await advance(state, phone, input, deps);

  if (reply.end) sessions.delete(key);
  else sessions.set(key, state);
  return reply;
}

async function advance(
  state: IvrState,
  phone: string,
  input: ReturnType<typeof readDigits>,
  deps: IvrDeps,
): Promise<IvrReply> {
  const language = state.language;

  // `*` annule à toute étape : la transaction en attente est annulée côté banque, jamais laissée
  // pendante (elle bloquerait le solde disponible).
  if (input.cancel) {
    if (state.pending) await deps.bank.cancel(state.pending.id);
    state.pending = undefined;
    state.step = 'menu';
    return prompt(state, `${message(language, 'done.cancel')}\n${message(language, 'ivr.menu')}`, 'menu', [1, 1]);
  }

  if (state.step === 'menu' && input.digits === '' && !input.submitted) {
    return prompt(state, message(language, 'ivr.menu'), 'menu', [1, 1]);
  }

  switch (state.step) {
    case 'menu':
      return menu(state, phone, input.digits, deps);

    case 'beneficiary': {
      const target = normalizePhone(input.digits);
      if (!target) {
        return prompt(state, message(language, 'ivr.invalid'), 'digits', [9, 9]);
      }
      state.to = target;
      state.name = target;
      state.step = 'amount';
      return prompt(state, message(language, 'ivr.askAmount'), 'amount', [1, 6]);
    }

    case 'amount':
      return createTransfer(state, phone, input.digits, deps);

    case 'fees_amount': {
      const amount = digitsToAmount(input.digits);
      if (amount === null || amount > MAX_AMOUNT) {
        return prompt(state, message(language, 'invalid.amount'), 'amount', [1, 6]);
      }
      const quote = await deps.bank.fees('transfer', amount);
      const fee = quote.ok ? quote.data.fee : officialFee('transfer', amount) ?? 0;
      return finish(
        state,
        message(language, 'fees', {
          amount: money(amount),
          fee: money(fee),
          total: money(amount + fee),
        }),
      );
    }

    case 'confirm':
      return atConfirmation(state, input.digits, deps);

    default:
      state.step = 'menu';
      return prompt(state, message(language, 'ivr.menu'), 'menu', [1, 1]);
  }
}

async function menu(state: IvrState, phone: string, digits: string, deps: IvrDeps): Promise<IvrReply> {
  const language = state.language;

  if (digits === '0') return finish(state, message(language, 'ivr.hangup'));

  if (digits === '1') {
    const account = await deps.bank.account(phone);
    if (!account.ok) return finish(state, failureText(language, account));
    return finish(state, message(language, 'balance', { balance: money(account.data.balance) }));
  }

  if (digits === '2') {
    state.step = 'beneficiary';
    return prompt(state, message(language, 'ivr.askBeneficiary'), 'digits', [9, 9]);
  }

  if (digits === '3') {
    state.step = 'fees_amount';
    return prompt(state, message(language, 'ivr.askAmount'), 'amount', [1, 6]);
  }

  return prompt(
    state,
    `${message(language, 'ivr.invalid')}\n${message(language, 'ivr.menu')}`,
    'menu',
    [1, 1],
  );
}

async function createTransfer(state: IvrState, phone: string, digits: string, deps: IvrDeps): Promise<IvrReply> {
  const language = state.language;
  const amount = digitsToAmount(digits);
  if (amount === null) return prompt(state, message(language, 'invalid.amount'), 'amount', [1, 6]);
  if (amount > MAX_AMOUNT) {
    return prompt(state, message(language, 'invalid.limit', { max: money(MAX_AMOUNT) }), 'amount', [1, 6]);
  }

  const to = state.to ?? phone;
  const created = await deps.bank.create({ type: 'transfer', from: phone, to, amount });
  if (!created.ok) return finish(state, failureText(language, created));

  const transaction = created.data;
  const fee = transaction.fee || officialFee('transfer', amount) || 0;
  state.pending = {
    id: transaction.id,
    amount: transaction.amount || amount,
    fee,
    total: transaction.total || amount + fee,
  };
  state.step = 'confirm';

  const recap = message(language, 'confirm.transfer', {
    amount: money(state.pending.amount),
    fee: money(state.pending.fee),
    total: money(state.pending.total),
    recipient: recipient(state),
  });
  return prompt(state, `${recap}\n${message(language, 'ivr.confirmPrompt')}`, 'confirm', [1, 1]);
}

async function atConfirmation(state: IvrState, digits: string, deps: IvrDeps): Promise<IvrReply> {
  const language = state.language;
  const pending = state.pending;
  if (!pending) {
    state.step = 'menu';
    return prompt(state, message(language, 'ivr.menu'), 'menu', [1, 1]);
  }

  if (digits === '1') {
    const confirmed = await deps.bank.confirm(pending.id);
    if (!confirmed.ok) return finish(state, failureText(language, confirmed));
    const transaction = confirmed.data;
    return finish(
      state,
      message(language, 'done.transfer', {
        amount: money(transaction.amount || pending.amount),
        recipient: recipient(state),
        ref: transaction.id || pending.id,
        balance: money(transaction.balanceAfter ?? 0),
      }),
    );
  }

  if (digits === '2') {
    await deps.bank.cancel(pending.id);
    state.pending = undefined;
    return finish(state, message(language, 'done.cancel'));
  }

  return prompt(state, message(language, 'ivr.confirmPrompt'), 'confirm', [1, 1]);
}

function recipient(state: IvrState): string {
  const phone = displayPhone(state.to ?? '');
  if (!state.name || state.name === state.to) return phone;
  return `${state.name} (${phone})`;
}

function prompt(state: IvrState, say: string, type: IvrGather['type'], digits: readonly [number, number]): IvrReply {
  return {
    channel: 'ivr',
    language: state.language,
    say,
    gather: { type, digits, terminator: '#', cancel: '*', timeout_ms: TIMEOUT_MS },
    state: stateView(state),
    end: false,
  };
}

function finish(state: IvrState, say: string): IvrReply {
  return {
    channel: 'ivr',
    language: state.language,
    say,
    gather: null,
    state: stateView(state),
    end: true,
  };
}

function stateView(state: IvrState): IvrReply['state'] {
  return state.pending ? { step: state.step, pending_id: state.pending.id } : { step: state.step };
}
