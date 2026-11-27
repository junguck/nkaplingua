/**
 * Alphabet GSM-7 : celui d'un vrai réseau USSD.
 *
 * Un seul caractère hors alphabet (ɛ, ɔ, ŋ, ə, ɓ, ɗ, ƴ, l'apostrophe courbe, le tiret cadratin…)
 * fait basculer tout le message en UCS-2 : 70 caractères au lieu de 182, et un affichage cassé sur
 * beaucoup de téléphones. On translittère donc AVANT de compter, puis on compte en septets
 * (les caractères étendus comme € ou [ valent deux septets).
 */
const GSM7_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
    '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = '^{}\\[~]|€\f';
const BASIC_SET = new Set([...GSM7_BASIC]);
const EXTENDED_SET = new Set([...GSM7_EXTENDED]);
/**
 * Translittération des lettres nationales et de la typographie française vers GSM-7.
 * Les valeurs verrouillées (montants, numéros) ne contiennent jamais ces caractères :
 * la translittération ne peut donc pas altérer un chiffre.
 */
const FOLD = {
    ɓ: 'b',
    Ɓ: 'B',
    ɗ: 'd',
    Ɗ: 'D',
    ŋ: 'ng',
    Ŋ: 'NG',
    ƴ: 'y',
    Ƴ: 'Y',
    ɛ: 'e',
    Ɛ: 'E',
    ɔ: 'o',
    Ɔ: 'O',
    ə: 'e',
    Ə: 'E',
    ɨ: 'i',
    Ɨ: 'I',
    ʉ: 'u',
    Ʌ: 'V',
    ß: 'ss',
    æ: 'ae',
    Æ: 'AE',
    œ: 'oe',
    Œ: 'OE',
    '’': "'",
    '‘': "'",
    '“': '"',
    '”': '"',
    '«': '"',
    '»': '"',
    '–': '-',
    '—': '-',
    '−': '-',
    '…': '...',
    '•': '-',
    '·': '.',
    '\u00a0': ' ',
    '\u202f': ' ',
    '\t': ' ',
};
/** Vrai si le texte passe tel quel sur un réseau GSM-7 (sans transcodage UCS-2). */
export function isGsm7(text) {
    return [...text].every((char) => BASIC_SET.has(char) || EXTENDED_SET.has(char));
}
/** Longueur en septets : un caractère étendu (€, [, ], {, }…) en consomme deux. */
export function gsm7Length(text) {
    let total = 0;
    for (const char of text)
        total += EXTENDED_SET.has(char) ? 2 : 1;
    return total;
}
/** Ne garde que des caractères GSM-7 ; `?` en dernier recours, jamais un caractère qui casse le canal. */
export function toGsm7(text) {
    let out = '';
    for (const char of text) {
        if (BASIC_SET.has(char) || EXTENDED_SET.has(char)) {
            out += char;
            continue;
        }
        const folded = FOLD[char];
        if (folded !== undefined) {
            out += folded;
            continue;
        }
        const stripped = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (stripped !== char && [...stripped].every((c) => BASIC_SET.has(c) || EXTENDED_SET.has(c))) {
            out += stripped;
            continue;
        }
        out += '?';
    }
    return out;
}
/**
 * Coupe un texte à `maxSeptets`, sans jamais tomber au milieu d'un montant
 * (« 25 000 FCFA » coupé en « 25 00 » serait un mensonge).
 */
export function truncateGsm7(text, maxSeptets) {
    if (gsm7Length(text) <= maxSeptets)
        return text;
    let out = '';
    let used = 0;
    for (const char of text) {
        const width = EXTENDED_SET.has(char) ? 2 : 1;
        if (used + width > maxSeptets - 3)
            break; // garde la place des points de suspension
        out += char;
        used += width;
    }
    let cut = out.lastIndexOf(' ');
    while (cut > 0 && /\d/.test(out.charAt(cut - 1)) && /\d/.test(out.charAt(cut + 1))) {
        cut = out.lastIndexOf(' ', cut - 1);
    }
    const body = cut > 0 ? out.slice(0, cut) : out;
    return `${body}...`;
}
