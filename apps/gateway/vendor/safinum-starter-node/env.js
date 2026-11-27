// Lecture minimale du fichier .env (pas de dépendance dotenv).
// Les variables déjà définies dans l'environnement gardent la priorité.

const fs = require('node:fs');
const path = require('node:path');

function loadEnv(file = path.join(__dirname, '.env')) {
    if (!fs.existsSync(file)) return;

    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);

        if (!match || line.trim().startsWith('#')) continue;

        const value = match[2].replace(/^(['"])(.*)\1$/, '$2');

        if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
}

module.exports = { loadEnv };
