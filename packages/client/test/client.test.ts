import { describe, expect, it } from 'vitest';
import { ConversationStore, LocalNkapClient, QUICK_ACTIONS, quickActionInput, quickActionLabel, uiText, WalletStore, type ChatMessage } from '../src';

const lastAssistant = (messages: readonly ChatMessage[]) => {
  const m = [...messages].reverse().find((x) => x.role === 'assistant');
  if (m?.role !== 'assistant') throw new Error('aucune réponse');
  return m;
};

const setup = () => {
  const client = new LocalNkapClient({ channel: 'web', userId: 'amina', sessionId: 'test' });
  return { client, chat: new ConversationStore(client), wallet: new WalletStore(client) };
};

describe('@nkap/client — conversation partagée web/mobile', () => {
  it('transfert en fulfulde, confirmé par bouton, solde rafraîchi automatiquement', async () => {
    const { chat, wallet } = setup();
    await wallet.refresh();
    expect(wallet.getSnapshot().account?.balance.amount).toBe(50_000);

    await chat.sayText('Neldu ujineere jowi ka Fadimatou');
    const ask = lastAssistant(chat.getSnapshot().messages);
    expect(chat.getSnapshot()).toMatchObject({ lang: 'fub', stage: 'confirming' });
    expect(ask.reply.card).toMatchObject({ amount: 5000, recipientName: 'Fadimatou Bouba' });

    const yes = ask.reply.options[0];
    if (!yes) throw new Error('pas de bouton Oui');
    await chat.choose(yes);
    expect(lastAssistant(chat.getSnapshot().messages).trace.status).toBe('executed');

    await new Promise((r) => setTimeout(r, 0));
    expect(wallet.getSnapshot().account?.balance.amount).toBe(44_950);
    expect(wallet.getSnapshot().history[0]?.counterparty).toBe('Fadimatou Bouba');
  });

  it('un seul tour à la fois : la double frappe est ignorée', async () => {
    const { chat } = setup();
    await Promise.all([chat.sayText('Quel est mon solde ?'), chat.sayText('Quel est mon solde ?')]);
    expect(chat.getSnapshot().messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('l’instantané garde sa référence tant que rien ne change (useSyncExternalStore)', async () => {
    const { chat } = setup();
    const before = chat.getSnapshot();
    expect(chat.getSnapshot()).toBe(before);
    let notified = 0;
    const off = chat.subscribe(() => notified++);
    await chat.sayText('Solde');
    off();
    expect(notified).toBe(2);
    expect(chat.getSnapshot()).not.toBe(before);
  });

  it('action rapide et changement de langue passent par le même moteur', async () => {
    const { chat } = setup();
    const send = QUICK_ACTIONS.find((a) => a.id === 'send');
    if (!send) throw new Error('action manquante');
    expect(quickActionLabel(send, 'wes').text).toBe('Sen moni');

    await chat.switchLanguage('wes', 'Pidgin');
    expect(chat.getSnapshot().lang).toBe('wes');
    await chat.sendIntent(quickActionInput(send), 'Sen moni');
    expect(lastAssistant(chat.getSnapshot().messages).reply.text).toBe('Write di nem or di fon nomba for di pesin wey go receive.');
  });
});

describe('@nkap/client — libellés d’interface honnêtes', () => {
  it('forme nationale du glossaire avec son statut', () => {
    expect(uiText('ui.confirm', 'fub')).toMatchObject({ text: 'Tabbitin', status: 'proposed', fallback: false });
  });
  it('pas de forme nationale : repli français signalé, rien d’inventé', () => {
    expect(uiText('ui.placeholder', 'fub')).toMatchObject({ text: 'Écrivez ou parlez à l’assistant…', fallback: true });
  });
});

describe('@nkap/client — fiche d’opération', () => {
  it('lignes localisées, valeurs verrouillées, champs absents omis', async () => {
    const { operationCardRows } = await import('../src');
    const rows = operationCardRows(
      { intent: 'TRANSFER', amount: 5000, fee: 50, total: 5050, recipientName: 'Maman', recipientPhone: '691000005', balanceAfter: null, reference: null },
      'wes',
    );
    expect(rows.map((r) => `${r.label}=${r.value}`)).toEqual([
      'Pesin wey go receive di moni=Maman',
      'Fon nomba=691000005',
      'Haw moch moni=5 000 FCFA',
      'Charges=50 FCFA',
      'Ol togeda=5 050 FCFA',
    ]);
  });
});
