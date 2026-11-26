import { describe, expect, it } from 'vitest';
import { fold, scanNumbers } from '../src';

const amounts = (text: string): readonly number[] => scanNumbers(fold(text)).amounts;

describe('lecture des montants', () => {
  it.each([
    ['envoie 5000 à Paul', [5000]],
    ['envoie 25 000 FCFA', [25000]],
    ['25.000 frs', [25000]],
    ['5k', [5000]],
    ['5 mille', [5000]],
    ['cinq mille', [5000]],
    ['deux mille cinq cents', [2500]],
    ['quatre vingt mille', [80000]],
    ['send five thousand', [5000]],
    ['sen faiv tausand give Paul', [5000]],
    ['neldu ujineere jowi ka Fadimatou', [5000]],
    ['ujineere noogas e jowi', [25000]],
    ['ujineere 10', [10000]],
  ])('%s → %j', (text, expected) => {
    expect(amounts(text)).toEqual(expected);
  });

  it('distingue un numéro de téléphone d’un montant', () => {
    const scan = scanNumbers(fold('envoie 3000 au +237 6 90 00 00 01'));
    expect(scan.phones).toEqual(['690000001']);
    expect(scan.amounts).toEqual([3000]);
  });

  it('lit un chiffre seul comme un choix de menu', () => {
    expect(scanNumbers('2')).toEqual({ phones: [], amounts: [], choice: 2 });
  });

  it('recolle « go’o » (un) en fulfulde', () => {
    expect(amounts("ujineere go'o")).toEqual([1000]);
  });
});
