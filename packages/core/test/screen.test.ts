import { describe, expect, it } from 'vitest';
import { readScreen, renderScreenCard } from '../src';

/** Écrans typiques d'applis mobile money, tels que l'arbre d'accessibilité les restitue. */
const CONFIRM_SCREEN = ['Confirmer le transfert', 'Bénéficiaire', 'Paul Ndi (690000001)', 'Montant : 25 000 FCFA', 'Frais : 150 FCFA', 'Total à débiter', '25 150 FCFA', 'Confirmer', 'Annuler'];

describe('bulle — lecture ponctuelle d’un écran tiers', () => {
  it('extrait les valeurs étiquetées, libellé et valeur sur une ou deux lignes', () => {
    const r = readScreen(CONFIRM_SCREEN);
    expect(r).toMatchObject({
      kind: 'TRANSFER',
      amount: 25_000,
      fee: 150,
      total: 25_150,
      recipientName: 'Paul Ndi',
      recipientPhone: '690000001',
      totalCheck: 'ok',
    });
    expect(r.scam.suspicious).toBe(false);
  });

  it('signale un total qui ne correspond pas à montant + frais', () => {
    const r = readScreen(['Montant: 10 000 FCFA', 'Frais: 100 FCFA', 'Total: 11 100 FCFA']);
    expect(r.totalCheck).toBe('mismatch');
    const card = renderScreenCard(r, 'fub');
    expect(card.alerts[0]).toEqual({ level: 'danger', text: 'HAKKILO: ceede + njoɓdi fotaaki e fof. Taa tabbitin!' });
  });

  it('lit une phrase sans libellé sans inventer de frais', () => {
    const r = readScreen(['Vous allez envoyer 5 000 FCFA à Fadimatou Bouba.']);
    expect(r).toMatchObject({ kind: 'TRANSFER', amount: 5000, fee: null, total: null, recipientName: 'Fadimatou Bouba', totalCheck: 'unknown' });
  });

  it('frais gratuits = 0, pas « inconnu »', () => {
    expect(readScreen(['Recharge crédit', 'Montant 1 000 FCFA', 'Frais : Gratuit']).fee).toBe(0);
  });

  it('ignore les touches de clavier et les chiffres de menu', () => {
    const r = readScreen(['1', '2', '3', 'Solde disponible', '50 000 FCFA']);
    expect(r.amount).toBeNull();
    expect(r.balance).toBe(50_000);
  });

  it('détecte une arnaque au « transfert par erreur » avec demande de code', () => {
    const r = readScreen(["Bonjour, je vous ai envoyé par erreur 15 000 FCFA. Renvoyez l'argent et envoyez-moi le code reçu par SMS, c'est urgent."]);
    expect(r.scam.suspicious).toBe(true);
    expect(r.scam.reasons).toEqual(expect.arrayContaining(['askCode', 'urgency', 'mistakenTransfer']));
  });

  it('un conseil de sécurité n’est pas une arnaque', () => {
    expect(readScreen(['Ne partagez jamais votre code secret avec qui que ce soit, même un agent.']).scam.suspicious).toBe(false);
  });
});

describe('bulle — fiche claire multilingue à valeurs verrouillées', () => {
  it('rend les libellés dans la langue, recopie les valeurs à l’identique', () => {
    const card = renderScreenCard(readScreen(CONFIRM_SCREEN), 'fub');
    expect(card.title).toBe('Kaayit laaɓɗo');
    expect(card.rows).toEqual([
      { field: 'recipient', label: 'Mo heɓata ceede', value: 'Paul Ndi' },
      { field: 'phone', label: 'Limgal telefon', value: '690000001' },
      { field: 'amount', label: 'Keewal ceede', value: '25 000 FCFA' },
      { field: 'fee', label: 'Njoɓdi', value: '150 FCFA' },
      { field: 'total', label: 'Fof', value: '25 150 FCFA' },
    ]);
    expect(card.alerts.map((a) => a.text)).toEqual(['Hiisa ngan feewi: ceede + njoɓdi = fof.', 'Ndaar fof ado a tabbitinde.']);
    expect(card.status).toBe('proposed');
    expect(card.fallback).toBe(false);
  });

  it('les raisons d’arnaque sans forme nationale retombent sur le français, signalé', () => {
    const card = renderScreenCard(readScreen(['Félicitations, vous avez gagné 500 000 FCFA ! Payez 5 000 FCFA de frais de déblocage pour recevoir votre gain.']), 'wes');
    expect(card.alerts[0]).toEqual({ level: 'danger', text: 'DANGER: dis one fit be feyman bizness!' });
    expect(card.alerts.map((a) => a.text)).toContain('On vous demande de payer pour recevoir');
    expect(card.fallback).toBe(true);
  });

  it('écran vide : le dit, sans rien inventer', () => {
    const card = renderScreenCard(readScreen(['Accueil', 'Paramètres']), 'en');
    expect(card.rows).toEqual([]);
    expect(card.alerts).toEqual([{ level: 'info', text: 'I see no amount and no risky message on this screen.' }]);
  });
});

describe('sortie USSD GSM-7 (formatForChannel)', () => {
  it('translittère le fulfulde et tient en 182 septets', async () => {
    const { CHANNEL_PROFILES } = await import('@nkap/contracts');
    const { formatForChannel, isGsm7, gsm7Length } = await import('../src');
    const { harness } = await import('./helpers');
    const h = harness('fub');
    const r = await h.say('Neldu ujineere jowi ka Fadimatou', { channel: 'ussd' });
    const out = formatForChannel(r.reply, CHANNEL_PROFILES.ussd);
    expect(isGsm7(out)).toBe(true);
    expect(gsm7Length(out)).toBeLessThanOrEqual(182);
    expect(out).toContain('5 000 FCFA');
    expect(r.trace.response).toBe(out);
  });
});
