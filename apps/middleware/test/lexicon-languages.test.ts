/**
 * Les quatre langues de l'équipe (fulfulde, ewondo, pidgin, haoussa) doivent être
 * comprises sur les trois canaux conversationnels. La compréhension ne dépend pas du canal :
 * c'est le même lexique pour USSD, SMS et IVR. Ce test lit la base de mots livrée.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LexiconDoc, LexiconIntent } from '@nkap/lingua-core';
import { Lexicon } from '../src/understand.ts';

interface LegacyFile {
  langues: Record<string, { mots?: Record<string, [string, number][]> }>;
}

const LEGACY: Record<string, LexiconIntent> = {
  CHECK_BALANCE: 'BALANCE_INQUIRY',
  TRANSFER: 'TRANSFER',
  CHECK_FEES: 'FEE_INQUIRY',
  TX_HISTORY: 'TRANSACTION_HISTORY',
  BUY_AIRTIME: 'AIRTIME_PURCHASE',
  PAY_BILL: 'BILL_PAYMENT',
  EXPLAIN_TERM: 'TERM_EXPLANATION',
};

function docs(): LexiconDoc[] {
  const raw = JSON.parse(readFileSync(new URL('../../../apps/gateway/data/langues.json', import.meta.url), 'utf8')) as LegacyFile;
  const out: LexiconDoc[] = [];
  for (const [lang, entry] of Object.entries(raw.langues)) {
    for (const [legacy, terms] of Object.entries(entry.mots ?? {})) {
      const intent = LEGACY[legacy];
      if (intent === undefined) continue;
      for (const [term, weight] of terms) out.push({ lang: lang as LexiconDoc['lang'], intent, term, weight });
    }
  }
  return out;
}

describe('compréhension des langues de l’équipe', () => {
  it.each([
    ['fub', 'neldi mi 5000', 'TRANSFER'],
    ['fub', 'njoɓdi', 'FEE_INQUIRY'],
    ['ewo', 'lom moni 5000', 'TRANSFER'],
    ['wes', 'abeg how much i get', 'BALANCE_INQUIRY'],
    ['wes', 'send money 5000', 'TRANSFER'],
    ['hau', 'aika kudi 5000', 'TRANSFER'],
    ['hau', 'kudi nawa ya rage', 'BALANCE_INQUIRY'],
  ] as const)('%s : « %s » → %s', (lang, phrase, intent) => {
    const docsForLang = docs().filter((doc) => doc.lang === lang);
    expect(docsForLang.length).toBeGreaterThan(0);
    expect(new Lexicon(docsForLang).intent(phrase)?.intent).toBe(intent);
  });

  it('les quatre langues de l’équipe ont un lexique livré', () => {
    const langs = new Set(docs().map((doc) => doc.lang));
    for (const code of ['fub', 'ewo', 'wes', 'hau'] as const) expect(langs.has(code)).toBe(true);
  });
});
