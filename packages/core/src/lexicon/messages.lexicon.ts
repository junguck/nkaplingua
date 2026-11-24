import type { TemplateSet } from './types';

/**
 * Gabarits de réponse. Les emplacements {AMOUNT}, {NAME}… sont VERROUILLÉS : la valeur vient
 * du système financier, jamais de la traduction. Un gabarit qui perd un emplacement est rejeté
 * au rendu et remplacé par le français (règle héritée de la présélection).
 *
 * Statuts : sans précision = « proposé » (glossaire de présélection, à valider) ;
 * `draft` = rédigé pour la finale, jamais relu par un locuteur.
 */
const d = (text: string): { text: string; status: 'draft' } => ({ text, status: 'draft' });

/** Gabarit sans mot à traduire (noms, numéros) : identique et fiable dans toutes les langues. */
const neutral = (text: string): TemplateSet => {
  const same = { text, status: 'reference' } as const;
  return { fr: text, en: same, fub: same, wes: same };
};

export const MESSAGES = {
  'greet.hello': {
    fr: 'Bonjour {NAME}. Que voulez-vous faire ?',
    en: 'Hello {NAME}. What would you like to do?',
    fub: 'A jaɓɓaama {NAME}. Ko njiɗ-ɗaa waɗude?',
    wes: 'Welcome {NAME}. Wetin you wan do?',
  },
  'help.menu': {
    fr: 'Vous pouvez demander votre solde, envoyer de l’argent, connaître les frais, voir l’historique, acheter du crédit, payer une facture ou retirer.',
    en: 'You can ask for your balance, send money, check fees, see your history, buy airtime, pay a bill or withdraw.',
    fub: d('A waawi naamnaade ceede keddiiɗe, neldude ceede, njoɓdi, golle ɓennuɗe, kerdii, fakture walla yaltingo ceede.'),
    wes: d('You fit ask ya balans, sen moni, check charges, see history, buy kredit, pay bill or comot moni.'),
  },
  'not.understood': {
    fr: "Je n'ai pas compris. Essayez encore.",
    en: "I didn't understand. Please try again.",
    fub: d('Mi faamaay. Ɗaɓɓit fahin.'),
    wes: d('I no understand. Try am again.'),
  },
  'balance.is': {
    fr: 'Votre solde est de {BALANCE}.',
    en: 'Your balance is {BALANCE}.',
    fub: 'Ceede maa keddiiɗe: {BALANCE}.',
    wes: 'Ya balans na {BALANCE}.',
  },
  'ask.amount.TRANSFER': {
    fr: 'Combien voulez-vous envoyer ?',
    en: 'How much do you want to send?',
    fub: 'Winndu ceede ɗe njiɗ-ɗaa neldude.',
    wes: 'Write haw moch moni you wan sen.',
  },
  'ask.amount.WITHDRAW': {
    fr: 'Combien voulez-vous retirer ?',
    en: 'How much do you want to withdraw?',
    fub: d('Ceede njelu njiɗ-ɗaa yaltinde?'),
    wes: d('Haw moch you wan comot?'),
  },
  'ask.amount.BUY_AIRTIME': {
    fr: 'Combien de crédit voulez-vous acheter ?',
    en: 'How much airtime do you want?',
    fub: d('Kerdii njelu njiɗ-ɗaa?'),
    wes: d('Haw moch kredit you wan buy?'),
  },
  'ask.amount.PAY_BILL': {
    fr: 'Quel est le montant de la facture ?',
    en: 'What is the bill amount?',
    fub: d('Fakture ndee ko ceede njelu?'),
    wes: d('Haw moch di bill be?'),
  },
  'ask.amount.CHECK_FEES': {
    fr: 'Pour quel montant voulez-vous connaître les frais ?',
    en: 'For what amount do you want to know the fees?',
    fub: d('Njoɓdi ngam ceede njelu?'),
    wes: d('Charges for haw moch moni?'),
  },
  'ask.recipient': {
    fr: 'À qui voulez-vous envoyer ? Donnez un nom ou un numéro.',
    en: 'Who do you want to send to? Give a name or a number.',
    fub: 'Winndu innde walla limgal telefon mo heɓata.',
    wes: 'Write di nem or di fon nomba for di pesin wey go receive.',
  },
  'ask.biller': {
    fr: 'Quelle facture voulez-vous payer ?',
    en: 'Which bill do you want to pay?',
    fub: d('Fakture ndee ko honde?'),
    wes: d('Na which bill you wan pay?'),
  },
  'ask.billReference': {
    fr: 'Donnez le numéro de votre facture.',
    en: 'Give your bill number.',
    fub: 'Winndu lammba fakture maa.',
    wes: d('Write di nomba for ya bill.'),
  },
  'ask.intent': {
    fr: 'Que voulez-vous faire avec {AMOUNT} ?',
    en: 'What do you want to do with {AMOUNT}?',
    fub: d('Ko njiɗ-ɗaa waɗude e {AMOUNT}?'),
    wes: d('Wetin you wan do wit {AMOUNT}?'),
  },
  'clarify.recipient': {
    fr: 'Plusieurs contacts s’appellent {NAME}. Lequel ?',
    en: 'Several contacts are called {NAME}. Which one?',
    fub: d('Yimɓe ɗuuɗɓe njogii innde {NAME}. Moy?'),
    wes: d('Plenty pesin get di nem {NAME}. Na which one?'),
  },
  'clarify.unknownRecipient': {
    fr: 'Je ne trouve pas {NAME} dans vos contacts. Donnez son numéro.',
    en: 'I cannot find {NAME} in your contacts. Give their number.',
    fub: d('Mi tawaay {NAME} e konte maa. Winndu limgal makko.'),
    wes: d('I no see {NAME} for ya contact dem. Write e fon nomba.'),
  },
  'confirm.TRANSFER': {
    fr: 'Vous allez envoyer {AMOUNT} à {NAME}, numéro {PHONE}.',
    en: 'You are about to send {AMOUNT} to {NAME}, number {PHONE}.',
    fub: 'A neldan {AMOUNT} ka {NAME}, limgal {PHONE}.',
    wes: 'You dey sen {AMOUNT} give {NAME}, fon nomba {PHONE}.',
  },
  'confirm.WITHDRAW': {
    fr: 'Vous allez retirer {AMOUNT} chez un agent ou au guichet.',
    en: 'You are about to withdraw {AMOUNT} at an agent or ATM.',
    fub: { text: 'A yiɗi yaltingo {AMOUNT} e ajan.', status: 'draft' },
    wes: d('You wan comot {AMOUNT} for agent or ATM.'),
  },
  'confirm.BUY_AIRTIME': {
    fr: 'Vous allez acheter {AMOUNT} de crédit pour le {PHONE}.',
    en: 'You are about to buy {AMOUNT} of airtime for {PHONE}.',
    fub: d('A soodan kerdii {AMOUNT} ngam {PHONE}.'),
    wes: d('You dey buy kredit {AMOUNT} for {PHONE}.'),
  },
  'confirm.PAY_BILL': {
    fr: 'Vous allez payer {AMOUNT} pour la facture {NAME}, numéro {REF}.',
    en: 'You are about to pay {AMOUNT} for the {NAME} bill, number {REF}.',
    fub: { text: 'A yoɓan {AMOUNT} ngam fakture {NAME}, lammba {REF}.', status: 'draft' },
    wes: d('You dey pay {AMOUNT} for {NAME} bill, nomba {REF}.'),
  },
  'quote.fees': {
    fr: 'Frais : {FEE}.',
    en: 'Fees: {FEE}.',
    fub: 'Njoɓdi: {FEE}.',
    wes: 'Di charges na {FEE}.',
  },
  'quote.total': {
    fr: 'En tout, {TOTAL} vont sortir de votre compte.',
    en: 'In total, {TOTAL} will leave your account.',
    fub: 'Fof ko yaltata e konte maa: {TOTAL}.',
    wes: 'Ol togeda wey go komot for ya akaunt: {TOTAL}.',
  },
  'quote.fees.full': {
    fr: 'Pour {AMOUNT}, les frais sont de {FEE}. Total : {TOTAL}.',
    en: 'For {AMOUNT}, the fees are {FEE}. Total: {TOTAL}.',
    fub: d('Ngam {AMOUNT}, njoɓdi ko {FEE}. Fof: {TOTAL}.'),
    wes: d('For {AMOUNT}, di charges na {FEE}. Total: {TOTAL}.'),
  },
  'confirm.question': {
    fr: 'Confirmez-vous ?',
    en: 'Do you confirm?',
    fub: d('A tabbitinii?'),
    wes: d('You confam?'),
  },
  'confirm.irreversible': {
    fr: 'Après confirmation, on ne peut plus annuler.',
    en: 'Once confirmed, it cannot be cancelled.',
    fub: 'Si a tabbitinii, waawaa artirteede.',
    wes: 'When you confam, you no fit cancel am again.',
  },
  'correction.applied': {
    fr: 'Correction prise en compte : {OLD} devient {NEW}.',
    en: 'Correction applied: {OLD} becomes {NEW}.',
    fub: d('Mi waylii: {OLD} → {NEW}.'),
    wes: d('I don change am: {OLD} → {NEW}.'),
  },
  'done.TRANSFER': {
    fr: "C'est fait : {AMOUNT} sont partis chez {NAME}.",
    en: 'Done: {AMOUNT} sent to {NAME}.',
    fub: 'Gasii: {AMOUNT} yettii ka {NAME}.',
    wes: 'E don waka: {AMOUNT} don reach {NAME}.',
  },
  'done.WITHDRAW': {
    fr: 'Allez chez un agent ou au guichet. Donnez ce code : {CODE}. Il dure dix minutes.',
    en: 'Go to an agent or ATM. Give this code: {CODE}. It lasts ten minutes.',
    fub: { text: 'Yah e ajan. Hokkaa mo lammba ndee: {CODE}. Lammba ndee wooni minti sappo.', status: 'draft' },
    wes: d('Go for agent or ATM. Give dem dis code: {CODE}. E go last ten minit.'),
  },
  'done.BUY_AIRTIME': {
    fr: "C'est fait : {AMOUNT} de crédit envoyés au {PHONE}.",
    en: 'Done: {AMOUNT} of airtime sent to {PHONE}.',
    fub: d('Gasii: kerdii {AMOUNT} yettii {PHONE}.'),
    wes: d('E don waka: kredit {AMOUNT} don reach {PHONE}.'),
  },
  'done.PAY_BILL': {
    fr: "C'est payé : facture {NAME}, {AMOUNT}.",
    en: 'Paid: {NAME} bill, {AMOUNT}.',
    fub: d('Yoɓaama: fakture {NAME}, {AMOUNT}.'),
    wes: d('E don pay: {NAME} bill, {AMOUNT}.'),
  },
  'done.balance': {
    fr: 'Maintenant il vous reste {BALANCE}.',
    en: 'Your new balance is {BALANCE}.',
    fub: 'Jooni ceede maa keddiiɗe: {BALANCE}.',
    wes: 'Ya new balans na {BALANCE}.',
  },
  'done.reference': {
    fr: "Numéro de l'opération : {REF} (gardez-le).",
    en: 'Operation number: {REF} (keep it).',
    fub: 'Limgal golle: {REF} (resu ɗum).',
    wes: 'Nomba for di transaction: {REF} (keep am).',
  },
  'cancelled': {
    fr: "D'accord. Rien n'est parti. Votre argent est resté sur votre compte.",
    en: 'OK. Nothing was sent. Your money stayed in your account.',
    fub: { text: 'Hay huunde yahaay. Ceede maa ngoni.', status: 'draft' },
    wes: d('Okay. Notin no komot. Ya moni still dey ya akaunt.'),
  },
  'nothing.pending': {
    fr: "Il n'y a aucune opération en cours.",
    en: 'There is no operation in progress.',
    fub: d('Golle alaa jooni.'),
    wes: d('No transaction dey go now.'),
  },
  'error.insufficient': {
    fr: "Vous n'avez pas assez d'argent pour cette opération.",
    en: 'You do not have enough money for this operation.',
    fub: 'Ceede maa heewaani ngam ɗee golle.',
    wes: 'Ya moni no rich for dis transaction.',
  },
  'error.insufficient.detail': {
    fr: 'Il faut {TOTAL} frais compris, vous avez {BALANCE}. Donnez un montant plus petit.',
    en: 'You need {TOTAL} including fees, you have {BALANCE}. Give a smaller amount.',
    fub: d('Haani {TOTAL} e njoɓdi, a jogii {BALANCE}. Winndu ceede ɓurɗe seɗɗa.'),
    wes: d('You need {TOTAL} wit charges, you get {BALANCE}. Write small moni.'),
  },
  'error.limit': {
    fr: 'Le montant dépasse la limite : vous ne pouvez pas dépasser {AMOUNT}.',
    en: 'The amount is over the limit: you cannot exceed {AMOUNT}.',
    fub: d('Ceede ɗen ɓurii keerol. A waawaa ɓurtinde {AMOUNT}.'),
    wes: d('Di moni too plenty. You no fit pass {AMOUNT}.'),
  },
  'error.minimum': {
    fr: 'Il faut au moins {AMOUNT}.',
    en: 'The minimum is {AMOUNT}.',
    fub: 'Haani ɓuri {AMOUNT} walla fotde e mum.',
    wes: 'You must sen at least {AMOUNT}.',
  },
  'error.backend': {
    fr: "Problème de réseau. Réessayez plus tard. Votre argent n'est pas parti.",
    en: 'Network problem. Try again later. Your money was not sent.',
    fub: 'Juumre reseau. Fuɗɗito caggal. Ceede maa yaltaaki.',
    wes: 'Network wahala. Try am again later. Ya moni no komot.',
  },
  'history.header': {
    fr: 'Vos dernières opérations :',
    en: 'Your latest operations:',
    fub: d('Golle maa ɓennuɗe:'),
    wes: d('Di last tins wey you do:'),
  },
  'history.out': {
    fr: '{DATE} envoyé {AMOUNT} à {NAME}',
    en: '{DATE} sent {AMOUNT} to {NAME}',
    fub: d('{DATE} neldaama {AMOUNT} ka {NAME}'),
    wes: d('{DATE} sen {AMOUNT} give {NAME}'),
  },
  'history.in': {
    fr: '{DATE} reçu {AMOUNT} de {NAME}',
    en: '{DATE} received {AMOUNT} from {NAME}',
    fub: 'A heɓii {AMOUNT} diga {NAME} ({DATE})',
    wes: '{DATE} receive {AMOUNT} from {NAME}',
  },
  'history.empty': {
    fr: 'Aucune opération pour le moment.',
    en: 'No operations yet.',
    fub: d('Golle alaa tawo.'),
    wes: d('No transaction yet.'),
  },
  'lang.changed': {
    fr: "D'accord, je continue en français.",
    en: 'OK, I will continue in English.',
    fub: d('Eey, mi jokkan e Fulfulde.'),
    wes: d('Okay, I go tok Pidgin now.'),
  },
  'safety.pin': {
    fr: 'Ne donnez jamais votre code secret.',
    en: 'Never share your PIN.',
    fub: 'Taa hokku neɗɗo sirri maa abada!',
    wes: 'Neva give ya secret code to anybody!',
  },
  'option.yes': { fr: 'Oui', en: 'Yes', fub: { text: 'Eey', status: 'attested' }, wes: 'Yes' },
  'option.no': { fr: 'Non', en: 'No', fub: { text: 'Ala', status: 'attested' }, wes: 'No' },
  'option.contact': neutral('{NAME} ({PHONE})'),
  'intent.CHECK_BALANCE': { fr: 'Mon solde', en: 'My balance', fub: 'Ceede keddiiɗe', wes: 'Ma balans' },
  'intent.TRANSFER': { fr: 'Envoyer de l’argent', en: 'Send money', fub: 'Neldugo ceede', wes: 'Sen moni' },
  'intent.CHECK_FEES': { fr: 'Frais', en: 'Fees', fub: 'Njoɓdi', wes: 'Charges' },
  'intent.TX_HISTORY': { fr: 'Historique', en: 'History', fub: 'Golle ɓennuɗe', wes: 'History' },
  'intent.BUY_AIRTIME': { fr: 'Acheter du crédit', en: 'Buy airtime', fub: d('Soodugo kerdii'), wes: 'Buy kredit' },
  'intent.PAY_BILL': { fr: 'Payer une facture', en: 'Pay a bill', fub: d('Yoɓugo fakture'), wes: 'Pay bill' },
  'intent.WITHDRAW': { fr: 'Retirer', en: 'Withdraw', fub: 'Yaltingo ceede', wes: 'Comot moni' },
  'biller.ENEO': { fr: 'ENEO (électricité)', en: 'ENEO (electricity)', fub: 'ENEO (yiite)', wes: 'ENEO (light)' },
  'biller.CAMWATER': { fr: 'CAMWATER (eau)', en: 'CAMWATER (water)', fub: 'CAMWATER (ndiyam)', wes: 'CAMWATER (wata)' },
  'biller.CANAL': { fr: 'CANAL+ (télévision)', en: 'CANAL+ (TV)', fub: 'CANAL+ (TV)', wes: 'CANAL+ (TV)' },
} as const satisfies Readonly<Record<string, TemplateSet>>;

export type MessageKey = keyof typeof MESSAGES;
