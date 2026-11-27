/**
 * Une session USSD dure 180 secondes. On garde en mémoire ce que l'utilisateur a déjà saisi
 * et la transaction en attente côté banque (son identifiant, jamais un montant recalculé).
 * Le magasin est volontairement remplaçable : en production, Redis ou une table.
 */
const TTL_MS = 180_000;
/**
 * Magasin TTL minimal pour les canaux locaux (appel IVR, session ATM), qui n'ont pas les
 * 180 secondes d'une session USSD. Même contrat que `SessionStore`, sans le typage du dialogue.
 */
export class TtlStore {
    ttlMs;
    items = new Map();
    constructor(ttlMs = 300_000) {
        this.ttlMs = ttlMs;
    }
    get(key) {
        const item = this.items.get(key);
        if (!item)
            return undefined;
        if (Date.now() - item.touchedAt > this.ttlMs) {
            this.items.delete(key);
            return undefined;
        }
        return item.value;
    }
    set(key, value) {
        this.items.set(key, { value, touchedAt: Date.now() });
        if (this.items.size > 2_000) {
            for (const [storedKey, item] of this.items) {
                if (Date.now() - item.touchedAt > this.ttlMs)
                    this.items.delete(storedKey);
            }
        }
    }
    delete(key) {
        this.items.delete(key);
    }
}
export class InMemorySessions {
    states = new Map();
    get(key) {
        const state = this.states.get(key);
        if (!state)
            return undefined;
        if (Date.now() - state.updatedAt > TTL_MS) {
            this.states.delete(key);
            return undefined;
        }
        return state;
    }
    set(key, state) {
        state.updatedAt = Date.now();
        this.states.set(key, state);
        if (this.states.size > 5_000)
            this.evict();
    }
    delete(key) {
        this.states.delete(key);
    }
    evict() {
        for (const [key, state] of this.states) {
            if (Date.now() - state.updatedAt > TTL_MS)
                this.states.delete(key);
        }
    }
}
