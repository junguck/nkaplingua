/**
 * Phrases de référence (français, langue source) et traduction anglaise d'amorçage.
 *
 * C'est la graine de la collection Mongo `references` et `translations`. Les langues
 * nationales n'ont AUCUNE traduction ici : elles arrivent par le studio, validées par un
 * second locuteur. Inventer une traduction serait repéré par le jury (UNTRANSLATED).
 */

export interface Reference {
  readonly key: string;
  readonly fr: string;
  readonly context: string;
  readonly channels: readonly ('ussd' | 'sms' | 'ivr')[];
}

const CONV = ['ussd', 'sms', 'ivr'] as const;

export const REFERENCES: readonly Reference[] = [
  { key: 'menu.title', fr: 'NkapLingua. Choisissez :', context: 'Titre du menu principal', channels: CONV },
  { key: 'menu.balance', fr: 'Mon solde', context: 'Option de menu', channels: CONV },
  { key: 'menu.transfer', fr: "Envoyer de l'argent", context: 'Option de menu', channels: CONV },
  { key: 'menu.airtime', fr: 'Crédit téléphone', context: 'Option de menu', channels: CONV },
  { key: 'menu.bill', fr: 'Payer une facture', context: 'Option de menu', channels: CONV },
  { key: 'menu.fees', fr: "Frais d'envoi", context: 'Option de menu', channels: CONV },
  { key: 'menu.history', fr: 'Mes opérations', context: 'Option de menu', channels: CONV },
  { key: 'menu.language', fr: 'Langue', context: 'Option de menu', channels: CONV },
  { key: 'menu.help', fr: 'Comprendre un mot', context: 'Option de menu', channels: CONV },

  { key: 'balance.result', fr: 'Votre solde est de {amount}.', context: 'Réponse au solde', channels: CONV },

  { key: 'ask.beneficiary', fr: 'Nom ou numéro du bénéficiaire :', context: 'Question', channels: CONV },
  { key: 'ask.amount', fr: 'Montant en FCFA :', context: 'Question', channels: CONV },
  { key: 'ask.phone', fr: 'Numéro à recharger (9 chiffres) :', context: 'Question', channels: CONV },
  { key: 'choose.beneficiary', fr: 'Plusieurs personnes portent ce nom. Laquelle ?', context: 'Précision demandée', channels: CONV },
  { key: 'choose.airtime', fr: 'Crédit pour :', context: 'Question', channels: CONV },
  { key: 'opt.my_number', fr: 'Mon numéro', context: 'Option', channels: CONV },
  { key: 'opt.other_number', fr: 'Un autre numéro', context: 'Option', channels: CONV },
  { key: 'choose.bill', fr: 'Quelle facture ?', context: 'Question', channels: CONV },

  { key: 'recap.transfer', fr: 'Envoi de {amount} à {name}. Frais {fee}. Total {total}.', context: 'Relecture avant confirmation', channels: CONV },
  { key: 'recap.airtime', fr: 'Crédit {operator} de {amount} pour le {phone}. Frais {fee}. Total {total}.', context: 'Relecture', channels: CONV },
  { key: 'recap.bill', fr: 'Facture {biller} de {amount}. Frais {fee}. Total {total}.', context: 'Relecture', channels: CONV },
  { key: 'opt.confirm', fr: 'Confirmer', context: 'Option', channels: CONV },
  { key: 'opt.edit', fr: 'Changer le montant', context: 'Option', channels: CONV },
  { key: 'opt.cancel', fr: 'Annuler', context: 'Option', channels: CONV },

  { key: 'done.transfer', fr: '{amount} envoyés à {name}. Réf {ref}.', context: 'Reçu', channels: CONV },
  { key: 'done.airtime', fr: 'Crédit de {amount} envoyé au {phone}. Réf {ref}.', context: 'Reçu', channels: CONV },
  { key: 'done.bill', fr: 'Facture {biller} payée : {amount}. Réf {ref}.', context: 'Reçu', channels: CONV },
  { key: 'done.cancel', fr: "Opération annulée. Rien n'a été débité.", context: 'Annulation', channels: CONV },

  { key: 'fees.result', fr: 'Pour envoyer {amount} : frais {fee}, total {total}.', context: 'Réponse frais', channels: CONV },
  { key: 'history.title', fr: 'Dernières opérations :', context: 'Titre', channels: CONV },
  { key: 'history.empty', fr: 'Aucune opération pour le moment.', context: 'Liste vide', channels: CONV },

  { key: 'language.choose', fr: 'Choisissez votre langue :', context: 'Question', channels: CONV },
  { key: 'language.done', fr: 'Langue changée.', context: 'Confirmation', channels: CONV },

  { key: 'help.choose', fr: 'Quel mot expliquer ?', context: 'Question', channels: CONV },
  { key: 'term.fee.label', fr: 'Frais', context: 'Nom du terme', channels: CONV },
  { key: 'term.limit.label', fr: 'Plafond', context: 'Nom du terme', channels: CONV },
  { key: 'term.beneficiary.label', fr: 'Bénéficiaire', context: 'Nom du terme', channels: CONV },
  { key: 'term.fee', fr: "Les frais, c'est ce que la banque prend pour faire l'envoi. Ils s'ajoutent au montant.", context: 'Explication pour une personne sans compte bancaire', channels: CONV },
  { key: 'term.limit', fr: 'Le plafond, c\'est le plus gros montant permis en une fois : {max}.', context: 'Explication', channels: CONV },
  { key: 'term.beneficiary', fr: "Le bénéficiaire, c'est la personne qui reçoit l'argent.", context: 'Explication', channels: CONV },

  { key: 'invalid.choice', fr: 'Choix invalide.', context: 'Erreur de saisie', channels: CONV },
  { key: 'invalid.amount', fr: 'Montant invalide. Tapez un nombre, ex : 5000', context: 'Erreur de saisie', channels: CONV },
  { key: 'invalid.phone', fr: 'Numéro invalide. 9 chiffres, ex : 699000002', context: 'Erreur de saisie', channels: CONV },
  { key: 'confirm.prompt', fr: 'Tapez 1 pour confirmer, 2 pour changer, 0 pour annuler.', context: 'Relance', channels: CONV },
  { key: 'goodbye', fr: 'Merci, à bientôt.', context: 'Fin de session', channels: CONV },

  { key: 'error.INSUFFICIENT_FUNDS', fr: 'Solde insuffisant pour le montant et les frais.', context: 'Erreur bancaire', channels: CONV },
  { key: 'error.UNKNOWN_BENEFICIARY', fr: 'Bénéficiaire introuvable.', context: 'Erreur bancaire', channels: CONV },
  { key: 'error.LIMIT_EXCEEDED', fr: 'Montant au-dessus du plafond de {max} par opération.', context: 'Erreur bancaire', channels: CONV },
  { key: 'error.INVALID_AMOUNT', fr: 'Montant invalide.', context: 'Erreur bancaire', channels: CONV },
  { key: 'error.UNKNOWN_BILLER', fr: 'Facturier ou opérateur inconnu.', context: 'Erreur bancaire', channels: CONV },
  { key: 'error.UNKNOWN_ACCOUNT', fr: 'Compte introuvable.', context: 'Erreur bancaire', channels: CONV },
  { key: 'error.TX_NOT_PENDING', fr: 'Cette opération est déjà traitée.', context: 'Erreur bancaire', channels: CONV },
  { key: 'error.TX_NOT_FOUND', fr: 'Opération introuvable.', context: 'Erreur bancaire', channels: CONV },
  { key: 'error.UNREACHABLE', fr: 'Service indisponible. Réessayez dans un instant.', context: 'Erreur réseau', channels: CONV },
  { key: 'error.GENERIC', fr: 'Opération impossible. Réessayez plus tard.', context: 'Erreur', channels: CONV },
];

export const EN: Readonly<Record<string, string>> = {
  'menu.title': 'NkapLingua. Choose:',
  'menu.balance': 'My balance',
  'menu.transfer': 'Send money',
  'menu.airtime': 'Phone airtime',
  'menu.bill': 'Pay a bill',
  'menu.fees': 'Transfer fees',
  'menu.history': 'My transactions',
  'menu.language': 'Language',
  'menu.help': 'Explain a word',
  'balance.result': 'Your balance is {amount}.',
  'ask.beneficiary': 'Beneficiary name or number:',
  'ask.amount': 'Amount in FCFA:',
  'ask.phone': 'Number to top up (9 digits):',
  'choose.beneficiary': 'Several people have this name. Which one?',
  'choose.airtime': 'Airtime for:',
  'opt.my_number': 'My number',
  'opt.other_number': 'Another number',
  'choose.bill': 'Which bill?',
  'recap.transfer': 'Send {amount} to {name}. Fee {fee}. Total {total}.',
  'recap.airtime': '{operator} airtime of {amount} for {phone}. Fee {fee}. Total {total}.',
  'recap.bill': '{biller} bill of {amount}. Fee {fee}. Total {total}.',
  'opt.confirm': 'Confirm',
  'opt.edit': 'Change amount',
  'opt.cancel': 'Cancel',
  'done.transfer': '{amount} sent to {name}. Ref {ref}.',
  'done.airtime': '{amount} airtime sent to {phone}. Ref {ref}.',
  'done.bill': '{biller} bill paid: {amount}. Ref {ref}.',
  'done.cancel': 'Cancelled. Nothing was debited.',
  'fees.result': 'To send {amount}: fee {fee}, total {total}.',
  'history.title': 'Recent transactions:',
  'history.empty': 'No transactions yet.',
  'language.choose': 'Choose your language:',
  'language.done': 'Language changed.',
  'help.choose': 'Which word?',
  'term.fee.label': 'Fee',
  'term.limit.label': 'Limit',
  'term.beneficiary.label': 'Beneficiary',
  'term.fee': 'The fee is what the bank takes to make the transfer. It is added to the amount.',
  'term.limit': 'The limit is the largest amount allowed at once: {max}.',
  'term.beneficiary': 'The beneficiary is the person who receives the money.',
  'invalid.choice': 'Invalid choice.',
  'invalid.amount': 'Invalid amount. Type a number, e.g. 5000',
  'invalid.phone': 'Invalid number. 9 digits, e.g. 699000002',
  'confirm.prompt': 'Type 1 to confirm, 2 to change, 0 to cancel.',
  goodbye: 'Thank you, goodbye.',
  'error.INSUFFICIENT_FUNDS': 'Insufficient balance for the amount and fee.',
  'error.UNKNOWN_BENEFICIARY': 'Beneficiary not found.',
  'error.LIMIT_EXCEEDED': 'Amount above the {max} limit per transaction.',
  'error.INVALID_AMOUNT': 'Invalid amount.',
  'error.UNKNOWN_BILLER': 'Unknown biller or operator.',
  'error.UNKNOWN_ACCOUNT': 'Account not found.',
  'error.TX_NOT_PENDING': 'This transaction was already processed.',
  'error.TX_NOT_FOUND': 'Transaction not found.',
  'error.UNREACHABLE': 'Service unavailable. Try again shortly.',
  'error.GENERIC': 'Operation failed. Try again later.',
};
