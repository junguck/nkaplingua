import { describe, expect, it } from 'vitest';
import { bubbleCardFor } from '../src';

describe('bulle — de l’événement natif à la fiche affichée', () => {
  it('écran lu : fiche en pidgin avec statut honnête', () => {
    const card = bubbleCardFor(
      { status: 'ok', packageName: 'com.android.chrome', lines: ['Montant : 5 000 FCFA', 'Frais : 50 FCFA', 'Total : 5 050 FCFA'] },
      'wes',
    );
    expect(card.title).toBe('Clear card');
    expect(card.rows).toEqual([
      { label: 'Haw moch moni', value: '5 000 FCFA' },
      { label: 'Charges', value: '50 FCFA' },
      { label: 'Ol togeda', value: '5 050 FCFA' },
    ]);
    expect(card.alerts[0]).toEqual({ level: 'info', text: 'Di count correct: moni + charges = total.' });
    expect(card.footer).toBe('Proposé · native speaker never check am yet');
  });

  it('appli hors liste : aucun contenu, seulement l’explication', () => {
    const card = bubbleCardFor({ status: 'not_allowed', packageName: 'com.whatsapp', lines: [] }, 'fr');
    expect(card.rows).toEqual([]);
    expect(card.alerts).toEqual([{ level: 'info', text: 'Par sécurité, je ne lis que les applications financières de votre liste.' }]);
  });

  it('service d’accessibilité éteint : dit comment l’activer', () => {
    expect(bubbleCardFor({ status: 'accessibility_off', packageName: null, lines: [] }, 'en').alerts[0]?.level).toBe('warning');
  });
});
