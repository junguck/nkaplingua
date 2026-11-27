import { afterEach, describe, expect, it } from 'vitest';
import { checkWordBase, clearWordBase, installWordBase, interpret } from '../src/index.js';

/**
 * La base de mots (data/langues.json côté passerelle) doit pouvoir AJOUTER une langue ou des mots
 * sans toucher au code, et REMPLACER le lexique intégré langue par langue sans régression.
 */

const ctx = { hintLang: 'fr' as const, knownNames: [] as string[] };

afterEach(() => clearWordBase());

describe('base de mots', () => {
  it('ajoute un mot d’intention et un alias : la phrase est comprise sans rebuild du lexique', () => {
    installWordBase({
      languages: { byv: { names: ['medumba'], functionWords: [['mbaŋ', 2]], intents: { TRANSFER: [['fʉ', 3]] } } },
    });
    const result = interpret('fʉ mbaŋ 5000', ctx);
    expect(result.intent).toBe('TRANSFER');
    expect(result.lang).toBe('byv');
    expect(result.slots.amount?.amount).toBe(5000);
  });

  it('« replace » fait foi : les mots intégrés de la langue ne comptent plus', () => {
    // « mbolo » (argent, dua) n'existe que dans le lexique intégré du duala.
    expect(interpret('mbolo', ctx).intent).toBe('CHECK_BALANCE');
    installWordBase({ languages: { dua: { replace: true, intents: { CHECK_BALANCE: [['musongi', 2]] } } } });
    expect(interpret('mbolo', ctx).intent).toBe('UNKNOWN');
    expect(interpret('musongi', ctx).intent).toBe('CHECK_BALANCE');
  });

  it('refuse une base invalide en entier, avec la raison', () => {
    const problems = checkWordBase({
      languages: {
        zzz: { intents: { TRANSFER: [['x', 3]] } },
        dua: { intents: { SOLD: [['x', 3]], TRANSFER: [['y', 9]] } },
      },
    });
    expect(problems.join('\n')).toContain('langue inconnue');
    expect(problems.join('\n')).toContain('intention inconnue');
    expect(problems.join('\n')).toContain('poids 9 hors de 1–5');
    expect(() => installWordBase({ languages: { zzz: { intents: {} } } })).toThrow(/base de mots refusée/);
  });

  it('une langue « replace » sans aucun mot est refusée (on ne vide pas une langue par accident)', () => {
    expect(checkWordBase({ languages: { dua: { replace: true } } }).join('\n')).toContain('serait vidée');
  });

  it('clearWordBase rend le lexique intégré intact', () => {
    installWordBase({ languages: { byv: { intents: { TRANSFER: [['fʉ', 3]] } } } });
    clearWordBase();
    expect(interpret('fʉ 5000', ctx).intent).toBe('UNKNOWN');
    expect(interpret('loma 5000', ctx).intent).toBe('TRANSFER');
  });
});
