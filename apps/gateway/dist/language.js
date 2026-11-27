/**
 * Détection de langue quand la passerelle envoie `language: null`.
 *
 * La sandbox prévient : `language` peut être nul, et la détection nous revient — c'est un cas
 * d'évaluation à part entière. On ne détecte que ce qu'on sait réellement servir : `fr`, `en`,
 * `fub`. Les autres langues de la sandbox (`dua`, `ewo`, `bas`, `bbj`, `byv`) n'ont pas de
 * lexique fiable dans le dépôt ; les deviner serait pire que de rester en français et de le
 * déclarer.
 *
 * Le corpus de `test/language.test.ts` contient des phrases réelles, y compris **sans mot-clé
 * évident** (« Il me reste beaucoup sur le compte ») : la détection ne peut donc pas reposer sur
 * `solde` / `balance` / `ceede` seulement. Quatre familles d'indices, additionnées :
 *
 *   1. caractères propres au fulfulde (ɓ ɗ ŋ ƴ ɛ ɔ ə) — indice décisif, un seul suffit ;
 *   2. mots grammaticaux (le, the, mi, ko…) : c'est eux qui portent une phrase ordinaire ;
 *   3. morphologie (élisions `j'ai`, `c'est` ; contractions anglaises ; suffixes fulfulde) ;
 *   4. tournures figées (`est-ce que`, `how much`, `ko woni`, `no foti`).
 *
 * Règle : une langue explicite (`turn.language`) ou choisie par l'utilisateur (menu 8) est
 * toujours prioritaire. La détection ne s'applique qu'au silence de la passerelle, avec des
 * indices suffisants (score ≥ 3 et marge nette sur le deuxième).
 */
/**
 * Poids : 3 pour un mot qui n'appartient qu'à une langue, 2 pour un mot fréquent mais partagé,
 * 1 pour un indice faible (préposition, pronom atone) qui ne doit jamais décider seul.
 */
const CUES = {
    fr: {
        le: 2, la: 2, les: 2, un: 2, une: 2, des: 2, du: 2, de: 2, et: 3, est: 3,
        ce: 1, cette: 2, ces: 2, qui: 2, que: 2, quoi: 2, dont: 2, où: 3, ou: 1,
        pour: 2, avec: 3, sans: 3, dans: 3, sur: 2, sous: 1, pas: 3, ne: 2, plus: 2,
        au: 2, aux: 2, en: 2, se: 1, mon: 2, ma: 2, mes: 2, ton: 1, ta: 1, tes: 1,
        son: 1, sa: 1, ses: 1, notre: 2, votre: 2, leur: 2, je: 3, tu: 2, il: 2,
        elle: 2, nous: 3, vous: 3, ils: 2, elles: 2, on: 1, me: 2, moi: 2, toi: 1,
        suis: 2, sommes: 2, êtes: 3, etes: 3, sont: 2, ai: 2, avons: 2, avez: 3,
        ont: 2, avoir: 2, être: 2, etre: 2, veux: 3, voudrais: 3, voudrait: 3,
        peux: 2, pouvez: 3, puis: 1, faut: 2, faire: 2, fais: 1, dit: 2, dire: 2,
        reste: 2, besoin: 2, aide: 2, merci: 3, bonjour: 3, salut: 2, svp: 3,
        plaît: 3, plait: 3, combien: 3, quel: 2, quelle: 2, comment: 2, pourquoi: 2,
        quand: 2, maintenant: 2, après: 2, apres: 2, avant: 1, tout: 2, tous: 2,
        rien: 2, bien: 1, très: 2, tres: 2, aussi: 2, mais: 2, donc: 1, alors: 1,
        oui: 2, non: 2, annuler: 2, confirmer: 2, argent: 2, compte: 2, solde: 3,
        frais: 3, facture: 3, crédit: 2, credit: 2, transfert: 2, historique: 3,
        langue: 2, français: 3, francais: 3, numéro: 2, numero: 2, chiffres: 2,
        montant: 2, envoi: 2, envoyer: 2, envoie: 2, sœur: 3, soeur: 3,
        frère: 3, frere: 3, mère: 2, mere: 2, père: 2, pere: 2, carte: 2, code: 2,
    },
    en: {
        the: 3, and: 2, is: 3, are: 3, was: 2, were: 2, be: 1, been: 1, am: 1,
        i: 3, you: 2, he: 2, she: 2, it: 2, we: 2, they: 2, my: 3, your: 3,
        his: 2, her: 2, our: 2, their: 2, this: 2, that: 2, these: 2, those: 2,
        what: 3, which: 2, who: 2, how: 3, much: 3, many: 3, want: 3, would: 3,
        like: 2, need: 2, send: 3, sent: 2, please: 3, thanks: 2, thank: 2,
        hello: 3, hi: 1, do: 1, does: 1, did: 1, not: 2, no: 1, can: 3, could: 3,
        will: 1, should: 2, have: 2, has: 2, of: 2, to: 3, in: 2, on: 2, at: 2,
        for: 3, from: 2, with: 3, about: 1, there: 2, here: 2, but: 2, or: 1,
        so: 1, if: 2, then: 1, all: 2, any: 1, some: 2, help: 2, tell: 2, know: 2,
        take: 1, takes: 1, cost: 2, costs: 2, enough: 2, left: 1, sister: 2,
        brother: 2, mother: 2, father: 2, balance: 3, fees: 3, fee: 3,
        history: 3, airtime: 3, bill: 3, account: 3, money: 2, transfer: 2,
        transaction: 2, today: 1, now: 1, number: 2, card: 2, code: 2,
    },
    fub: {
        mi: 3, a: 1, o: 2, ko: 3, e: 1, ka: 2, ngam: 3, woni: 3, alaa: 3,
        tan: 2, fof: 2, kadi: 2, jooni: 2, haa: 2, nde: 1, ɗum: 3, maa: 2,
        am: 3, ma: 2, makko: 3, men: 2, mo: 1, yimɓe: 3, neɗɗo: 3, gila: 2,
        sey: 2, hari: 2, tawi: 2, wano: 2, bana: 2, ceede: 3, njelu: 3,
        neldu: 3, neldugol: 3, neldunde: 3, keɓoowo: 3, njoɓdi: 3, njobdi: 3,
        kerdii: 2, fakture: 2, wallu: 2, wallude: 3, jam: 3, anndude: 3,
        keddiiɗe: 3, keddide: 3, yiɗi: 3, yidi: 3, fulfulde: 3,
        jaɓɓaama: 3, suɓo: 3, subo: 3, tabbitin: 3, haaytu: 2, waylu: 2,
        golle: 2, konte: 3, limgal: 3, moƴƴaani: 3, foti: 2, waawi: 3,
        seeɗa: 3, seeda: 3, banndiraawo: 3, heddii: 3, ndokkaani: 3,
        dokka: 1, lam: 3, tii: 1, winndu: 3, ndee: 2,
    },
};
const PHRASES = [
    // Français
    { language: 'fr', weight: 4, pattern: /\best[- ]ce qu/, cue: 'est-ce que' },
    { language: 'fr', weight: 4, pattern: /\bs'?il vous plait\b|\bsvp\b/, cue: "s'il vous plaît" },
    { language: 'fr', weight: 4, pattern: /\bje (voudrais|veux|souhaite)\b/, cue: 'je voudrais' },
    { language: 'fr', weight: 3, pattern: /\bje ne (sais|peux|comprends)\b/, cue: 'je ne sais' },
    { language: 'fr', weight: 3, pattern: /\bcombien (de|d'|coute|coûte|pour)\b/, cue: 'combien de' },
    { language: 'fr', weight: 3, pattern: /\bil me reste\b|\bqu'?il me reste\b/, cue: 'il me reste' },
    { language: 'fr', weight: 3, pattern: /\bmon compte\b|\bsur le compte\b/, cue: 'mon compte' },
    { language: 'fr', weight: 3, pattern: /\bpouvez[- ]vous\b/, cue: 'pouvez-vous' },
    { language: 'fr', weight: 3, pattern: /\bmerci (beaucoup|bien)\b/, cue: 'merci beaucoup' },
    { language: 'fr', weight: 3, pattern: /\bc'?est tout\b/, cue: "c'est tout" },
    // Anglais
    { language: 'en', weight: 4, pattern: /\bi'?d like\b|\bi would like\b/, cue: "i'd like" },
    { language: 'en', weight: 3, pattern: /\bi want to\b|\bi need to\b/, cue: 'i want to' },
    { language: 'en', weight: 4, pattern: /\bhow (much|many|long)\b/, cue: 'how much' },
    { language: 'en', weight: 3, pattern: /\bcan you\b|\bcould you\b/, cue: 'can you' },
    { language: 'en', weight: 3, pattern: /\bthere (is|are)\b/, cue: 'there is' },
    { language: 'en', weight: 3, pattern: /\bon my account\b|\bmy account\b/, cue: 'my account' },
    { language: 'en', weight: 3, pattern: /\b(thanks|thank you)[,. ]/, cue: 'thank you' },
    { language: 'en', weight: 3, pattern: /\bthat'?s all\b|\bthat is all\b/, cue: "that's all" },
    // Fulfulde
    { language: 'fub', weight: 4, pattern: /\bmi (yidi|yiɗi)\b/, cue: 'mi yiɗi' },
    { language: 'fub', weight: 3, pattern: /\bno foti\b/, cue: 'no foti' },
    { language: 'fub', weight: 4, pattern: /\bko woni\b|\bko won\b/, cue: 'ko woni' },
    { language: 'fub', weight: 4, pattern: /\ba waawi\b/, cue: 'a waawi' },
    { language: 'fub', weight: 3, pattern: /\bceede (am|maa|men)\b/, cue: 'ceede am' },
    { language: 'fub', weight: 3, pattern: /\be konte\b|\bkonte am\b/, cue: 'konte am' },
    { language: 'fub', weight: 3, pattern: /\bngam neldu/, cue: 'ngam neldugo' },
    { language: 'fub', weight: 3, pattern: /\ba jaaraama\b/, cue: 'a jaaraama' },
];
/** Lettres qui n'existent qu'en fulfulde (ou presque) : un seul signe suffit à trancher. */
const FULFULDE_LETTERS = /[ɓɗŋƴɛɔə]/u;
/** Accents français : indice faible, jamais décisif seul. */
const FRENCH_ACCENTS = /[éèêëàâçùûîïôœ]/u;
/** Élisions françaises (`j'ai`, `c'est`, `qu'il`, `l'argent`) après découpage à l'apostrophe. */
const FRENCH_ELISIONS = new Set(['j', 'c', 'l', 'd', 'qu', 'n', 's', 't', 'm']);
/** Suffixes morphologiques fulfulde, réservés aux formes non ambiguës avec le français. */
const FULFULDE_SUFFIXES = /(iiɗe|iɗe|ɗe|ɓe|nɗe|gol|ngal)$/u;
const MIN_SCORE = 3;
export function detectLanguage(text, fallback = 'fr') {
    const raw = String(text ?? '');
    const tokens = tokenize(raw);
    if (tokens.length === 0)
        return { language: fallback, confidence: 0, cues: [] };
    const normalized = normalize(raw);
    const scores = new Map();
    const cues = new Map();
    for (const language of ['fr', 'en', 'fub']) {
        scores.set(language, 0);
        cues.set(language, []);
    }
    const add = (language, points, cue) => {
        if (points <= 0)
            return;
        scores.set(language, (scores.get(language) ?? 0) + points);
        const list = cues.get(language);
        if (list && !list.includes(cue))
            list.push(cue);
    };
    for (const token of tokens) {
        for (const language of ['fr', 'en', 'fub']) {
            const weight = CUES[language][token];
            if (weight)
                add(language, weight, token);
        }
        // Morphologie : élision française, contraction anglaise, suffixe fulfulde.
        if (FRENCH_ELISIONS.has(token))
            add('fr', 1, `${token}'`);
        if (/'(s|t|ll|re|ve|d|m)$/.test(token))
            add('en', 2, `${token}`);
        if (FULFULDE_SUFFIXES.test(token))
            add('fub', 1, `-${token.slice(-3)}`);
    }
    for (const phrase of PHRASES) {
        if (phrase.pattern.test(normalized))
            add(phrase.language, phrase.weight, phrase.cue);
    }
    // Un caractère fulfulde est décisif : aucune autre langue de la sandbox ne l'écrit.
    if (FULFULDE_LETTERS.test(raw))
        add('fub', 6, 'ɓ ɗ ŋ ƴ');
    else if (FRENCH_ACCENTS.test(raw))
        add('fr', 1, 'accents');
    const ranked = ['fr', 'en', 'fub']
        .map((language) => ({ language, score: scores.get(language) ?? 0 }))
        .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const runnerUp = ranked[1];
    // Deux scores à égalité (ou presque) ne sont pas une détection : on garde la langue en cours.
    if (!best || !runnerUp || best.score < MIN_SCORE) {
        return { language: fallback, confidence: 0, cues: [] };
    }
    const decisive = best.score - runnerUp.score >= 2 || best.score >= runnerUp.score * 2;
    if (!decisive)
        return { language: fallback, confidence: 0, cues: [] };
    return {
        language: best.language,
        confidence: best.score,
        cues: (cues.get(best.language) ?? []).slice(0, 6),
    };
}
/**
 * Choisit la langue du tour : explicite > choix de l'utilisateur > détection > langue en cours.
 * `source` sert à ne pas écraser un choix explicite par une détection ultérieure.
 */
export function resolveTurnLanguage(options, text) {
    if (options.requested === 'fr' || options.requested === 'en' || options.requested === 'fub') {
        return { language: options.requested, source: 'turn', confidence: 3 };
    }
    if (options.source === 'user' && options.current) {
        return { language: options.current, source: 'user', confidence: 3 };
    }
    const guess = detectLanguage(text, options.current ?? 'fr');
    if (guess.confidence === 0) {
        return { language: options.current ?? 'fr', source: 'detected', confidence: 0 };
    }
    return { language: guess.language, source: 'detected', confidence: guess.confidence };
}
function normalize(text) {
    return String(text)
        .toLowerCase()
        .replace(/[’‘]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}
/** Découpe aussi sur l'apostrophe : `j'ai` → `j`, `ai` ; `c'est` → `c`, `est`. */
function tokenize(text) {
    return normalize(text)
        .split(/[^\p{L}']+/u)
        .flatMap((word) => word.split("'"))
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
}
