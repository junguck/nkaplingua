import { describe, expect, it } from 'vitest';
import { LANGUAGES, LANGUAGE_INFO } from '@nkap/contracts';
import { detectLanguage, renderPart } from '../src';
import { message } from '../src/dialogue/plan';

describe('haoussa (en cours : repli français tant que le lexique n’est pas complet)', () => {
  it('est une langue du contrat, nationale, sans voix système', () => {
    expect(LANGUAGES).toContain('hau');
    expect(LANGUAGE_INFO.hau).toMatchObject({ isNational: true, sttLocale: null });
  });

  it('reconnaît une phrase haoussa distinctive', () => {
    expect(detectLanguage('Ina so in aika kuɗi zuwa asusu', 'fr').lang).toBe('hau');
  });

  it('sert le français et le signale quand la traduction n’existe pas, valeurs verrouillées intactes', () => {
    const r = renderPart(message('greet.hello', { NAME: 'Awa' }), 'hau');
    expect(r.fallback).toBe(true);
    expect(r.integrity).toBe(true);
    expect(r.text).toContain('Awa');
  });
});
