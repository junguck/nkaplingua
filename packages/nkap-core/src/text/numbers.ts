/**
 * Lecture des montants et numéros dans une phrase libre, chiffres ou lettres,
 * en français, anglais, pidgin et fulfulde.
 *
 * Fulfulde : le multiplicateur précède le nombre (« ujineere jowi » = mille × cinq = 5 000),
 * « e » relie les composants (« ujineere noogas e jowi » = 25 000).
 */
import { tokenize } from './normalize';

interface NumberWord {
  readonly value: number;
  readonly multiplier: boolean;
}

const WORDS: Readonly<Record<string, NumberWord>> = Object.freeze({
  // français
  un: { value: 1, multiplier: false }, une: { value: 1, multiplier: false }, deux: { value: 2, multiplier: false },
  trois: { value: 3, multiplier: false }, quatre: { value: 4, multiplier: false }, cinq: { value: 5, multiplier: false },
  six: { value: 6, multiplier: false }, sept: { value: 7, multiplier: false }, huit: { value: 8, multiplier: false },
  neuf: { value: 9, multiplier: false }, dix: { value: 10, multiplier: false }, onze: { value: 11, multiplier: false },
  douze: { value: 12, multiplier: false }, quinze: { value: 15, multiplier: false }, vingt: { value: 20, multiplier: false },
  vingts: { value: 20, multiplier: false }, trente: { value: 30, multiplier: false }, quarante: { value: 40, multiplier: false },
  cinquante: { value: 50, multiplier: false }, soixante: { value: 60, multiplier: false },
  cent: { value: 100, multiplier: true }, cents: { value: 100, multiplier: true }, mille: { value: 1000, multiplier: true },
  million: { value: 1_000_000, multiplier: true }, millions: { value: 1_000_000, multiplier: true },
  // anglais
  one: { value: 1, multiplier: false }, two: { value: 2, multiplier: false }, three: { value: 3, multiplier: false },
  four: { value: 4, multiplier: false }, five: { value: 5, multiplier: false }, seven: { value: 7, multiplier: false },
  eight: { value: 8, multiplier: false }, nine: { value: 9, multiplier: false }, ten: { value: 10, multiplier: false },
  twenty: { value: 20, multiplier: false }, thirty: { value: 30, multiplier: false }, forty: { value: 40, multiplier: false },
  fifty: { value: 50, multiplier: false }, hundred: { value: 100, multiplier: true }, thousand: { value: 1000, multiplier: true },
  // pidgin (homographes ambigus exclus : « tu », « fo », « et »)
  wan: { value: 1, multiplier: false }, tri: { value: 3, multiplier: false }, faiv: { value: 5, multiplier: false },
  siks: { value: 6, multiplier: false }, sevin: { value: 7, multiplier: false }, nain: { value: 9, multiplier: false },
  twenti: { value: 20, multiplier: false }, ondred: { value: 100, multiplier: true }, tausand: { value: 1000, multiplier: true },
  tosan: { value: 1000, multiplier: true },
  // fulfulde (formes repliées : ɗiɗi → didi)
  goo: { value: 1, multiplier: false }, didi: { value: 2, multiplier: false }, tati: { value: 3, multiplier: false },
  nay: { value: 4, multiplier: false }, nayi: { value: 4, multiplier: false }, jowi: { value: 5, multiplier: false },
  joweego: { value: 6, multiplier: false }, joweedidi: { value: 7, multiplier: false }, joweetati: { value: 8, multiplier: false },
  joweenay: { value: 9, multiplier: false }, sappo: { value: 10, multiplier: false }, noogas: { value: 20, multiplier: false },
  temerre: { value: 100, multiplier: true }, teemerre: { value: 100, multiplier: true },
  ujineere: { value: 1000, multiplier: true }, ujunere: { value: 1000, multiplier: true },
});

const CONNECTORS = new Set(['e', 'et', 'and']);
const FUB_MULTIPLIERS = new Set(['temerre', 'teemerre', 'ujineere', 'ujunere']);
const SUFFIX_THOUSAND = '(?:k|mille|thousand|tausand|tosan)';

const PHONE_RE = /(?:\+?\s?237[\s.-]?)?(?<![\d])6(?:[\s.-]?\d){8}(?![\d])/g;
const DIGIT_AMOUNT_RE = new RegExp(
  `(?<![\\d])(\\d{1,3}(?:[ .,]\\d{3})+|\\d+)(?:\\s?${SUFFIX_THOUSAND}(?![a-z]))?|(?:ujineere|ujunere)\\s(\\d+)`,
  'g',
);

export interface NumberScan {
  readonly phones: readonly string[];
  readonly amounts: readonly number[];
  /** Un chiffre seul (1 à 9) : réponse à un menu, pas un montant. */
  readonly choice: number | null;
}

/** Montant minimal pour qu'un nombre isolé soit lu comme une somme d'argent. */
const MIN_AMOUNT = 10;

export function scanNumbers(folded: string): NumberScan {
  const trimmed = folded.trim();
  if (/^[1-9]$/.test(trimmed)) return { phones: [], amounts: [], choice: Number(trimmed) };

  const phones: string[] = [];
  // « go'o » (un) est replié en « go o » : on recolle l'occlusive glottale.
  const glued = folded.replace(/(^|\s)go o(?=\s|$)/g, '$1goo');
  const withoutPhones = glued.replace(PHONE_RE, (match) => {
    phones.push(match.replace(/\D/g, '').slice(-9));
    return ' ';
  });

  const found: Array<{ at: number; value: number }> = [];
  const withoutDigits = withoutPhones.replace(DIGIT_AMOUNT_RE, (match: string, grouped: string | undefined, afterFub: string | undefined, at: number) => {
    const value = afterFub !== undefined ? Number(afterFub) * 1000 : parseDigitAmount(match, grouped ?? '');
    if (value >= MIN_AMOUNT) found.push({ at, value });
    return ' '.repeat(match.length);
  });

  for (const run of wordRuns(withoutDigits)) {
    const value = parseWordRun(run.words);
    if (value !== null && value >= MIN_AMOUNT) found.push({ at: run.at, value });
  }

  found.sort((a, b) => a.at - b.at);
  return { phones, amounts: found.map((f) => f.value), choice: null };
}

function parseDigitAmount(match: string, grouped: string): number {
  const base = Number(grouped.replace(/[ .,]/g, ''));
  const hasThousandSuffix = new RegExp(`${SUFFIX_THOUSAND}$`).test(match.trim());
  return hasThousandSuffix ? base * 1000 : base;
}

function wordRuns(text: string): Array<{ at: number; words: string[] }> {
  const runs: Array<{ at: number; words: string[] }> = [];
  let current: { at: number; words: string[] } | null = null;
  let offset = 0;
  for (const token of tokenize(text)) {
    const at = text.indexOf(token, offset);
    offset = at + token.length;
    const isNumber = token in WORDS;
    const isConnector = CONNECTORS.has(token) && current !== null;
    if (isNumber || isConnector) {
      current ??= { at, words: [] };
      current.words.push(token);
    } else if (current) {
      runs.push(current);
      current = null;
    }
  }
  if (current) runs.push(current);
  return runs.map((r) => ({ at: r.at, words: trimConnectors(r.words) })).filter((r) => r.words.length > 0);
}

function trimConnectors(words: string[]): string[] {
  const out = [...words];
  while (out.length > 0 && CONNECTORS.has(out[out.length - 1] ?? '')) out.pop();
  return out;
}

function parseWordRun(words: readonly string[]): number | null {
  const first = words[0];
  if (first === undefined) return null;
  return FUB_MULTIPLIERS.has(first) ? parseMultiplierFirst(words) : parseMultiplierLast(words);
}

/** Ordre français/anglais/pidgin : « deux mille cinq cents », « faiv tausand ». */
function parseMultiplierLast(words: readonly string[]): number | null {
  let total = 0;
  let current = 0;
  for (const word of words) {
    const entry = WORDS[word];
    if (!entry) continue;
    if (!entry.multiplier) {
      current = current === 4 && entry.value === 20 ? 80 : current + entry.value;
    } else if (entry.value === 100) {
      current = (current || 1) * 100;
    } else {
      total += (current || 1) * entry.value;
      current = 0;
    }
  }
  const value = total + current;
  return value > 0 ? value : null;
}

/** Ordre fulfulde : « ujineere jowi » = 5 000, « ujineere noogas e jowi » = 25 000. */
function parseMultiplierFirst(words: readonly string[]): number | null {
  let total = 0;
  let multiplier = 1;
  let count = 0;
  const flush = (): void => {
    total += multiplier * (count || 1);
    multiplier = 1;
    count = 0;
  };
  for (const word of words) {
    if (CONNECTORS.has(word)) continue;
    const entry = WORDS[word];
    if (!entry) continue;
    if (entry.multiplier) {
      if (multiplier !== 1 || count !== 0) flush();
      multiplier = entry.value;
    } else {
      count += entry.value;
    }
  }
  flush();
  return total > 0 ? total : null;
}
