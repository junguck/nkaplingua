// Client de l'API bancaire simulée.
//
// Deux en-têtes sur chaque appel :
//   X-Team-Key : votre clé d'équipe (fichier .env)
//   X-Trace-Id : celui du tour en cours, reçu de la passerelle
//
// Les erreurs ne lèvent pas d'exception : elles reviennent sous la forme
// { ok: false, status, data: { error: 'CODE', message } }, pour que ussd.js
// puisse répondre une phrase lisible à l'utilisateur.

function createBank(baseUrl, traceId) {
    const root = String(baseUrl || process.env.SAFINUM_BANK_URL || '').replace(/\/+$/, '');

    async function call(method, path, body) {
        const headers = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Team-Key': process.env.SAFINUM_TEAM_KEY || '',
        };

        if (traceId) headers['X-Trace-Id'] = traceId;

        try {
            const response = await fetch(root + path, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                // L'USSD laisse 3 secondes à tout le tour : ne pas attendre plus.
                signal: AbortSignal.timeout(2500),
            });
            const data = await response.json().catch(() => ({}));

            return { ok: response.ok, status: response.status, data };
        } catch (error) {
            return { ok: false, status: 0, data: { error: 'UNREACHABLE', message: String(error.message || error) } };
        }
    }

    const id = (value) => encodeURIComponent(value);

    return {
        balance: (phone) => call('GET', `/accounts/${id(phone)}`),
        history: (phone, limit = 5) => call('GET', `/accounts/${id(phone)}/transactions?limit=${limit}`),
        fees: (type, amount) => call('GET', `/fees?type=${id(type)}&amount=${id(amount)}`),
        createTransaction: (body) => call('POST', '/transactions', body),
        confirm: (reference) => call('POST', `/transactions/${id(reference)}/confirm`),
        cancel: (reference) => call('POST', `/transactions/${id(reference)}/cancel`),
    };
}

module.exports = { createBank };
