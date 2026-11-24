import { describe, expect, it } from 'vitest';
import { harness } from './helpers';

/**
 * Les dix scénarios standardisés du règlement (§7), joués de bout en bout :
 * énoncé → compréhension → dialogue → système financier → réponse dans la langue → trace jury.
 */
describe('§7 — scénarios standardisés du jury', () => {
  it('1. Consultation du solde : le solde exact est retourné (fulfulde)', async () => {
    const h = harness('fub');
    const r = await h.say('Mi yiɗi anndude ceede am keddiiɗe');
    expect(r.interpretation.intent).toBe('CHECK_BALANCE');
    expect(r.reply.text).toBe('Ceede maa keddiiɗe: 50 000 FCFA.');
    expect(r.trace.validation.integrity).toBe(true);
  });

  it('2. Transfert : montant et bénéficiaire identifiés, puis exécution confirmée (pidgin)', async () => {
    const h = harness('wes');
    const r1 = await h.say('Abeg sen faiv tausand give Fadimatou');
    expect(r1.stage).toBe('confirming');
    expect(r1.reply.card).toMatchObject({ amount: 5000, fee: 50, total: 5050, recipientName: 'Fadimatou Bouba', recipientPhone: '699000003' });
    expect(r1.reply.parts[0]).toBe('You dey sen 5 000 FCFA give Fadimatou Bouba, fon nomba 699000003.');

    const r2 = await h.say('Yes');
    expect(r2.trace.status).toBe('executed');
    expect(r2.reply.card?.balanceAfter).toBe(44_950);
    expect(r2.reply.text).toContain('44 950 FCFA');
  });

  it('3. Consultation des frais : frais et total expliqués', async () => {
    const h = harness();
    const r = await h.say('Combien de frais pour envoyer 25 000 ?');
    expect(r.reply.text).toBe('Pour 25 000 FCFA, les frais sont de 375 FCFA. Total : 25 375 FCFA.');
    expect(r.trace.params).toMatchObject({ amount: 25000, fee: 375, total: 25375 });
  });

  it('4. Historique : les opérations récentes sont restituées', async () => {
    const h = harness();
    const r = await h.say('Montre-moi mon historique');
    expect(r.reply.parts).toEqual([
      'Vos dernières opérations :',
      '23/11 envoyé 7 500 FCFA à ENEO',
      '21/11 envoyé 5 000 FCFA à Maman',
      '20/11 reçu 15 000 FCFA de Jean Essomba',
    ]);
  });

  it('5. Correction : la valeur corrigée est appliquée AVANT exécution', async () => {
    const h = harness();
    await h.say('Envoie 5000 à Fadimatou');
    const r = await h.say('Non, 3000');
    expect(r.stage).toBe('confirming');
    expect(r.reply.parts[0]).toBe('Correction prise en compte : 5 000 FCFA devient 3 000 FCFA.');
    expect(r.reply.card?.amount).toBe(3000);
    expect(r.trace.params.correction).toBe('5 000 FCFA→3 000 FCFA');

    const done = await h.say('Oui');
    expect(done.reply.card?.amount).toBe(3000);
  });

  it('6a. Requête ambiguë (deux « Paul ») : clarification avant exécution', async () => {
    const h = harness();
    const r1 = await h.say('Envoie 2000 à Paul');
    expect(r1.stage).toBe('clarifying');
    expect(r1.reply.options.map((o) => o.label)).toEqual(['Paul Ndi (690000001)', 'Paul Mbarga (677000002)']);

    const r2 = await h.say('2');
    expect(r2.stage).toBe('confirming');
    expect(r2.reply.card?.recipientName).toBe('Paul Mbarga');
  });

  it('6b. Requête ambiguë (montant seul) : on demande quoi en faire', async () => {
    const h = harness();
    const r1 = await h.say('5000');
    expect(r1.stage).toBe('clarifying');
    expect(r1.reply.options.map((o) => o.label)).toEqual(['Envoyer de l’argent', 'Retirer', 'Acheter du crédit']);
    const r2 = await h.say('2');
    expect(r2.stage).toBe('confirming');
    expect(r2.reply.card).toMatchObject({ intent: 'WITHDRAW', amount: 5000, fee: 100 });
  });

  it('7. Solde insuffisant : explication chiffrée, rien n’est débité', async () => {
    const h = harness();
    const r = await h.say('Envoie 80 000 à Fadimatou');
    expect(r.trace.status).toBe('rejected');
    expect(r.trace.errors).toContain('INSUFFICIENT_FUNDS');
    expect(r.reply.parts.slice(0, 2)).toEqual([
      "Vous n'avez pas assez d'argent pour cette opération.",
      'Il faut 81 000 FCFA frais compris, vous avez 50 000 FCFA. Donnez un montant plus petit.',
    ]);
    // Le bénéficiaire est gardé : il suffit de redonner un montant.
    const r2 = await h.say('20 000');
    expect(r2.reply.card).toMatchObject({ amount: 20000, recipientName: 'Fadimatou Bouba' });
    const account = await h.bank.getAccount('amina');
    expect(account.ok && account.value.balance.amount).toBe(50_000);
  });

  it('8. Changement de langue : l’opération en cours continue dans la nouvelle langue', async () => {
    const h = harness();
    await h.say('Envoie 5000 à Fadimatou');
    const r = await h.say('Parle-moi en fulfulde');
    expect(r.reply.lang).toBe('fub');
    expect(r.stage).toBe('confirming');
    expect(r.reply.parts[1]).toBe('A neldan 5 000 FCFA ka Fadimatou Bouba, limgal 699000003.');
    const done = await h.say('Eey');
    expect(done.trace.status).toBe('executed');
    expect(done.reply.parts[0]).toBe('Gasii: 5 000 FCFA yettii ka Fadimatou Bouba.');
  });

  it('9. Interaction multicanale : même requête, même interprétation, même opération', async () => {
    const results = await Promise.all(
      (['mobile', 'web', 'ussd', 'sms', 'ivr', 'atm'] as const).map(async (channel) => {
        const h = harness();
        const r = await h.say('Envoie 5000 à Fadimatou', { channel });
        return { channel, intent: r.interpretation.intent, slots: r.interpretation.slots, card: r.reply.card, text: r.reply.text };
      }),
    );
    const [reference] = results;
    for (const r of results) {
      expect(r.intent).toBe(reference?.intent);
      expect(r.slots).toEqual(reference?.slots);
      expect(r.card).toEqual(reference?.card);
      expect(r.text).toBe(reference?.text);
    }
  });

  it('9b. Continuité multicanale : commencer en USSD, confirmer sur l’application', async () => {
    const h = harness();
    await h.say('Envoie 5000 à Fadimatou', { channel: 'ussd' });
    const r = await h.say('Oui', { channel: 'mobile' });
    expect(r.trace.status).toBe('executed');
    expect(r.trace.channel).toBe('mobile');
  });

  it('10. Terminologie : le concept est expliqué dans la langue nationale', async () => {
    const h = harness('wes');
    const r = await h.say('Wetin be charges?');
    expect(r.interpretation.intent).toBe('EXPLAIN_TERM');
    expect(r.reply.text).toBe('Charges — Charges na di moni wey di sevis go chop for do di transaction. Moni + charges = total.');
    expect(r.reply.status).toBe('draft');
  });
});

describe('garanties transverses', () => {
  it('une question en cours d’opération ne fait pas perdre l’opération', async () => {
    const h = harness();
    await h.say('Envoie 5000 à Fadimatou');
    const r = await h.say("C'est quoi les frais ?");
    expect(r.reply.parts[0]).toContain('Les frais');
    expect(r.stage).toBe('confirming');
  });

  it('« non » seul annule, et rien n’est débité', async () => {
    const h = harness();
    await h.say('Envoie 5000 à Fadimatou');
    const r = await h.say('Non');
    expect(r.trace.status).toBe('cancelled');
    const account = await h.bank.getAccount('amina');
    expect(account.ok && account.value.balance.amount).toBe(50_000);
  });

  it('un double « oui » n’exécute qu’une fois', async () => {
    const h = harness();
    await h.say('Envoie 5000 à Fadimatou');
    await h.say('Oui');
    const r = await h.say('Oui');
    expect(r.reply.text).toBe("Il n'y a aucune opération en cours.");
    const account = await h.bank.getAccount('amina');
    expect(account.ok && account.value.balance.amount).toBe(44_950);
  });

  it('un bénéficiaire inconnu n’est jamais inventé : on demande son numéro', async () => {
    const h = harness();
    const r1 = await h.say('Envoie 2000 à Moussa');
    expect(r1.reply.text).toBe('Je ne trouve pas Moussa dans vos contacts. Donnez son numéro.');
    const r2 = await h.say('690123456');
    expect(r2.reply.card).toMatchObject({ recipientPhone: '690123456', amount: 2000 });
  });

  it('plafond dépassé : explication et nouveau montant demandé', async () => {
    const h = harness();
    const r = await h.say('Retirer 900 000');
    expect(r.trace.errors).toContain('LIMIT_EXCEEDED');
    expect(r.reply.parts[0]).toBe('Le montant dépasse la limite : vous ne pouvez pas dépasser 500 000 FCFA.');
  });

  it('retrait : un code est remis pour l’agent ou le guichet', async () => {
    const h = harness();
    await h.say('Je veux retirer 10 000');
    const r = await h.say('Oui');
    expect(r.reply.parts[0]).toMatch(/Donnez ce code : \d{6}\./);
  });

  it('chaque tour produit une trace complète pour le jury', async () => {
    const h = harness();
    await h.say('Quel est mon solde ?', { channel: 'ussd' });
    expect(h.traces[0]).toMatchObject({
      team: 'NkapLingua',
      channel: 'ussd',
      lang: 'fr',
      rawInput: 'Quel est mon solde ?',
      intent: 'CHECK_BALANCE',
      params: { balance: 50000 },
      response: 'Votre solde est de 50 000 FCFA.',
      status: 'none',
      errors: [],
      validation: { integrity: true, translationStatus: 'reference', fallback: false },
    });
  });
});
