/**
 * Banque de démonstration locale : un faux SAFINUM Bank, aux mêmes routes et aux mêmes codes
 * d'erreur que l'API réelle (`/accounts`, `/fees`, `/transactions`, `/billers`…).
 *
 * Elle sert à deux choses :
 *   - faire tourner toute la chaîne (passerelle → middleware → banque) sans clé d'équipe ;
 *   - prouver, dans les tests, que `SafinumBank` envoie bien `X-Team-Key` et `X-Trace-Id`.
 *
 * Aucune donnée réelle : comptes fictifs, remis à zéro par `reset()`.
 */
import { MAX_AMOUNT, officialFee } from '../fees.js';
const OPERATORS = [
    { name: 'MTN', test: (n) => n.startsWith('67') || /^65[0-4]/.test(n) },
    { name: 'ORANGE', test: (n) => n.startsWith('69') || /^65[5-9]/.test(n) },
    { name: 'CAMTEL', test: (n) => /^62[0-2]/.test(n) },
];
export const DEMO_BILLERS = [
    { code: 'ENEO', name: 'Electricite', kind: 'bill' },
    { code: 'CAMWATER', name: 'Eau', kind: 'bill' },
    { code: 'CANAL', name: 'Television', kind: 'bill' },
    { code: 'CAMTEL', name: 'Internet et telephone', kind: 'bill' },
];
/** Comptes de test, calqués sur les exemples de la documentation. */
const SEED = [
    { phone: '237699000003', holder: 'Fadimatou Bouba', balance: 250_000 },
    { phone: '237677000001', holder: 'Paul Mbarga', balance: 12_000 },
    { phone: '237690000002', holder: 'Aicha Njoya', balance: 80_000 },
    { phone: '237655000004', holder: 'NkapLingua Demo', balance: 100_000 },
];
export class DemoBank {
    accounts = new Map();
    transactions = new Map();
    counter = 0;
    constructor() {
        this.reset();
    }
    reset() {
        this.accounts = new Map();
        this.transactions = new Map();
        this.counter = 0;
        for (const seed of SEED) {
            this.accounts.set(keyOf(seed.phone), {
                phone: `237${keyOf(seed.phone)}`,
                holder: seed.holder,
                balance: seed.balance,
                currency: 'XAF',
                operator: operatorOf(seed.phone) ?? 'MTN',
            });
        }
    }
    async account(phone) {
        const account = this.accounts.get(keyOf(phone));
        if (!account)
            return ko(404, 'UNKNOWN_ACCOUNT', 'Aucun compte pour ce numero.');
        return ok({ phone: account.phone, holder: account.holder, balance: account.balance, currency: account.currency });
    }
    async fees(type, amount) {
        if (!Number.isInteger(amount) || amount <= 0)
            return ko(422, 'INVALID_AMOUNT', 'Montant invalide.');
        if (amount > MAX_AMOUNT)
            return ko(422, 'LIMIT_EXCEEDED', `Plafond de ${MAX_AMOUNT} FCFA.`);
        const fee = officialFee(type, amount) ?? 0;
        return ok({ amount, fee, total: amount + fee, currency: 'XAF' });
    }
    async history(phone, limit) {
        const national = keyOf(phone);
        const entries = [...this.transactions.values()]
            .filter((tx) => keyOf(tx.from ?? '') === national || keyOf(tx.to ?? '') === national)
            .sort((a, b) => b.id.localeCompare(a.id))
            .slice(0, Math.min(Math.max(limit, 1), 50))
            .map((tx) => {
            const incoming = keyOf(tx.to ?? '') === national;
            return {
                id: tx.id,
                at: new Date().toISOString(),
                type: tx.type,
                direction: incoming ? 'in' : 'out',
                amount: tx.amount,
                label: incoming ? `De ${tx.from ?? ''}` : `A ${tx.to ?? ''}`,
            };
        });
        return ok(entries);
    }
    async beneficiaries(query) {
        const needle = query.trim().toLowerCase();
        if (!needle)
            return ok([]);
        const matched = [...this.accounts.values()]
            .filter((account) => account.holder.toLowerCase().includes(needle) || account.phone.includes(keyOf(needle)))
            .map((account) => ({ name: account.holder, phone: account.phone }));
        return ok(matched);
    }
    async billers() {
        return ok([
            ...DEMO_BILLERS,
            { code: 'MTN', name: 'MTN', kind: 'airtime' },
            { code: 'ORANGE', name: 'Orange', kind: 'airtime' },
            { code: 'CAMTEL', name: 'Camtel', kind: 'airtime' },
        ]);
    }
    async create(input) {
        const account = this.accounts.get(keyOf(input.from));
        if (!account)
            return ko(404, 'UNKNOWN_ACCOUNT', 'Aucun compte pour ce numero.');
        if (!Number.isInteger(input.amount) || input.amount <= 0)
            return ko(422, 'INVALID_AMOUNT', 'Montant invalide.');
        if (input.amount > MAX_AMOUNT)
            return ko(422, 'LIMIT_EXCEEDED', `Plafond de ${MAX_AMOUNT} FCFA.`);
        if (input.type === 'transfer' && !this.accounts.has(keyOf(input.to))) {
            return ko(404, 'UNKNOWN_BENEFICIARY', 'Beneficiaire inconnu.');
        }
        if (input.type === 'bill' && !DEMO_BILLERS.some((b) => b.code === input.biller)) {
            return ko(404, 'UNKNOWN_BILLER', 'Facturier inconnu.');
        }
        const operator = operatorOf(input.to);
        if (input.type === 'airtime' && !operator) {
            return ko(404, 'UNKNOWN_BILLER', 'Operateur non reconnu pour ce numero.');
        }
        const fee = officialFee(input.type, input.amount) ?? 0;
        if (account.balance < input.amount + fee) {
            return ko(422, 'INSUFFICIENT_FUNDS', 'Solde insuffisant.');
        }
        this.counter += 1;
        const id = `MBP${String(this.counter).padStart(8, '0')}`;
        const tx = {
            id,
            status: 'pending',
            type: input.type,
            amount: input.amount,
            fee,
            total: input.amount + fee,
            from: keyOf(input.from),
            to: keyOf(input.to),
            operator: input.type === 'airtime' ? (operator ?? undefined) : undefined,
            biller: input.biller,
            reference: input.reference,
        };
        this.transactions.set(id, tx);
        return ok(tx);
    }
    async update(id, patch) {
        const tx = this.transactions.get(id);
        if (!tx)
            return ko(404, 'TX_NOT_FOUND', 'Transaction inconnue.');
        if (tx.status !== 'pending')
            return ko(409, 'TX_NOT_PENDING', 'Transaction deja executee.');
        const amount = patch.amount ?? tx.amount;
        if (!Number.isInteger(amount) || amount <= 0)
            return ko(422, 'INVALID_AMOUNT', 'Montant invalide.');
        if (amount > MAX_AMOUNT)
            return ko(422, 'LIMIT_EXCEEDED', `Plafond de ${MAX_AMOUNT} FCFA.`);
        const fee = officialFee(tx.type, amount) ?? 0;
        const updated = {
            ...tx,
            amount,
            fee,
            total: amount + fee,
            to: patch.to ? keyOf(patch.to) : tx.to,
        };
        this.transactions.set(id, updated);
        return ok(updated);
    }
    async confirm(id) {
        const tx = this.transactions.get(id);
        if (!tx)
            return ko(404, 'TX_NOT_FOUND', 'Transaction inconnue.');
        if (tx.status !== 'pending')
            return ko(409, 'TX_NOT_PENDING', 'Transaction deja executee.');
        const account = this.accounts.get(keyOf(tx.from ?? ''));
        if (!account)
            return ko(404, 'UNKNOWN_ACCOUNT', 'Aucun compte pour ce numero.');
        if (account.balance < tx.total)
            return ko(422, 'INSUFFICIENT_FUNDS', 'Solde insuffisant.');
        account.balance -= tx.total;
        const recipient = this.accounts.get(keyOf(tx.to ?? ''));
        if (recipient && tx.type === 'transfer')
            recipient.balance += tx.amount;
        const confirmed = { ...tx, status: 'confirmed', balanceAfter: account.balance };
        this.transactions.set(id, confirmed);
        return ok(confirmed);
    }
    async cancel(id) {
        const tx = this.transactions.get(id);
        if (!tx)
            return ko(404, 'TX_NOT_FOUND', 'Transaction inconnue.');
        if (tx.status !== 'pending')
            return ko(409, 'TX_NOT_PENDING', 'Transaction deja executee.');
        const cancelled = { ...tx, status: 'cancelled' };
        this.transactions.set(id, cancelled);
        return ok(cancelled);
    }
}
export function operatorOf(phone) {
    const national = digits(phone);
    return OPERATORS.find((operator) => operator.test(national))?.name ?? null;
}
export function digits(value) {
    return String(value).replace(/\D+/g, '');
}
/** Clé de compte : les 9 chiffres nationaux, quel que soit le format reçu (677000001, +237 677…). */
export function keyOf(value) {
    return digits(value).slice(-9);
}
function ok(data) {
    return { ok: true, status: 200, data };
}
function ko(status, error, message) {
    return { ok: false, status, error, message };
}
