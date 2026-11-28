/**
 * Les quatre langues de l'équipe (fulfulde, ewondo, pidgin, haoussa) doivent être comprises
 * sur les trois canaux conversationnels : le lexique est le même pour USSD, SMS et IVR.
 *
 * Ce test lit la base de mots LIVRÉE (`apps/gateway/data/langues.json`), l'installe dans le
 * moteur et vérifie des phrases qui ne sont pas dans le lexique TypeScript : ce sont bien les
 * mots ajoutés au fichier qui les font comprendre.
 */

import { describe, expect, it } from 'vitest';
import { installWordBase, interpret } from '@nkap/core';
import { checkDbProblems, readDb, toWordBase } from '../src/word-base.js';

const LOAD = readDb();
const DB = LOAD.db;
const REPORT = installWordBase(toWordBase(DB));

describe('lexique haoussa et pidgin livré', () => {
  it('la base de mots est acceptée en entier par le moteur', () => {
    expect(checkDbProblems(DB)).toEqual([]);
    expect(REPORT.languages).toContain('hau');
    expect(REPORT.languages).toContain('wes');
  });

  it('les quatre langues de l’équipe ont un lexique livré', () => {
    for (const code of ['fub', 'ewo', 'wes', 'hau'] as const) {
      const entry = DB.langues[code];
      expect(entry).toBeDefined();
      const words = Object.values(entry?.mots ?? {}).reduce((total, cues) => total + cues.length, 0);
      expect(words).toBeGreaterThan(0);
    }
  });

  it.each([
    ['hau', 'aika kudi 5000', 'TRANSFER'],
    ['hau', 'kudi nawa ya rage', 'CHECK_BALANCE'],
    ['hau', 'kudade', 'CHECK_FEES'],
    ['hau', 'taimaka', 'HELP'],
    ['wes', 'how much i get', 'CHECK_BALANCE'],
    ['wes', 'send money 5000', 'TRANSFER'],
    ['wes', 'pay bill', 'PAY_BILL'],
    ['wes', 'cancel', 'CANCEL'],
  ] as const)('%s : « %s » → %s', (lang, phrase, intent) => {
    expect(interpret(phrase, { hintLang: lang, knownNames: [] }).intent).toBe(intent);
  });
});
