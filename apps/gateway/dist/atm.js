/**
 * ATM — canal local, hors sandbox.
 *
 * Le distributeur est le seul endroit où un retrait d'espèces a un sens : l'API bancaire SAFINUM
 * n'a pas de route de retrait (la sandbox n'a même pas d'intention `WITHDRAW`, voir `intents.ts`).
 * On assume donc deux choses, écrites noir sur blanc dans chaque réponse :
 *
 *   1. le code à 4 chiffres n'est PAS vérifié par la banque (aucune route pour cela) : il est
 *      seulement exigé et saisi, et `simulation.pinVerified` le dit ;
 *   2. la remise d'espèces est SIMULÉE localement : on débite le solde uniquement dans le calcul,
 *      jamais dans le grand livre (`simulation.bankRoute: 'none'`).
 *
 * En revanche, les règles du distributeur sont réelles et testées : montant multiple de 5 000 FCFA,
 * plafond officiel de 500 000 FCFA, solde suffisant **frais compris**, coupures de 10 000 et 5 000.
 * Brancher un vrai retrait ne demandera qu'une route bancaire : ce fichier est le seul à changer.
 */
import { normalizePhone } from './contract.js';
import { MAX_AMOUNT, officialFee } from './fees.js';
import { displayPhone, message, money, resolveLanguage } from './i18n.js';
import { LOCAL_ONLY_NOTE, digitsToAmount, failureText, readDigits } from './local.js';
import { TtlStore } from './session.js';
const TIMEOUT_MS = 15_000;
const STEP = 5_000;
const NOTES = [10_000, 5_000];
const defaultSessions = new TtlStore(180_000);
export async function handleAtm(turn, deps) {
    const sessions = deps.sessions ?? defaultSessions;
    const key = turn.session_id ?? turn.card ?? 'carte-anonyme';
    const language = resolveLanguage(turn.language);
    const state = sessions.get(key) ?? { step: 'card', language };
    state.language = language;
    if (!state.card) {
        const fromBody = normalizePhone(turn.card ?? '');
        if (fromBody)
            state.card = fromBody;
    }
    const input = readDigits(turn);
    const reply = await advance(state, input, deps);
    if (reply.end)
        sessions.delete(key);
    else
        sessions.set(key, state);
    return reply;
}
async function advance(state, input, deps) {
    const language = state.language;
    if (input.cancel) {
        state.step = 'menu';
        return eject(state, message(language, 'done.cancel'));
    }
    switch (state.step) {
        case 'card':
            if (!state.card || input.digits !== '') {
                const typed = normalizePhone(input.digits);
                if (typed)
                    state.card = typed;
            }
            if (!state.card) {
                return prompt(state, message(language, 'atm.card'), 'card', [9, 9]);
            }
            state.step = 'pin';
            return prompt(state, message(language, 'atm.pin'), 'pin', [4, 4]);
        case 'pin':
            if (input.digits.length !== 4) {
                return prompt(state, message(language, 'ivr.invalid'), 'pin', [4, 4]);
            }
            return welcome(state, deps);
        case 'menu':
            return menu(state, input.digits, deps);
        case 'amount':
            return withdraw(state, input.digits, deps);
        default:
            state.step = 'menu';
            return prompt(state, message(language, 'atm.menu'), 'menu', [1, 1]);
    }
}
async function welcome(state, deps) {
    const language = state.language;
    const card = state.card ?? '';
    const account = await deps.bank.account(card);
    if (!account.ok)
        return eject(state, failureText(language, account));
    state.holder = account.data.holder;
    state.step = 'menu';
    return prompt(state, `${message(language, 'atm.welcome', { name: account.data.holder || displayPhone(card) })}\n${message(language, 'atm.menu')}`, 'menu', [1, 1]);
}
async function menu(state, digits, deps) {
    const language = state.language;
    if (digits === '4')
        return eject(state, message(language, 'atm.eject'));
    if (digits === '2') {
        const account = await deps.bank.account(state.card ?? '');
        if (!account.ok)
            return eject(state, failureText(language, account));
        return {
            ...eject(state, message(language, 'balance', { balance: money(account.data.balance) })),
            receipt: { kind: 'balance', balance: account.data.balance },
        };
    }
    if (digits === '3') {
        const history = await deps.bank.history(state.card ?? '', 3);
        if (!history.ok)
            return eject(state, failureText(language, history));
        if (history.data.length === 0)
            return eject(state, message(language, 'history.empty'));
        const lines = history.data.slice(0, 3).map((entry) => message(language, 'history.line', {
            date: entry.at.slice(5, 10),
            label: entry.label || entry.type,
            amount: `${entry.direction === 'in' ? '+' : '-'}${money(entry.amount)}`,
        }));
        return {
            ...eject(state, [message(language, 'history.header'), ...lines].join('\n')),
            receipt: { kind: 'history', lines },
        };
    }
    if (digits === '1') {
        state.step = 'amount';
        return prompt(state, message(language, 'ivr.askAmount'), 'amount', [4, 6]);
    }
    return prompt(state, `${message(language, 'ivr.invalid')}\n${message(language, 'atm.menu')}`, 'menu', [1, 1]);
}
async function withdraw(state, digits, deps) {
    const language = state.language;
    const amount = digitsToAmount(digits);
    if (amount === null)
        return prompt(state, message(language, 'invalid.amount'), 'amount', [4, 6]);
    if (amount % STEP !== 0) {
        return prompt(state, `${message(language, 'atm.multiple', { step: money(STEP, '').trim() })}`, 'amount', [4, 6]);
    }
    if (amount > MAX_AMOUNT) {
        return prompt(state, message(language, 'invalid.limit', { max: money(MAX_AMOUNT) }), 'amount', [4, 6]);
    }
    const account = await deps.bank.account(state.card ?? '');
    if (!account.ok)
        return eject(state, failureText(language, account));
    const fee = officialFee('withdrawal', amount) ?? 0;
    if (amount + fee > account.data.balance) {
        return eject(state, message(language, 'error.INSUFFICIENT_FUNDS'));
    }
    return {
        ...eject(state, `${message(language, 'atm.dispensed', { amount: money(amount), fee: money(fee) })}\n${message(language, 'atm.simulated')}`),
        receipt: {
            kind: 'withdrawal',
            amount,
            fee,
            total: amount + fee,
            notes: notesFor(amount),
            simulated: true,
        },
    };
}
/** Coupures réelles : que du 10 000 et du 5 000, le plus gros d'abord. */
export function notesFor(amount) {
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
        channel: 'atm',
        language: state.language,
        screen,
        gather: { type, digits, terminator: '#', cancel: '*', timeout_ms: TIMEOUT_MS },
        simulation: simulation(),
        state: state.card ? { step: state.step, card: state.card } : { step: state.step },
        end: false,
    };
}
function eject(state, screen) {
    return {
        channel: 'atm',
        language: state.language,
        screen,
        gather: null,
        simulation: simulation(),
        state: state.card ? { step: state.step, card: state.card } : { step: state.step },
        end: true,
    };
}
function simulation() {
    return { localOnly: true, bankRoute: 'none', pinVerified: false, note: LOCAL_ONLY_NOTE };
}
