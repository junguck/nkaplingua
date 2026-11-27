// Canaux mobile et web : traduire les écrans de l'application bancaire.
//
// Ce que la passerelle envoie (extrait) :
//   { type: "ui_translation", screen: "home", language: "dua",
//     source_language: "fr",
//     strings: { "home.balance_label": { text: "Solde disponible", context: "…", max_chars: 28 }, … } }
//
// Ce qu'il faut répondre :
//   { language: "dua", strings: { "home.balance_label": "…", … } }
//
// Règles vérifiées par la sandbox :
//   - une clé absente ou vide → l'appli affiche le français (MISSING_STRINGS)
//   - les emplacements {amount}, {name}… doivent rester identiques (PLACEHOLDER_BROKEN)
//   - max_chars, quand il est fourni, ne doit pas être dépassé (OVER_LENGTH)
//   - renvoyer le français en déclarant une autre langue est repéré (UNTRANSLATED)

const fs = require('node:fs');
const path = require('node:path');

const DICTIONARIES = path.join(__dirname, 'translations');

function handleUi(payload) {
    const requested = String(payload.language || 'fr');
    const source = payload.strings || {};
    const dictionary = load(requested);

    // Pas de dictionnaire pour cette langue : on renvoie le français et on le
    // DÉCLARE. C'est la réponse honnête ; inventer une langue serait repéré.
    if (!dictionary) {
        const strings = {};
        for (const [key, entry] of Object.entries(source)) strings[key] = entry.text;

        return { language: 'fr', strings };
    }

    const strings = {};

    for (const [key, entry] of Object.entries(source)) {
        // TODO : branchez ici votre moteur pour les clés absentes du dictionnaire.
        const value = dictionary[key];

        if (typeof value !== 'string' || value.trim() === '') continue; // absente : repli français

        check(key, entry, value);
        strings[key] = value;
    }

    return { language: requested, strings };
}

/** translations/<langue>.json, relu à chaque requête pour voir vos modifications sans redémarrer. */
function load(language) {
    if (!/^[a-z]{2,3}$/.test(language)) return null;

    const file = path.join(DICTIONARIES, `${language}.json`);

    if (!fs.existsSync(file)) return null;

    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        console.warn(`translations/${language}.json illisible :`, error.message);

        return null;
    }
}

function placeholders(text) {
    // Même règle que la sandbox : noms en minuscules, sans doublon, triés.
    return [...new Set(String(text).match(/\{[a-z_]+\}/g) || [])].sort().join(',');
}

function check(key, entry, value) {
    if (placeholders(entry.text) !== placeholders(value)) {
        console.warn(`[${key}] emplacements différents : attendu ${placeholders(entry.text) || 'aucun'}, reçu ${placeholders(value) || 'aucun'}`);
    }

    if (entry.max_chars && [...value].length > entry.max_chars) {
        console.warn(`[${key}] ${[...value].length} caractères pour ${entry.max_chars} autorisés`);
    }
}

module.exports = { handleUi };
