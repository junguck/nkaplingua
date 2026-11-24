import {
  BILLERS,
  type BankingError,
  type Contact,
  type FinancialPort,
  type IntentName,
  type IntentSlots,
  type Interpretation,
  type OperationCard,
  type OperationDraft,
} from '@nkap/contracts';
import { formatAmount, formatShortDate } from '../text/format';
import { message, type Plan, type PlanOption, type PlanPart } from './plan';
import type { PendingOperation, Session, SlotFillingIntent } from './session';
import { capitalize, hasOperationValues, matchContacts, mergeSlots, type Correction } from './slots';

export interface DialogueDeps {
  readonly bank: FinancialPort;
  readonly newId: () => string;
}

const SLOT_FILLING: readonly IntentName[] = ['TRANSFER', 'BUY_AIRTIME', 'PAY_BILL', 'WITHDRAW', 'CHECK_FEES'];
const isSlotFilling = (i: IntentName): i is SlotFillingIntent => SLOT_FILLING.includes(i);

/** Choix proposés quand l'utilisateur donne un montant sans dire quoi en faire. */
const AMOUNT_ONLY_CANDIDATES: readonly SlotFillingIntent[] = ['TRANSFER', 'WITHDRAW', 'BUY_AIRTIME'];
type MenuIntent = 'CHECK_BALANCE' | 'TRANSFER' | 'CHECK_FEES' | 'TX_HISTORY' | 'BUY_AIRTIME' | 'PAY_BILL' | 'WITHDRAW';
const MAIN_MENU: readonly MenuIntent[] = ['CHECK_BALANCE', 'TRANSFER', 'CHECK_FEES', 'TX_HISTORY', 'BUY_AIRTIME', 'WITHDRAW'];

const YES_NO: readonly PlanOption[] = [
  { label: message('option.yes'), input: { kind: 'intent', intent: 'CONFIRM' } },
  { label: message('option.no'), input: { kind: 'intent', intent: 'CANCEL' } },
];

function plan(fields: Partial<Plan> & Pick<Plan, 'parts'>): Plan {
  return { options: [], card: null, stage: 'idle', status: 'none', endSession: false, errors: [], params: {}, ...fields };
}

function intentOption(intent: MenuIntent, slots: IntentSlots = {}): PlanOption {
  return { label: message(`intent.${intent}`), input: { kind: 'intent', intent, slots } };
}

/**
 * Machine à états du dialogue. Décide QUOI dire (clés de messages + valeurs), jamais COMMENT :
 * le rendu dans la langue et le canal se fait ensuite. Toute opération qui déplace de l'argent
 * passe par une confirmation explicite, avec frais et total calculés par le système financier.
 */
export class DialogueManager {
  constructor(private readonly deps: DialogueDeps) {}

  async step(session: Session, interp: Interpretation, contacts: readonly Contact[]): Promise<Plan> {
    const { slots, intent } = interp;

    if (intent === 'CHANGE_LANGUAGE' && slots.targetLanguage !== undefined) {
      session.lang = slots.targetLanguage;
      const follow = session.pending ? await this.advance(session, contacts, []) : this.menu();
      return { ...follow, parts: [message('lang.changed'), ...follow.parts] };
    }

    // Réponse à « que voulez-vous faire avec 5 000 FCFA ? »
    const clarification = session.clarification;
    session.clarification = null;
    if (clarification && isSlotFilling(intent)) {
      return this.start(session, intent, { ...clarification.slots, ...slots }, contacts);
    }

    switch (intent) {
      case 'CANCEL':
        return this.cancel(session);
      case 'CONFIRM':
        return this.confirm(session, contacts);
      case 'GREETING':
        return this.greet(session, contacts);
      case 'HELP':
        return this.menu();
      case 'CHECK_BALANCE':
        return this.withResume(session, contacts, await this.balance(session));
      case 'TX_HISTORY':
        return this.withResume(session, contacts, await this.history(session));
      case 'EXPLAIN_TERM':
        return slots.term !== undefined
          ? this.withResume(session, contacts, plan({ parts: [{ kind: 'term', term: slots.term }], params: { term: slots.term } }))
          : this.notUnderstood(session, contacts);
      case 'UNKNOWN':
        break;
      default:
        if (isSlotFilling(intent)) {
          return session.pending?.intent === intent
            ? this.update(session, slots, contacts)
            : this.start(session, intent, slots, contacts);
        }
    }

    // Intention inconnue : des valeurs seules complètent ou corrigent l'opération en cours…
    if (session.pending && hasOperationValues(slots)) return this.update(session, slots, contacts);
    // …ou, sans opération en cours, un montant isolé est ambigu : on demande quoi en faire.
    if (slots.amount !== undefined) {
      session.clarification = { candidates: AMOUNT_ONLY_CANDIDATES, slots };
      return plan({
        parts: [message('ask.intent', { AMOUNT: formatAmount(slots.amount.amount) })],
        options: AMOUNT_ONLY_CANDIDATES.map((i) => intentOption(i)),
        stage: 'clarifying',
        status: 'awaiting_clarification',
        params: { amount: slots.amount.amount },
      });
    }
    return this.notUnderstood(session, contacts);
  }

  // ------------------------------------------------------------------ opérations

  private start(session: Session, intent: SlotFillingIntent, slots: IntentSlots, contacts: readonly Contact[]): Promise<Plan> {
    session.pending = {
      intent,
      slots,
      recipient: null,
      quote: null,
      idempotencyKey: this.deps.newId(),
      awaitingConfirmation: false,
    };
    return this.advance(session, contacts, []);
  }

  private update(session: Session, update: IntentSlots, contacts: readonly Contact[]): Promise<Plan> {
    const pending = session.pending;
    if (!pending) return this.notUnderstood(session, contacts);
    const merged = mergeSlots(pending.slots, update, pending.recipient?.name ?? null);
    session.pending = {
      ...pending,
      slots: merged.slots,
      recipient: merged.recipientChanged ? null : pending.recipient,
      quote: null,
      awaitingConfirmation: false,
    };
    return this.advance(session, contacts, merged.corrections);
  }

  /** Fait progresser l'opération : demande ce qui manque, ou présente le récapitulatif à confirmer. */
  private async advance(session: Session, contacts: readonly Contact[], corrections: readonly Correction[]): Promise<Plan> {
    const pending = session.pending;
    if (!pending) return this.menu();
    const ask = (parts: PlanPart[], options: readonly PlanOption[] = []): Plan =>
      plan({ parts, options, stage: options.length > 0 ? 'clarifying' : 'collecting', status: options.length > 0 ? 'awaiting_clarification' : 'awaiting_input', params: paramsOf(pending) });

    let recipient = pending.recipient;
    let { slots } = pending;

    if (pending.intent === 'TRANSFER' && recipient === null) {
      if (slots.phone !== undefined) {
        const phone = slots.phone;
        recipient = contacts.find((c) => c.phone === phone) ?? { id: `ext-${phone}`, name: phone, phone };
      } else if (slots.recipientQuery !== undefined) {
        const matches = matchContacts(contacts, slots.recipientQuery);
        const query = capitalize(slots.recipientQuery);
        if (matches.length > 1) {
          return ask(
            [message('clarify.recipient', { NAME: query })],
            matches.map((c) => ({
              label: message('option.contact', { NAME: c.name, PHONE: c.phone }),
              input: { kind: 'intent', intent: 'TRANSFER', slots: { phone: c.phone } },
            })),
          );
        }
        if (matches.length === 0) return ask([message('clarify.unknownRecipient', { NAME: query })]);
        recipient = matches[0] ?? null;
      } else {
        return ask([message('ask.recipient')]);
      }
    }

    if (pending.intent === 'BUY_AIRTIME' && slots.phone === undefined) {
      const account = await this.deps.bank.getAccount(session.userId);
      if (account.ok) slots = { ...slots, phone: account.value.phone };
    }
    if (pending.intent === 'PAY_BILL') {
      if (slots.biller === undefined) {
        return ask(
          [message('ask.biller')],
          BILLERS.map((b) => ({ label: message(`biller.${b}`), input: { kind: 'intent', intent: 'PAY_BILL', slots: { biller: b } } })),
        );
      }
      if (slots.billReference === undefined) return ask([message('ask.billReference')]);
    }
    if (slots.amount === undefined) return ask([message(`ask.amount.${pending.intent}`)]);

    session.pending = { ...pending, slots, recipient };
    const current = session.pending;
    const draft = toDraft(current);

    const quoted = await this.deps.bank.quote(session.userId, draft);
    if (!quoted.ok) return this.rejectAmount(session, quoted.error);
    const quote = quoted.value;
    const amounts = { AMOUNT: formatAmount(quote.amount.amount), FEE: formatAmount(quote.fee.amount), TOTAL: formatAmount(quote.total.amount) };

    if (current.intent === 'CHECK_FEES') {
      session.pending = null;
      return plan({ parts: [message('quote.fees.full', amounts)], params: { ...paramsOf(current), fee: quote.fee.amount, total: quote.total.amount } });
    }

    const account = await this.deps.bank.getAccount(session.userId);
    if (!account.ok) return this.failure(session, account.error);
    if (account.value.balance.amount < quote.total.amount) {
      return this.rejectAmount(session, { code: 'INSUFFICIENT_FUNDS', details: { total: quote.total.amount, balance: account.value.balance.amount } });
    }

    session.pending = { ...current, quote, awaitingConfirmation: true };
    const correctionParts = corrections.map((c) => message('correction.applied', { OLD: c.from, NEW: c.to }));
    return plan({
      parts: [
        ...correctionParts,
        this.summary(current, amounts.AMOUNT),
        message('quote.fees', amounts),
        message('quote.total', amounts),
        message('confirm.irreversible'),
        message('confirm.question'),
      ],
      options: YES_NO,
      card: cardOf(current, quote.fee.amount, quote.total.amount, null, null),
      stage: 'confirming',
      status: 'awaiting_confirmation',
      params: { ...paramsOf(current), fee: quote.fee.amount, total: quote.total.amount, ...(corrections.length > 0 ? { correction: corrections.map((c) => `${c.from}→${c.to}`).join(', ') } : {}) },
    });
  }

  private summary(op: PendingOperation, amount: string): PlanPart {
    switch (op.intent) {
      case 'TRANSFER':
        return message('confirm.TRANSFER', { AMOUNT: amount, NAME: op.recipient?.name ?? '', PHONE: op.recipient?.phone ?? '' });
      case 'BUY_AIRTIME':
        return message('confirm.BUY_AIRTIME', { AMOUNT: amount, PHONE: op.slots.phone ?? '' });
      case 'PAY_BILL':
        return message('confirm.PAY_BILL', { AMOUNT: amount, NAME: op.slots.biller ?? '', REF: op.slots.billReference ?? '' });
      case 'WITHDRAW':
      case 'CHECK_FEES':
        return message('confirm.WITHDRAW', { AMOUNT: amount });
    }
  }

  private async confirm(session: Session, contacts: readonly Contact[]): Promise<Plan> {
    const pending = session.pending;
    if (!pending) return plan({ parts: [message('nothing.pending')] });
    if (!pending.awaitingConfirmation || pending.quote === null) return this.advance(session, contacts, []);

    const result = await this.deps.bank.execute(session.userId, toDraft(pending), pending.idempotencyKey);
    session.pending = null;
    if (!result.ok) return this.failure(session, result.error, pending);

    const receipt = result.value;
    const values = {
      AMOUNT: formatAmount(receipt.quote.amount.amount),
      BALANCE: formatAmount(receipt.balanceAfter.amount),
      REF: receipt.reference,
      NAME: pending.intent === 'PAY_BILL' ? (pending.slots.biller ?? '') : (pending.recipient?.name ?? ''),
      PHONE: pending.slots.phone ?? '',
      CODE: receipt.withdrawalCode ?? '',
    };
    const done: PlanPart[] =
      pending.intent === 'TRANSFER'
        ? [message('done.TRANSFER', { AMOUNT: values.AMOUNT, NAME: values.NAME })]
        : pending.intent === 'WITHDRAW'
          ? [message('done.WITHDRAW', { CODE: values.CODE }), message('safety.pin')]
          : pending.intent === 'BUY_AIRTIME'
            ? [message('done.BUY_AIRTIME', { AMOUNT: values.AMOUNT, PHONE: values.PHONE })]
            : [message('done.PAY_BILL', { AMOUNT: values.AMOUNT, NAME: values.NAME })];

    return plan({
      parts: [...done, message('done.balance', { BALANCE: values.BALANCE }), message('done.reference', { REF: values.REF })],
      card: cardOf(pending, receipt.quote.fee.amount, receipt.quote.total.amount, receipt.balanceAfter.amount, receipt.reference),
      status: 'executed',
      endSession: true,
      params: { ...paramsOf(pending), fee: receipt.quote.fee.amount, total: receipt.quote.total.amount, reference: receipt.reference },
    });
  }

  private cancel(session: Session): Plan {
    if (!session.pending) return plan({ parts: [message('nothing.pending')] });
    const params = paramsOf(session.pending);
    session.pending = null;
    return plan({ parts: [message('cancelled')], status: 'cancelled', endSession: true, params });
  }

  /** Montant refusé (solde, plafond) : on explique, on garde le reste, on redemande un montant. */
  private rejectAmount(session: Session, error: BankingError): Plan {
    const pending = session.pending;
    const parts = explainError(error);
    if (pending) {
      const { amount: _rejected, ...rest } = pending.slots;
      session.pending = { ...pending, slots: rest, quote: null, awaitingConfirmation: false };
      parts.push(message(`ask.amount.${pending.intent}`));
    }
    return plan({ parts, stage: 'collecting', status: 'rejected', errors: [error.code], params: pending ? paramsOf(pending) : {} });
  }

  private failure(session: Session, error: BankingError, op?: PendingOperation): Plan {
    session.pending = null;
    return plan({ parts: explainError(error), status: error.code === 'BACKEND_UNAVAILABLE' ? 'failed' : 'rejected', errors: [error.code], params: op ? paramsOf(op) : {} });
  }

  // ------------------------------------------------------------------ informations

  private async balance(session: Session): Promise<Plan> {
    const account = await this.deps.bank.getAccount(session.userId);
    if (!account.ok) return plan({ parts: explainError(account.error), status: 'failed', errors: [account.error.code] });
    const balance = account.value.balance.amount;
    return plan({ parts: [message('balance.is', { BALANCE: formatAmount(balance) })], params: { balance } });
  }

  private async history(session: Session): Promise<Plan> {
    const items = await this.deps.bank.history(session.userId, 3);
    if (items.length === 0) return plan({ parts: [message('history.empty')] });
    const lines = items.map((t) =>
      message(t.direction === 'out' ? 'history.out' : 'history.in', {
        DATE: formatShortDate(t.at),
        AMOUNT: formatAmount(t.amount.amount),
        NAME: t.counterparty,
      }),
    );
    return plan({ parts: [message('history.header'), ...lines], params: { count: items.length } });
  }

  private async greet(session: Session, contacts: readonly Contact[]): Promise<Plan> {
    const account = await this.deps.bank.getAccount(session.userId);
    const name = account.ok ? (account.value.holderName.split(' ')[0] ?? '') : '';
    const menu = session.pending ? await this.advance(session, contacts, []) : this.menu();
    return { ...menu, parts: [message('greet.hello', { NAME: name }), ...menu.parts] };
  }

  private menu(): Plan {
    return plan({ parts: [message('help.menu')], options: MAIN_MENU.map((i) => intentOption(i)) });
  }

  private async notUnderstood(session: Session, contacts: readonly Contact[]): Promise<Plan> {
    const follow = session.pending ? await this.advance(session, contacts, []) : this.menu();
    return { ...follow, parts: [message('not.understood'), ...follow.parts], errors: ['NOT_UNDERSTOOD'] };
  }

  /** Une question au milieu d'une opération (« c'est quoi les frais ? ») ne la fait pas perdre. */
  private async withResume(session: Session, contacts: readonly Contact[], answer: Plan): Promise<Plan> {
    if (!session.pending) return answer;
    const resume = await this.advance(session, contacts, []);
    return { ...resume, parts: [...answer.parts, ...resume.parts], params: { ...resume.params, ...answer.params } };
  }
}

// ------------------------------------------------------------------ fonctions pures

function explainError(error: BankingError): PlanPart[] {
  const d = error.details ?? {};
  switch (error.code) {
    case 'INSUFFICIENT_FUNDS':
      return [
        message('error.insufficient'),
        ...(d.total !== undefined && d.balance !== undefined
          ? [message('error.insufficient.detail', { TOTAL: formatAmount(d.total), BALANCE: formatAmount(d.balance) })]
          : []),
      ];
    case 'LIMIT_EXCEEDED':
      return [message('error.limit', { AMOUNT: formatAmount(d.max ?? 0) })];
    case 'BELOW_MINIMUM':
      return [message('error.minimum', { AMOUNT: formatAmount(d.min ?? 0) })];
    case 'UNKNOWN_RECIPIENT':
      return [message('ask.recipient')];
    case 'UNKNOWN_ACCOUNT':
    case 'BACKEND_UNAVAILABLE':
      return [message('error.backend')];
  }
}

function toDraft(op: PendingOperation): OperationDraft {
  const amount = op.slots.amount ?? { amount: 0, currency: 'XAF' as const };
  switch (op.intent) {
    case 'TRANSFER':
    case 'CHECK_FEES':
      return {
        kind: 'TRANSFER',
        amount,
        ...(op.recipient ? { recipientPhone: op.recipient.phone, recipientName: op.recipient.name } : {}),
      };
    case 'BUY_AIRTIME':
      return { kind: 'BUY_AIRTIME', amount, ...(op.slots.phone ? { recipientPhone: op.slots.phone } : {}) };
    case 'PAY_BILL':
      return {
        kind: 'PAY_BILL',
        amount,
        ...(op.slots.biller ? { biller: op.slots.biller } : {}),
        ...(op.slots.billReference ? { billReference: op.slots.billReference } : {}),
      };
    case 'WITHDRAW':
      return { kind: 'WITHDRAW', amount };
  }
}

function paramsOf(op: PendingOperation): Record<string, string | number | boolean> {
  const p: Record<string, string | number | boolean> = { operation: op.intent };
  if (op.slots.amount) p.amount = op.slots.amount.amount;
  if (op.recipient) {
    p.recipient = op.recipient.name;
    p.phone = op.recipient.phone;
  } else {
    if (op.slots.recipientQuery) p.recipient = op.slots.recipientQuery;
    if (op.slots.phone) p.phone = op.slots.phone;
  }
  if (op.slots.biller) p.biller = op.slots.biller;
  if (op.slots.billReference) p.billReference = op.slots.billReference;
  return p;
}

function cardOf(op: PendingOperation, fee: number, total: number, balanceAfter: number | null, reference: string | null): OperationCard {
  return {
    intent: op.intent,
    amount: op.slots.amount?.amount ?? null,
    fee,
    total,
    recipientName: op.recipient?.name ?? (op.intent === 'PAY_BILL' ? (op.slots.biller ?? null) : null),
    recipientPhone: op.recipient?.phone ?? op.slots.phone ?? null,
    balanceAfter,
    reference,
  };
}
