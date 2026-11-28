/**
 * Compréhension de la saisie libre : lexique pondéré (Mongo `lexicon`, alimenté par le studio),
 * extraction de montant, de numéro, et détection d'une demande de changement de langue.
 *
 * Principe : en finance, ne jamais deviner. Un score faible ou une égalité -> on demande.
 */

import { NATIONAL_RULES, foldToGsm7, type Language, type LexiconDoc, type LexiconIntent } from '@nkap/lingua-core';

export function normalize(text: string): string {
  return foldToGsm7(text, NATIONAL_RULES)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface CompiledTerm {
  readonly tokens: readonly string[];
  readonly prefix: boolean;
  readonly intent: LexiconIntent;
  readonly weight: number;
}

export class Lexicon {
  readonly #terms: readonly CompiledTerm[];

  constructor(docs: Iterable<Pick<LexiconDoc, 'intent' | 'term' | 'weight'>>) {
    const terms: CompiledTerm[] = [];
    for (const doc of docs) {
      const prefix = doc.term.endsWith('*');
      const tokens = normalize(prefix ? doc.term.slice(0, -1) : doc.term).split(' ').filter(Boolean);
      if (tokens.length > 0) terms.push({ tokens, prefix, intent: doc.intent, weight: doc.weight });
    }
    this.#terms = terms;
  }

  get size(): number {
    return this.#terms.length;
  }

  /** Intention gagnante si elle est nette (score >= 2 et sans ex aequo), sinon `null`. */
  intent(text: string): { readonly intent: LexiconIntent; readonly score: number; readonly matched: readonly string[] } | null {
    const tokens = normalize(text).split(' ').filter(Boolean);
    const scores = new Map<LexiconIntent, number>();
    const matched: string[] = [];
    for (const term of this.#terms) {
      if (!occurs(tokens, term)) continue;
      scores.set(term.intent, (scores.get(term.intent) ?? 0) + term.weight);
      matched.push(term.tokens.join(' '));
    }
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const best = ranked[0];
    if (best === undefined || best[1] < 2) return null;
    const tied = ranked.filter(([, score]) => score === best[1]).map(([intent]) => intent);
    // Une question sur un mot (« c'est quoi les frais ») est plus précise que le mot lui-même.
    if (tied.length > 1) return tied.includes('TERM_EXPLANATION') ? { intent: 'TERM_EXPLANATION', score: best[1], matched } : null;
    return { intent: best[0], score: best[1], matched };
  }

  /** Mots de la saisie qui ne relèvent pas du lexique (servent à chercher un bénéficiaire). */
  leftover(text: string): string {
    const tokens = normalize(text).split(' ').filter(Boolean);
    const used = new Set<number>();
    for (const term of this.#terms) {
      for (let i = 0; i + term.tokens.length <= tokens.length; i += 1) {
        if (matchesAt(tokens, i, term)) for (let j = 0; j < term.tokens.length; j += 1) used.add(i + j);
      }
    }
    return tokens.filter((token, i) => !used.has(i) && !STOPWORDS.has(token) && !/\d/.test(token)).join(' ');
  }
}

const STOPWORDS = new Set(['a', 'au', 'pour', 'de', 'du', 'des', 'la', 'le', 'les', 'mon', 'ma', 'mes', 'je', 'veux', 'voudrais', 'to', 'for', 'my', 'i', 'want', 'please', 'stp', 'svp', 'fcfa', 'cfa', 'xaf', 'francs', 'f', 'k', 'mille']);

function matchesAt(tokens: readonly string[], at: number, term: CompiledTerm): boolean {
  for (let j = 0; j < term.tokens.length; j += 1) {
    const token = tokens[at + j];
    const want = term.tokens[j];
    if (token === undefined || want === undefined) return false;
    const last = j === term.tokens.length - 1;
    if (last && term.prefix ? !token.startsWith(want) : token !== want) return false;
  }
  return true;
}

function occurs(tokens: readonly string[], term: CompiledTerm): boolean {
  for (let i = 0; i + term.tokens.length <= tokens.length; i += 1) if (matchesAt(tokens, i, term)) return true;
  return false;
}

/** "5000", "5 000", "5.000", "5k", "5 mille" -> 5000. Les numéros de téléphone sont exclus. */
export function parseAmount(text: string): number | null {
  const cleaned = text.toLowerCase().replace(/(\d)[\s.,](?=\d{3}\b)/g, '$1');
  const match = cleaned.match(/(?<![\d+])(\d{1,7})(?:\s*(k|mille)\b)?(?!\d)/);
  if (match === null || match[1] === undefined) return null;
  const base = Number(match[1]);
  const value = match[2] === undefined ? base : base * 1000;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** "699000002", "+237 699 00 00 02" -> "237699000002". */
export function parsePhone(text: string): string | null {
  const match = text.match(/(?<!\d)(?:\+?237[\s.]?)?6(?:[\s.]?\d){8}(?!\d)/);
  if (match === null) return null;
  const digits = match[0].replace(/\D+/g, '');
  return digits.startsWith('237') ? digits : `237${digits}`;
}

export const LANGUAGE_NAMES: Readonly<Record<Language, { readonly native: string; readonly aliases: readonly string[] }>> = {
  fr: { native: 'Français', aliases: ['francais', 'french'] },
  en: { native: 'English', aliases: ['english', 'anglais'] },
  dua: { native: 'Duala', aliases: ['duala', 'douala'] },
  ewo: { native: 'Ewondo', aliases: ['ewondo', 'yaounde'] },
  bas: { native: 'Basaa', aliases: ['basaa', 'bassa'] },
  bbj: { native: 'Ghomala', aliases: ['ghomala', 'ghomalah'] },
  byv: { native: 'Medumba', aliases: ['medumba', 'meudumba'] },
  fub: { native: 'Fulfulde', aliases: ['fulfulde', 'foulfoulde', 'peul', 'fulbe'] },
  hau: { native: 'Hausa', aliases: ['hausa', 'haoussa'] },
  bum: { native: 'Bulu', aliases: ['bulu', 'boulou'] },
  wes: { native: 'Pidgin', aliases: ['pidgin', 'kamtok'] },
  ybb: { native: 'Yemba', aliases: ['yemba'] },
};

export function detectLanguageSwitch(text: string): Language | null {
  const tokens = new Set(normalize(text).split(' '));
  for (const [code, info] of Object.entries(LANGUAGE_NAMES) as [Language, (typeof LANGUAGE_NAMES)[Language]][]) {
    if (info.aliases.some((alias) => tokens.has(alias))) return code;
  }
  return null;
}

/** Graine minimale si Mongo est vide : le vrai lexique vient de la base. */
export const SEED_LEXICON: readonly Pick<LexiconDoc, 'intent' | 'term' | 'weight'>[] = [
  { intent: 'BALANCE_INQUIRY', term: 'solde', weight: 3 },
  { intent: 'BALANCE_INQUIRY', term: 'combien j ai', weight: 3 },
  { intent: 'BALANCE_INQUIRY', term: 'balance', weight: 3 },
  { intent: 'TRANSFER', term: 'envo*', weight: 3 },
  { intent: 'TRANSFER', term: 'transf*', weight: 3 },
  { intent: 'TRANSFER', term: 'send', weight: 3 },
  { intent: 'FEE_INQUIRY', term: 'frais', weight: 3 },
  { intent: 'FEE_INQUIRY', term: 'fee*', weight: 3 },
  { intent: 'TRANSACTION_HISTORY', term: 'historique', weight: 3 },
  { intent: 'TRANSACTION_HISTORY', term: 'history', weight: 3 },
  { intent: 'AIRTIME_PURCHASE', term: 'credit', weight: 2 },
  { intent: 'AIRTIME_PURCHASE', term: 'recharge*', weight: 3 },
  { intent: 'AIRTIME_PURCHASE', term: 'airtime', weight: 3 },
  { intent: 'BILL_PAYMENT', term: 'facture', weight: 3 },
  { intent: 'BILL_PAYMENT', term: 'bill', weight: 3 },
  { intent: 'TERM_EXPLANATION', term: 'c est quoi', weight: 3 },
  { intent: 'TERM_EXPLANATION', term: 'que veut dire', weight: 3 },
  { intent: 'TERM_EXPLANATION', term: 'what is', weight: 3 },
  { intent: 'CONFIRM', term: 'oui', weight: 3 },
  { intent: 'CONFIRM', term: 'yes', weight: 3 },
  { intent: 'CONFIRM', term: 'confirm*', weight: 3 },
  { intent: 'CANCEL', term: 'annul*', weight: 3 },
  { intent: 'CANCEL', term: 'cancel', weight: 3 },
  { intent: 'CANCEL', term: 'non', weight: 2 },
];

export type TermId = 'fee' | 'limit' | 'beneficiary';

export function detectTerm(text: string): TermId | null {
  const n = ` ${normalize(text)} `;
  if (/ (frais|fee|fees|commission) /.test(n)) return 'fee';
  if (/ (plafond|limit|limite) /.test(n)) return 'limit';
  if (/ (beneficiaire|beneficiary) /.test(n)) return 'beneficiary';
  return null;
}
