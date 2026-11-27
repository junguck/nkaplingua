import { describe, expect, it } from 'vitest';
import { LATIN_RULES, NATIONAL_RULES, foldToGsm7, isGsm7, septetLength, ussdBudget, withOverrides } from '../src/index.ts';

describe('pliage GSM-7', () => {
  it('remplace les consonnes spéciales par des consonnes composées', () => {
    expect(foldToGsm7('ŋgɔ́ ɓe ɗaa ƙasa ƴaa')).toBe('nggò bhe dhaa khasa yhaa');
  });

  it('retire les tons de façon uniforme dans les langues nationales', () => {
    expect(foldToGsm7('Duálá')).toBe('Duala');
    expect(foldToGsm7('Mə̀dûmbà')).toBe('Meudumba');
    expect(foldToGsm7('Ghɔmálá')).toBe('Ghòmala');
  });

  it('garde les accents français déjà présents dans GSM-7', () => {
    expect(foldToGsm7('Numéro à recharger, reçu, très bientôt', LATIN_RULES)).toBe('Numéro à recharger, recu, très bientot');
  });

  it('produit toujours du GSM-7 pur et ne touche pas un texte ASCII', () => {
    const samples = ['mɔni a lig', 'Ɓasaá', 'njoɓdi', 'golle ɓennuɗe', 'Yɛmba', 'l’argent « vite »'];
    for (const sample of samples) expect(isGsm7(foldToGsm7(sample))).toBe(true);
    expect(foldToGsm7('Votre solde: 5 000 FCFA')).toBe('Votre solde: 5 000 FCFA');
  });

  it('distingue ɛ de e et ɔ de o au prix d’un seul septet', () => {
    expect(foldToGsm7('ɛ e ɔ o')).toBe('è e ò o');
    expect(septetLength(foldToGsm7('ɛɔ'))).toBe(2);
  });

  it('accepte des surcharges par langue (règles éditées dans le studio)', () => {
    const rules = withOverrides(NATIONAL_RULES, { ɛ: 'eh' });
    expect(foldToGsm7('Yɛmba', rules)).toBe('Yehmba');
  });
});

describe('budget USSD', () => {
  it('compte en septets : un euro en vaut deux', () => {
    expect(septetLength('10€')).toBe(4);
  });

  it('un seul caractère hors alphabet fait tomber la limite à 70', () => {
    const phrase = 'Mɔ́ni a lig: 5 000 FCFA. '.repeat(4);
    expect(ussdBudget(phrase).gsm7).toBe(false);
    expect(ussdBudget(phrase).limit).toBe(70);
    expect(ussdBudget(phrase).fits).toBe(false);
    const folded = foldToGsm7(phrase);
    expect(ussdBudget(folded)).toMatchObject({ gsm7: true, limit: 182, fits: true });
  });
});
