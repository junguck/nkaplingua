// Canal USSD : menus numérotés, solde et transfert de crédit.
//
// Ce que la passerelle envoie (extrait) :
//   { trace_id, session_id, phone: "237699000001", language: "dua" | null,
//     input: { type: "text", text: "1", ussd_text: "*123#*1" },
//     constraints: { max_chars: 182, charset: "gsm7" },
//     bank_api: { base_url: "https://…/api/v1" } }
//
// Ce qu'il faut répondre, à chaque tour :
//   { response: { text, end_session, options },
//     interpretation: { intent, parameters, language },
//     transaction: { id, status } }
//
// Règle du jury : une opération est CRÉÉE dans un tour, puis CONFIRMÉE dans un
// tour suivant, après que l'utilisateur a lu le récapitulatif. Confirmer dans
// le même tour que la saisie du montant est signalé comme non réaliste.

const { createBank } = require('./bank');
const { understand, say } = require('./language');

const MAX_CHARS = 182;

// État des sessions en mémoire, indexé par session_id. Suffisant pour le
// développement ; perdu au redémarrage. En production : Redis, fichier, base.
const sessions = new Map();

const MENU = ['Mon solde', 'Transfert de credit'];

async function handleUssd(payload, traceId) {
    const sessionId = payload.session_id || 'sans-session';
    const phone = String(payload.phone || '');
    const language = payload.language || null;
    const text = understand(String((payload.input && payload.input.text) || '').trim(), language);
    const bank = createBank(payload.bank_api && payload.bank_api.base_url, traceId);

    const state = sessions.get(sessionId) || { step: 'idle' };
    const reply = await route(state, text, phone, bank);

    if (reply.response.end_session) sessions.delete(sessionId);
    else sessions.set(sessionId, state);

    return finalize(reply, language);
}

async function route(state, text, phone, bank) {
    // Premier tour : l'utilisateur vient de composer le code court.
    if (text === '' && state.step !== 'confirm') {
        state.step = 'menu';

        return reply('Safinum. Choisissez:\n' + numbered(MENU), 'UNKNOWN', {}, { options: MENU });
    }

    switch (state.step) {
        case 'menu':
            if (text === '1') return balance(phone, bank);
            if (text === '2') {
                state.step = 'airtime_target';

                return reply('Credit pour:\n1. Mon numero\n2. Un autre numero', 'CLARIFICATION_NEEDED');
            }

            return reply('Choix invalide.\n' + numbered(MENU), 'CLARIFICATION_NEEDED', {}, { options: MENU });

        case 'airtime_target':
            if (text === '1') {
                state.to = phone;

                return askAmount(state);
            }
            if (text === '2') {
                state.step = 'airtime_phone';

                return reply('Numero a recharger (9 chiffres):', 'CLARIFICATION_NEEDED');
            }

            return reply('Tapez 1 (mon numero) ou 2 (un autre numero).', 'CLARIFICATION_NEEDED');

        case 'airtime_phone': {
            const digits = text.replace(/\D+/g, '');

            if (!/^6\d{8}$/.test(digits)) return reply('Numero invalide. 9 chiffres, ex: 699000002', 'CLARIFICATION_NEEDED');

            state.to = '237' + digits;

            return askAmount(state);
        }

        case 'airtime_amount':
            return createAirtime(state, text, phone, bank);

        case 'confirm':
            if (text === '1') return confirm(state, bank);
            if (text === '2') return cancel(state, bank);

            return reply('Repondez 1 pour confirmer ou 2 pour annuler.', 'CLARIFICATION_NEEDED', {}, { transaction: pending(state) });

        default:
            state.step = 'menu';

            return reply('Safinum. Choisissez:\n' + numbered(MENU), 'UNKNOWN', {}, { options: MENU });
    }
}

// ── Opérations ─────────────────────────────────────────────────────────────

async function balance(phone, bank) {
    const result = await bank.balance(phone);

    if (!result.ok) return bankError(result, 'BALANCE_INQUIRY');

    return reply(`Votre solde est de ${money(result.data.balance)}.`, 'BALANCE_INQUIRY', { account: phone }, { end: true });
}

function askAmount(state) {
    state.step = 'airtime_amount';

    return reply('Montant du credit (FCFA):', 'CLARIFICATION_NEEDED', { to: state.to });
}

async function createAirtime(state, text, phone, bank) {
    const amount = Number(text.replace(/[\s.]/g, ''));

    if (!Number.isInteger(amount) || amount <= 0) return reply('Montant invalide. Tapez un nombre, ex: 1000', 'CLARIFICATION_NEEDED');

    // L'opérateur est déduit du numéro par la banque : inutile de l'envoyer.
    const result = await bank.createTransaction({ type: 'airtime', from: phone, to: state.to, amount });

    if (!result.ok) return bankError(result, 'AIRTIME_PURCHASE');

    const tx = result.data;
    state.step = 'confirm';
    state.reference = tx.id;

    return reply(
        `Credit ${tx.operator} de ${money(tx.amount)} pour le ${local(tx.to || state.to)}. ` +
            `Frais ${money(tx.fee)}, total ${money(tx.total)}.\n1. Confirmer\n2. Annuler`,
        'AIRTIME_PURCHASE',
        { amount: tx.amount, to: tx.to || state.to, operator: tx.operator },
        { options: ['Confirmer', 'Annuler'], transaction: { id: tx.id, status: 'pending' } },
    );
}

async function confirm(state, bank) {
    const result = await bank.confirm(state.reference);

    if (!result.ok) return bankError(result, 'CONFIRM', state.reference);

    const tx = result.data;

    return reply(
        `Credit de ${money(tx.amount)} envoye au ${local(tx.to)}. Ref ${tx.id}.`,
        'CONFIRM',
        { transaction_id: tx.id },
        {
            end: true,
            transaction: { id: tx.id, status: 'confirmed' },
        },
    );
}

async function cancel(state, bank) {
    const result = await bank.cancel(state.reference);

    if (!result.ok) return bankError(result, 'CANCEL', state.reference);

    return reply(
        'Operation annulee. Aucun montant debite.',
        'CANCEL',
        { transaction_id: state.reference },
        {
            end: true,
            transaction: { id: state.reference, status: 'cancelled' },
        },
    );
}

// Phrases lisibles pour les erreurs les plus courantes de l'API bancaire.
const ERRORS = {
    INSUFFICIENT_FUNDS: 'Solde insuffisant pour cette operation.',
    INVALID_AMOUNT: 'Montant invalide.',
    LIMIT_EXCEEDED: 'Montant trop eleve pour une seule operation.',
    UNKNOWN_BENEFICIARY: 'Numero inconnu ou invalide.',
    UNKNOWN_BILLER: 'Operateur non reconnu pour ce numero.',
    UNKNOWN_ACCOUNT: 'Compte introuvable.',
    UNREACHABLE: 'Service momentanement indisponible. Reessayez plus tard.',
};

function bankError(result, intent, reference = null) {
    const code = (result.data && result.data.error) || 'ERROR';

    console.warn(`Banque : ${result.status} ${code}`, result.data && result.data.message);
    if (code === 'UNAUTHORIZED') console.warn('Clé refusée : vérifiez SAFINUM_TEAM_KEY dans .env.');

    return reply(
        ERRORS[code] || 'Operation impossible. Reessayez plus tard.',
        intent,
        { error: code },
        {
            end: true,
            transaction: reference ? { id: reference, status: 'failed' } : undefined,
        },
    );
}

// ── Construction de la réponse ─────────────────────────────────────────────

function reply(text, intent, parameters = {}, { options = [], end = false, transaction } = {}) {
    return {
        response: { text, end_session: end, options },
        interpretation: { intent, parameters, language: 'fr' },
        transaction: transaction || { id: null, status: 'none' },
    };
}

/** Applique la couche linguistique, puis vérifie les contraintes du canal. */
function finalize(body, language) {
    const translated = say(body.response.text, language);

    body.response.text = translated.text;
    body.response.options = body.response.options.map((option) => say(option, language).text);
    body.interpretation.language = translated.language;

    if (!isGsm7(body.response.text)) console.warn('Hors GSM-7 (le texte sera mal affiché sur un vrai téléphone) :', body.response.text);
    if (gsm7Length(body.response.text) > MAX_CHARS) console.warn(`Plus de ${MAX_CHARS} caractères :`, body.response.text);

    return body;
}

function pending(state) {
    return { id: state.reference || null, status: state.reference ? 'pending' : 'none' };
}

function numbered(items) {
    return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function money(amount) {
    return `${String(Math.round(Number(amount) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;
}

function local(phone) {
    return String(phone || '').replace(/^237/, '');
}

// ── GSM-7 (alphabet des SMS et de l'USSD) ──────────────────────────────────

const GSM7_BASIC =
    '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' + '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = '^{}\\[~]|€\f';

/** Vrai si le texte passe sur un vrai réseau USSD sans être transcodé. */
function isGsm7(text) {
    return [...text].every((char) => GSM7_BASIC.includes(char) || GSM7_EXTENDED.includes(char));
}

/** Longueur en septets : les caractères étendus (€, [, ]…) comptent double. */
function gsm7Length(text) {
    return [...text].reduce((total, char) => total + (GSM7_EXTENDED.includes(char) ? 2 : 1), 0);
}

module.exports = { handleUssd, isGsm7, gsm7Length };
