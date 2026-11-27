import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INTENTS, ussdBudget } from '@nkap/lingua-core';
import { harness, say, type Harness } from './helpers.ts';

let h: Harness;
beforeEach(async () => {
  h = await harness();
});
afterEach(async () => {
  await h.close();
});

describe('USSD : contrat', () => {
  it('le menu tient dans 182 septets GSM-7 et déclare une intention de la liste', async () => {
    const r = await h.turn({});
    expect(ussdBudget(r.response.text)).toMatchObject({ gsm7: true, fits: true });
    expect(INTENTS).toContain(r.interpretation.intent);
    expect(r.interpretation.language).toBe('fr');
    expect(r.response.options).toHaveLength(8);
  });

  it('recopie le X-Trace-Id sur chaque appel bancaire', async () => {
    await h.turn({});
    await h.turn({ trace_id: 'trace-solde', ...say('1') });
    const call = h.bank.calls.at(-1);
    expect(call).toMatchObject({ method: 'GET', path: '/accounts/237699000001', traceId: 'trace-solde' });
  });

  it('solde : montant exact du compte, en fin de session', async () => {
    await h.turn({});
    const r = await h.turn(say('1'));
    expect(r.interpretation.intent).toBe('BALANCE_INQUIRY');
    expect(r.response.text).toContain('100 000 FCFA');
    expect(r.response.end_session).toBe(true);
  });
});

describe('USSD : transfert en deux tours', () => {
  it('crée au tour N, relit frais et total, confirme au tour N+1 seulement', async () => {
    await h.turn({});
    await h.turn(say('2'));
    await h.turn(say('677000001'));
    const recap = await h.turn(say('5001'));
    expect(recap.interpretation.intent).toBe('TRANSFER');
    expect(recap.transaction.status).toBe('pending');
    expect(recap.response.text).toContain('Frais 150 FCFA');
    expect(recap.response.text).toContain('Total 5 151 FCFA');
    expect(h.bank.calls.filter((c) => c.path.endsWith('/confirm'))).toHaveLength(0);

    const done = await h.turn(say('1'));
    expect(done.interpretation.intent).toBe('CONFIRM');
    expect(done.transaction).toEqual({ id: recap.transaction.id, status: 'confirmed' });
    expect(h.bank.accounts.get('237699000001')?.balance).toBe(100_000 - 5151);
  });

  it('comprend une phrase libre : « envoie 5000 à 677000001 »', async () => {
    await h.turn({});
    const r = await h.turn(say('envoie 5000 à 677000001'));
    expect(r.interpretation.intent).toBe('TRANSFER');
    expect(r.transaction.status).toBe('pending');
    expect(r.response.text).toContain('Paul Mbarga');
  });

  it('homonymes : demande une précision, ne choisit jamais', async () => {
    await h.turn({});
    await h.turn(say('2'));
    const r = await h.turn(say('paul'));
    expect(r.interpretation.intent).toBe('CLARIFICATION_NEEDED');
    expect(r.response.options.length).toBe(2);
    expect(h.bank.calls.some((c) => c.path === '/transactions')).toBe(false);
  });

  it('correction avant confirmation : frais recalculés et nouvelle relecture', async () => {
    await h.turn({});
    await h.turn(say('envoie 5000 a 677000001'));
    const fix = await h.turn(say('non plutot 30000'));
    expect(fix.interpretation.intent).toBe('CORRECTION');
    expect(fix.response.text).toContain('Frais 400 FCFA');
    expect(fix.response.text).toContain('Total 30 400 FCFA');
    expect(fix.transaction.status).toBe('pending');
  });

  it('solde insuffisant : expliqué dans la langue, avec une issue, jamais le code brut', async () => {
    await h.turn({ phone: '237655000004' });
    await h.turn({ phone: '237655000004', ...say('2') });
    await h.turn({ phone: '237655000004', ...say('677000001') });
    const r = await h.turn({ phone: '237655000004', ...say('5000') });
    expect(r.response.text).not.toContain('INSUFFICIENT_FUNDS');
    expect(r.response.text).toContain('Solde insuffisant');
    expect(r.response.end_session).toBe(false);
  });

  it('changement de langue en pleine relecture : écran rejoué en anglais, opération conservée', async () => {
    await h.turn({});
    const recap = await h.turn(say('envoie 5000 a 677000001'));
    const en = await h.turn(say('english'));
    expect(en.interpretation).toMatchObject({ intent: 'LANGUAGE_SWITCH', language: 'en' });
    expect(en.response.text).toContain('Send 5 000 FCFA to Paul Mbarga');
    expect(en.transaction).toEqual({ id: recap.transaction.id, status: 'pending' });
    const done = await h.turn(say('1'));
    expect(done.interpretation.language).toBe('en');
    expect(done.transaction.status).toBe('confirmed');
  });

  it('annulation universelle par 0 : rien n’est débité', async () => {
    await h.turn({});
    await h.turn(say('envoie 5000 a 677000001'));
    const r = await h.turn(say('0'));
    expect(r.interpretation.intent).toBe('CANCEL');
    expect(r.transaction.status).toBe('cancelled');
    expect(h.bank.accounts.get('237699000001')?.balance).toBe(100_000);
  });
});

describe('USSD : autres parcours', () => {
  it('frais : appelle GET /fees et annonce la grille exacte', async () => {
    await h.turn({});
    await h.turn(say('5'));
    const r = await h.turn(say('25001'));
    expect(r.interpretation.intent).toBe('FEE_INQUIRY');
    expect(r.response.text).toContain('frais 400 FCFA');
    expect(h.bank.calls.some((c) => c.path === '/fees')).toBe(true);
  });

  it('crédit vers un autre numéro, opérateur déduit par la banque', async () => {
    await h.turn({});
    await h.turn(say('3'));
    await h.turn(say('2'));
    await h.turn(say('699000002'));
    const r = await h.turn(say('1000'));
    expect(r.interpretation.intent).toBe('AIRTIME_PURCHASE');
    expect(r.response.text).toContain('ORANGE');
  });

  it('terme financier expliqué simplement', async () => {
    await h.turn({});
    const r = await h.turn(say("c'est quoi les frais"));
    expect(r.interpretation.intent).toBe('TERM_EXPLANATION');
    expect(r.response.text).toContain('ce que la banque prend');
  });

  it('SMS sans session : le premier message est compris directement', async () => {
    const r = await h.turn({ channel: 'sms', ...say('solde') });
    expect(r.interpretation.intent).toBe('BALANCE_INQUIRY');
  });
});

describe('Langue déclarée honnête', () => {
  it('langue demandée sans catalogue : réponse en français déclarée fr', async () => {
    const r = await h.turn({ language: 'dua' });
    expect(r.interpretation.language).toBe('fr');
  });

  it('langue servie : déclarée et appliquée', async () => {
    const r = await h.turn({ language: 'en' });
    expect(r.interpretation.language).toBe('en');
    expect(r.response.text).toContain('Choose');
  });

  it('langue nationale validée à chaud : pliée en GSM-7 dans le budget', async () => {
    for (const ref of ['menu.title', 'menu.balance', 'menu.transfer', 'menu.airtime', 'menu.bill', 'menu.fees', 'menu.history', 'menu.language', 'menu.help']) {
      h.catalog.set({ key: ref, lang: 'ewo', text: `Mɔ́ni ŋkɔ́ ${ref.split('.')[1] ?? ''}` });
    }
    const r = await h.turn({ language: 'ewo' });
    expect(r.interpretation.language).toBe('ewo');
    expect(r.response.text).toContain('Mòni ngkò');
    expect(ussdBudget(r.response.text)).toMatchObject({ gsm7: true, fits: true });
  });
});
