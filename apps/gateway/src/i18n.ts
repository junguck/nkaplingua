/**
 * Textes du canal USSD, en français, anglais et fulfulde.
 *
 * Règle d'honnêteté : on ne mélange jamais deux langues dans un même écran. Une langue non
 * couverte par ce catalogue n'est pas « à moitié traduite » : le tour entier reste en français
 * et `interpretation.language` vaut `fr`. Le fulfulde est notre langue nationale de démonstration ;
 * ses formes sont **proposées** (glossaire de présélection) et doivent être relues par un locuteur.
 */

export type GatewayLanguage = 'fr' | 'en' | 'fub';

export type MessageKey =
  | 'menu.header'
  | 'menu.balance'
  | 'menu.transfer'
  | 'menu.fees'
  | 'menu.history'
  | 'menu.airtime'
  | 'menu.bill'
  | 'menu.help'
  | 'menu.language'
  | 'common.confirm'
  | 'common.cancel'
  | 'ask.beneficiary'
  | 'ask.amount'
  | 'ask.feesAmount'
  | 'ask.airtimeTarget'
  | 'ask.airtimePhone'
  | 'ask.biller'
  | 'ask.billReference'
  | 'ask.term'
  | 'ask.language'
  | 'confirm.transfer'
  | 'confirm.airtime'
  | 'confirm.bill'
  | 'confirm.choose'
  | 'confirm.edit'
  | 'confirm.retry'
  | 'done.transfer'
  | 'done.airtime'
  | 'done.bill'
  | 'done.cancel'
  | 'balance'
  | 'fees'
  | 'history.header'
  | 'history.line'
  | 'history.empty'
  | 'invalid.choice'
  | 'invalid.amount'
  | 'invalid.phone'
  | 'invalid.limit'
  | 'ambiguous.beneficiary'
  | 'term.fee'
  | 'term.limit'
  | 'term.beneficiary'
  | 'term.confirmation'
  | 'lang.set'
  | 'error.INSUFFICIENT_FUNDS'
  | 'error.LIMIT_EXCEEDED'
  | 'error.UNKNOWN_BENEFICIARY'
  | 'error.UNKNOWN_BILLER'
  | 'error.UNKNOWN_ACCOUNT'
  | 'error.INVALID_AMOUNT'
  | 'error.TX_NOT_PENDING'
  | 'error.UNAUTHORIZED'
  | 'error.UNREACHABLE'
  | 'error.GENERIC';

type Catalogue = Readonly<Record<MessageKey, string>>;

const FR: Catalogue = {
  'menu.header': 'Safinum. Choisissez:',
  'menu.balance': 'Mon solde',
  'menu.transfer': "Envoyer de l'argent",
  'menu.fees': 'Frais',
  'menu.history': 'Historique',
  'menu.airtime': 'Acheter du credit',
  'menu.bill': 'Payer une facture',
  'menu.help': 'Aide',
  'menu.language': 'Langue',
  'common.confirm': 'Confirmer',
  'common.cancel': 'Annuler',
  'ask.beneficiary': 'Numero du beneficiaire (9 chiffres):',
  'ask.amount': 'Montant (FCFA):',
  'ask.feesAmount': 'Frais pour quel montant (FCFA) ?',
  'ask.airtimeTarget': 'Credit pour:\n1. Mon numero\n2. Un autre numero',
  'ask.airtimePhone': 'Numero a recharger (9 chiffres):',
  'ask.biller': 'Choisissez le facturier:',
  'ask.billReference': 'Numero de facture:',
  'ask.term': 'Quel terme ?\n1. Frais\n2. Plafond\n3. Beneficiaire\n4. Confirmation',
  'ask.language': 'Choisissez la langue:\n1. Francais\n2. English\n3. Fulfulde',
  'confirm.transfer': 'Envoi de {amount} a {recipient}. Frais {fee}. Total {total}.',
  'confirm.airtime': 'Credit de {amount} pour le {phone}. Frais {fee}. Total {total}.',
  'confirm.bill': 'Facture {biller} {reference}: {amount}. Frais {fee}. Total {total}.',
  'confirm.choose': '1. Confirmer\n2. Annuler',
  'confirm.edit': '3. Modifier le montant',
  'confirm.retry': 'Repondez 1 pour confirmer ou 2 pour annuler.',
  'done.transfer': '{amount} envoye a {recipient}. Ref {ref}. Solde {balance}.',
  'done.airtime': 'Credit de {amount} envoye au {phone}. Ref {ref}.',
  'done.bill': 'Facture {biller} payee: {amount}. Ref {ref}.',
  'done.cancel': 'Operation annulee. Aucun montant debite.',
  balance: 'Votre solde est de {balance}.',
  fees: 'Pour {amount}: frais {fee}. Total {total}.',
  'history.header': 'Vos dernieres operations:',
  'history.line': '{date} {label} {amount}',
  'history.empty': 'Aucune operation pour le moment.',
  'invalid.choice': 'Choix invalide.',
  'invalid.amount': 'Montant invalide. Tapez un nombre, ex: 1000',
  'invalid.phone': 'Numero invalide. 9 chiffres, ex: 699000002',
  'invalid.limit': 'Montant trop eleve. Plafond: {max} FCFA.',
  'ambiguous.beneficiary': 'Plusieurs beneficiaires. Precisez le numero.',
  'term.fee': 'Les frais sont ce que la banque retient pour executer une operation.',
  'term.limit': 'Le plafond est de 500 000 FCFA par operation.',
  'term.beneficiary': "Le beneficiaire est la personne qui recoit l'argent.",
  'term.confirmation': "Rien n'est debite avant votre confirmation, au tour suivant.",
  'lang.set': 'Langue: {language}.',
  'error.INSUFFICIENT_FUNDS': 'Solde insuffisant pour cette operation.',
  'error.LIMIT_EXCEEDED': 'Montant au-dessus du plafond autorise.',
  'error.UNKNOWN_BENEFICIARY': 'Beneficiaire introuvable. Verifiez le numero.',
  'error.UNKNOWN_BILLER': 'Facturier inconnu. Choisissez dans la liste.',
  'error.UNKNOWN_ACCOUNT': 'Compte introuvable pour ce numero.',
  'error.INVALID_AMOUNT': 'Montant invalide.',
  'error.TX_NOT_PENDING': 'Cette operation ne peut plus etre modifiee.',
  'error.UNAUTHORIZED': 'Service momentanement indisponible. Reessayez plus tard.',
  'error.UNREACHABLE': 'Service momentanement indisponible. Reessayez plus tard.',
  'error.GENERIC': 'Operation impossible. Reessayez plus tard.',
};

const EN: Catalogue = {
  'menu.header': 'Safinum. Choose:',
  'menu.balance': 'My balance',
  'menu.transfer': 'Send money',
  'menu.fees': 'Fees',
  'menu.history': 'History',
  'menu.airtime': 'Buy airtime',
  'menu.bill': 'Pay a bill',
  'menu.help': 'Help',
  'menu.language': 'Language',
  'common.confirm': 'Confirm',
  'common.cancel': 'Cancel',
  'ask.beneficiary': 'Beneficiary number (9 digits):',
  'ask.amount': 'Amount (FCFA):',
  'ask.feesAmount': 'Fees for which amount (FCFA)?',
  'ask.airtimeTarget': 'Airtime for:\n1. My number\n2. Another number',
  'ask.airtimePhone': 'Number to top up (9 digits):',
  'ask.biller': 'Choose the service:',
  'ask.billReference': 'Bill number:',
  'ask.term': 'Which term?\n1. Fee\n2. Limit\n3. Beneficiary\n4. Confirmation',
  'ask.language': 'Choose the language:\n1. Francais\n2. English\n3. Fulfulde',
  'confirm.transfer': 'Sending {amount} to {recipient}. Fee {fee}. Total {total}.',
  'confirm.airtime': 'Airtime of {amount} for {phone}. Fee {fee}. Total {total}.',
  'confirm.bill': 'Bill {biller} {reference}: {amount}. Fee {fee}. Total {total}.',
  'confirm.choose': '1. Confirm\n2. Cancel',
  'confirm.edit': '3. Change the amount',
  'confirm.retry': 'Reply 1 to confirm or 2 to cancel.',
  'done.transfer': '{amount} sent to {recipient}. Ref {ref}. Balance {balance}.',
  'done.airtime': 'Airtime of {amount} sent to {phone}. Ref {ref}.',
  'done.bill': 'Bill {biller} paid: {amount}. Ref {ref}.',
  'done.cancel': 'Transaction cancelled. Nothing was debited.',
  balance: 'Your balance is {balance}.',
  fees: 'For {amount}: fee {fee}. Total {total}.',
  'history.header': 'Your recent transactions:',
  'history.line': '{date} {label} {amount}',
  'history.empty': 'No transactions yet.',
  'invalid.choice': 'Invalid choice.',
  'invalid.amount': 'Invalid amount. Enter a number, e.g. 1000',
  'invalid.phone': 'Invalid number. 9 digits, e.g. 699000002',
  'invalid.limit': 'Amount too high. Limit: {max} FCFA.',
  'ambiguous.beneficiary': 'Several beneficiaries. Give the number.',
  'term.fee': 'The fee is what the bank keeps to carry out a transaction.',
  'term.limit': 'The limit is 500 000 FCFA per transaction.',
  'term.beneficiary': 'The beneficiary is the person who receives the money.',
  'term.confirmation': 'Nothing is debited before you confirm, on the next turn.',
  'lang.set': 'Language: {language}.',
  'error.INSUFFICIENT_FUNDS': 'Insufficient balance for this transaction.',
  'error.LIMIT_EXCEEDED': 'Amount above the authorised limit.',
  'error.UNKNOWN_BENEFICIARY': 'Beneficiary not found. Check the number.',
  'error.UNKNOWN_BILLER': 'Unknown service. Choose from the list.',
  'error.UNKNOWN_ACCOUNT': 'No account for this number.',
  'error.INVALID_AMOUNT': 'Invalid amount.',
  'error.TX_NOT_PENDING': 'This transaction can no longer be changed.',
  'error.UNAUTHORIZED': 'Service temporarily unavailable. Try again later.',
  'error.UNREACHABLE': 'Service temporarily unavailable. Try again later.',
  'error.GENERIC': 'The transaction did not go through. Try again.',
};

/**
 * Fulfulde : formes proposées, reprises du glossaire de présélection (statut « proposé »).
 * Translittérées en GSM-7 au rendu (ɓ→b, ɗ→d, ŋ→n, ƴ→y).
 */
const FUB: Catalogue = {
  'menu.header': 'Safinum. Suɓo:',
  'menu.balance': 'Ceede am keddiiɗe',
  'menu.transfer': 'Neldu ceede',
  'menu.fees': 'Njoɓdi',
  'menu.history': 'Golle ɓennuɗe',
  'menu.airtime': 'Soodu kerdii',
  'menu.bill': 'Yoɓ fakture',
  'menu.help': 'Wallu',
  'menu.language': 'Ɗemngal',
  'common.confirm': 'Tabbitin',
  'common.cancel': 'Haaytu',
  'ask.beneficiary': 'Limgal keɓoowo ceede (9 limle):',
  'ask.amount': 'Ceede (FCFA):',
  'ask.feesAmount': 'Njoɓdi ngam ceede njelu (FCFA)?',
  'ask.airtimeTarget': 'Kerdii ngam:\n1. Limgal am\n2. Limgal goɗngal',
  'ask.airtimePhone': 'Limgal nde renndintee (9 limle):',
  'ask.biller': 'Suɓo fakture:',
  'ask.billReference': 'Lammba fakture:',
  'ask.term': 'Ko honɗum?\n1. Njoɓdi\n2. Keɓal\n3. Keɓoowo\n4. Tabbitgol',
  'ask.language': 'Suɓo ɗemngal:\n1. Francais\n2. English\n3. Fulfulde',
  'confirm.transfer': 'Neldugol {amount} ka {recipient}. Njoɓdi {fee}. Fof {total}.',
  'confirm.airtime': 'Kerdii {amount} ngam {phone}. Njoɓdi {fee}. Fof {total}.',
  'confirm.bill': 'Fakture {biller} {reference}: {amount}. Njoɓdi {fee}. Fof {total}.',
  'confirm.choose': '1. Tabbitin\n2. Haaytu',
  'confirm.edit': '3. Waylu ceede',
  'confirm.retry': 'Tii 1 ngam tabbitinde walla 2 ngam haaytude.',
  'done.transfer': '{amount} neldaama ka {recipient}. Limgal {ref}. Ceede keddiiɗe {balance}.',
  'done.airtime': 'Kerdii {amount} neldaama ka {phone}. Limgal {ref}.',
  'done.bill': 'Fakture {biller} yoɓaama: {amount}. Limgal {ref}.',
  'done.cancel': 'Golle ndee haaytaama. Ceede fof ittaaka.',
  balance: 'Ceede maa keddiiɗe: {balance}.',
  fees: 'Ngam {amount}: njoɓdi {fee}. Fof {total}.',
  'history.header': 'Golle maa ɓennuɗe:',
  'history.line': '{date} {label} {amount}',
  'history.empty': 'Golle alaa tawo.',
  'invalid.choice': 'Suɓal moƴƴal alaa.',
  'invalid.amount': 'Ceede ɗee moƴƴaani. Tii limoore, yeru: 1000',
  'invalid.phone': 'Limgal ngal moƴƴaani. 9 limle, yeru: 699000002',
  'invalid.limit': 'Ceede ɗee ɓuri keɓal. Keɓal: {max} FCFA.',
  'ambiguous.beneficiary': 'Yimɓe ɗuuɗɓe. Winndu limgal.',
  'term.fee': 'Njoɓdi ko ceede banki jogitotoo ngam waɗde golle.',
  'term.limit': 'Keɓal ko 500 000 FCFA e kala golle.',
  'term.beneficiary': 'Keɓoowo ko neɗɗo jaɓotoo ceede ɗee.',
  'term.confirmation': 'Ceede ittaaka haa tabbitin-ɗaa, e turnu garoowo.',
  'lang.set': 'Ɗemngal: {language}.',
  'error.INSUFFICIENT_FUNDS': 'Ceede keddiiɗe ɗee paɗaani ngam golle ndee.',
  'error.LIMIT_EXCEEDED': 'Ceede ɗee ɓuri keɓal jaɓaangal.',
  'error.UNKNOWN_BENEFICIARY': 'Keɓoowo tawaaka. Ƴeewto limgal ngal.',
  'error.UNKNOWN_BILLER': 'Fakture anndaaka. Suɓo e doggol ngol.',
  'error.UNKNOWN_ACCOUNT': 'Konta alaa e limgal ngal.',
  'error.INVALID_AMOUNT': 'Ceede ɗee moƴƴaani.',
  'error.TX_NOT_PENDING': 'Golle ndee waylaa tawo.',
  'error.UNAUTHORIZED': 'Golle ɗee keɓaani jooni. Ɗaɓɓit caggal.',
  'error.UNREACHABLE': 'Golle ɗee keɓaani jooni. Ɗaɓɓit caggal.',
  'error.GENERIC': 'Golle ndee waɗaaka. Ɗaɓɓit caggal.',
};

const CATALOGUES: Readonly<Record<GatewayLanguage, Catalogue>> = { fr: FR, en: EN, fub: FUB };

/** Langue réellement servie : les langues que nous n'avons pas relues restent en français. */
export function resolveLanguage(requested: string | null | undefined): GatewayLanguage {
  return requested === 'en' || requested === 'fub' || requested === 'fr' ? requested : 'fr';
}

export const LANGUAGE_NAMES: Readonly<Record<GatewayLanguage, string>> = {
  fr: 'Francais',
  en: 'English',
  fub: 'Fulfulde',
};

export function message(
  language: GatewayLanguage,
  key: MessageKey,
  vars: Readonly<Record<string, string | number>> = {},
): string {
  const template = CATALOGUES[language][key];
  return template.replace(/\{([a-z_]+)\}/gi, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/** « 25 000 FCFA » — espace simple, chiffres intacts, jamais de séparateur traduit. */
export function money(amount: number, currency = 'FCFA'): string {
  const rounded = Math.round(Number(amount) || 0);
  return `${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${currency}`;
}

/**
 * Nom lisible du destinataire : « Fadimatou Bouba (690 000 002) », ou seulement le numéro quand
 * on ne connaît que lui — jamais « 690000002 (690 000 002) ».
 */
export function recipientLabel(name: string | undefined, phone: string | undefined): string {
  const shown = displayPhone(phone ?? '');
  if (!name || name === phone || name.replace(/\D+/g, '') === (phone ?? '').replace(/\D+/g, '')) return shown;
  return `${name} (${shown})`;
}

/** Numéro national : « 677 000 001 », sans indicatif, pour l'affichage USSD. */
export function displayPhone(phone: string): string {
  const national = phone.replace(/^(\+?237)/, '').replace(/\D+/g, '');
  return national.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
}

/** Date courte JJ/MM, sans dépendance de locale (le canal n'a pas de fuseau fiable). */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}
