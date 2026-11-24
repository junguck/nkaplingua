import { describe, expect, it } from 'vitest';
import { interpret } from '../src';

const ctx = { hintLang: 'fr' as const, knownNames: ['Paul Ndi', 'Paul Mbarga', 'Fadimatou Bouba', 'Maman'] };

describe('compréhension : intention + paramètres', () => {
  it.each([
    ['Quel est mon solde ?', 'CHECK_BALANCE', 'fr'],
    ['What is my balance?', 'CHECK_BALANCE', 'en'],
    ['Wetin be ma balans?', 'CHECK_BALANCE', 'wes'],
    ['Mi yiɗi anndude ceede am keddiiɗe', 'CHECK_BALANCE', 'fub'],
    ['Montre-moi mon historique', 'TX_HISTORY', 'fr'],
    ['Golle am ɓennuɗe', 'TX_HISTORY', 'fub'],
    ['Je veux retirer 10 000', 'WITHDRAW', 'fr'],
    ['I wan comot moni', 'WITHDRAW', 'wes'],
    ['Achète 1000 de crédit', 'BUY_AIRTIME', 'fr'],
    ['Payer ma facture ENEO', 'PAY_BILL', 'fr'],
  ])('%s → %s (%s)', (text, intent, lang) => {
    const r = interpret(text, ctx);
    expect(r.intent).toBe(intent);
    expect(r.lang).toBe(lang);
  });

  it('extrait montant et bénéficiaire, en fulfulde', () => {
    const r = interpret('Neldu ujineere jowi ka Fadimatou', { ...ctx, hintLang: 'fub' });
    expect(r.intent).toBe('TRANSFER');
    expect(r.lang).toBe('fub');
    expect(r.slots.amount).toEqual({ amount: 5000, currency: 'XAF' });
    expect(r.slots.recipientQuery).toBe('fadimatou');
  });

  it('comprend un énoncé qui mélange les langues', () => {
    const r = interpret('send 5000 a maman', ctx);
    expect(r.intent).toBe('TRANSFER');
    expect(r.slots.amount?.amount).toBe(5000);
    expect(r.slots.recipientQuery).toBe('maman');
  });

  it('« c’est quoi les frais » est une explication, pas un calcul', () => {
    const r = interpret("C'est quoi les frais ?", ctx);
    expect(r.intent).toBe('EXPLAIN_TERM');
    expect(r.slots.term).toBe('fees');
  });

  it('« combien de frais pour 25 000 » est un calcul de frais', () => {
    const r = interpret('Combien de frais pour envoyer 25 000 ?', ctx);
    expect(r.intent).toBe('CHECK_FEES');
    expect(r.slots.amount?.amount).toBe(25000);
  });

  it('« non, 3000 » est une correction, pas une annulation', () => {
    const r = interpret('Non, 3000', ctx);
    expect(r.isCorrection).toBe(true);
    expect(r.intent).toBe('UNKNOWN');
    expect(r.slots.amount?.amount).toBe(3000);
  });

  it('« pas 5000, plutôt 3000 » garde la dernière valeur', () => {
    expect(interpret('pas 5000, plutôt 3000', ctx).slots.amount?.amount).toBe(3000);
  });

  it('« parle-moi en fulfulde » change de langue', () => {
    const r = interpret('Parle-moi en fulfulde', ctx);
    expect(r.intent).toBe('CHANGE_LANGUAGE');
    expect(r.slots.targetLanguage).toBe('fub');
  });

  it('« eey » confirme, « ala » annule', () => {
    expect(interpret('Eey', ctx).intent).toBe('CONFIRM');
    expect(interpret('Ala', ctx).intent).toBe('CANCEL');
  });
});
