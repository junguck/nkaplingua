// ═══════════════════════════════════════════════════════════════════════════
//  VOTRE COUCHE LINGUISTIQUE — c'est ce fichier que vous devez modifier.
// ═══════════════════════════════════════════════════════════════════════════
//
// Le reste du kit (contrat, banque, sessions) fonctionne déjà. Tel quel, il
// parle français : remplacez les deux fonctions ci-dessous par votre modèle,
// vos dictionnaires ou vos règles.

/**
 * Ce que l'utilisateur a tapé, ramené à ce que les menus comprennent.
 *
 * Exemple d'usage : "solde" ou son équivalent en duala → "1".
 * Tel quel : renvoie la saisie sans la changer.
 *
 * @param {string} text      saisie brute de l'utilisateur
 * @param {string|null} language  langue demandée par la session (ex. "dua"), peut être null
 * @returns {string}
 */
function understand(text, language) {
    // TODO : reconnaître les mots-clés et nombres en langue nationale.
    return text;
}

/**
 * Traduit une phrase française du kit dans la langue de la session.
 *
 * Renvoyez la langue RÉELLEMENT utilisée : si vous n'avez pas de traduction,
 * gardez le français et déclarez "fr". Le jury compare ce que vous déclarez
 * à ce que vous affichez.
 *
 * Contrainte USSD : 182 caractères au plus, alphabet GSM-7 (pas de ɛ ɔ ŋ ə,
 * pas d'apostrophe courbe). Voir isGsm7() dans ussd.js.
 *
 * @param {string} text      phrase française
 * @param {string|null} language  langue demandée
 * @returns {{ text: string, language: string }}
 */
function say(text, language) {
    // TODO : traduire vers `language`.
    return { text, language: 'fr' };
}

module.exports = { understand, say };
