/**
 * Le middleware : un tour SAFINUM entre, une réponse au contrat sort.
 *
 * Un seul point d'entrée pour les trois canaux, comme la passerelle qui POSTe sur une seule URL :
 * `ui_translation` part vers la traduction d'écran, tout le reste est un menu USSD.
 */
import { isUiTranslation, normalizeChannel } from './contract.js';
import { SafinumBank } from './bank.js';
import { handleUssd } from './ussd.js';
import { handleUi } from './ui.js';
import { InMemorySessions } from './session.js';
export class Gateway {
    options;
    sessions;
    constructor(options) {
        this.options = options;
        this.sessions = options.sessions ?? new InMemorySessions();
    }
    async handle(turn) {
        return (await this.handleWithMeta(turn)).reply;
    }
    async handleWithMeta(turn) {
        const channel = normalizeChannel(turn.channel);
        const traceId = String(turn.trace_id ?? '');
        if (isUiTranslation(turn)) {
            return { reply: handleUi(turn), channel, traceId };
        }
        const bank = this.bankFactory(turn);
        const reply = await handleUssd(turn, {
            bank,
            sessions: this.sessions,
            ...(this.options.strictStatus === undefined ? {} : { strictStatus: this.options.strictStatus }),
        });
        return { reply, channel, traceId };
    }
    bankFactory(turn) {
        if (this.options.bankFactory)
            return this.options.bankFactory(turn);
        const baseUrl = this.options.bankUrl || turn.bank_api?.base_url || 'https://safinum.cm/api/v1';
        return new SafinumBank({
            baseUrl,
            teamKey: this.options.teamKey,
            traceId: String(turn.trace_id ?? ''),
            ...(this.options.timeoutMs === undefined ? {} : { timeoutMs: this.options.timeoutMs }),
            ...(this.options.fetchImpl === undefined ? {} : { fetchImpl: this.options.fetchImpl }),
        });
    }
}
