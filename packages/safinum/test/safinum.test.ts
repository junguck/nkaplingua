import { INTENTS } from '@nkap/contracts';
import { describe, expect, it } from 'vitest';
import { SAFINUM_INTENTS, officialFee, officialTotal, toContractStatus, toSafinumIntent } from '../src';

describe('@nkap/safinum — grille officielle (docs §4)', () => {
  it.each([
    [5_000, 5_050],
    [5_001, 5_151],
    [25_000, 25_150],
    [25_001, 25_401],
    [100_001, 101_001],
    [500_000, 505_000],
  ])('transfert %i → total %i', (amount, total) => {
    expect(officialTotal('transfer', amount)).toBe(total);
  });

  it('crédit gratuit, facture à 100, hors bornes = null (jamais deviné)', () => {
    expect(officialFee('airtime', 1_000)).toBe(0);
    expect(officialFee('bill', 7_500)).toBe(100);
    expect(officialFee('transfer', 500_001)).toBeNull();
    expect(officialFee('transfer', 0)).toBeNull();
    expect(officialFee('transfer', 10.5)).toBeNull();
  });
});

describe('@nkap/safinum — contrat de sortie', () => {
  it('toute intention du moteur devient une intention officielle', () => {
    for (const intent of INTENTS) expect(SAFINUM_INTENTS).toContain(toSafinumIntent(intent));
  });

  it('statut : cycle bancaire par défaut, comme le kit officiel ; mode `contract` en repli', () => {
    expect(toContractStatus('confirmed')).toBe('confirmed');
    expect(toContractStatus('cancelled')).toBe('cancelled');
    expect(toContractStatus('failed')).toBe('failed');
    expect(toContractStatus('confirmed', 'contract')).toBe('pending');
    expect(toContractStatus('cancelled', 'contract')).toBe('none');
  });
});
