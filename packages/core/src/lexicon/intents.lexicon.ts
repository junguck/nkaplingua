import type { CueSpec, IntentLexicon } from './types';

/**
 * Indices d'intention par langue. Un `*` final accepte les conjugaisons (« envo* »).
 * Les formes fulfulde et pidgin sont des PROPOSITIONS à faire valider par des locuteurs :
 * elles s'appuient sur le glossaire de présélection (neldugo, njoɓdi, kerdii, yaltingo…).
 *
 * Ewondo (`ewo`) et bulu (`bul`) : indices tirés UNIQUEMENT des glossaires ewo.json / bul.json
 * (statut « proposé », jamais relus par un locuteur). Une intention absente pour ces langues
 * veut dire « aucun mot attesté », pas « aucun mot n'existe » : à compléter avec des locuteurs.
 * Les indices sont comparés après repli (ɔ→o, ə→e, ŋ→ng, tons et apostrophes supprimés).
 */
export const INTENT_CUES: IntentLexicon = {
  CHECK_BALANCE: {
    fr: [['solde', 3], ['combien il me reste', 3], ['combien j ai', 3], ['ce qui reste', 2], ['mon compte', 1]],
    en: [['balance', 3], ['how much do i have', 3], ['how much is left', 3]],
    wes: [['balans', 3], ['moni wey remain', 3], ['haw moch i get', 3], ['wetin remain', 3]],
    fub: [['keddii*', 3], ['heddii*', 3], ['ceede am', 1], ['ceede maa', 1]],
    ewo: [['mɔni a lig', 3], ['lig a nkɔp', 2], ['nkɔp', 1]],
  },
  TRANSFER: {
    fr: [['envo*', 3], ['transf*', 3], ['virement', 3], ['fais passer', 3], ['donne', 1]],
    en: [['send', 3], ['transfer', 3], ['give', 1]],
    wes: [['sen', 3], ['sen moni', 3], ['giv', 1]],
    fub: [['neld*', 3], ['hokku', 1]],
    ewo: [['lom', 3], ['lom moni', 3]],
    bul: [['lom*', 3], ['lom mone', 3]],
  },
  CHECK_FEES: {
    fr: [['frais', 3], ['commission', 3], ['tarif*', 2], ['combien ca coute', 3], ['ca coute', 2]],
    en: [['fee', 3], ['fees', 3], ['charge', 2], ['charges', 2], ['how much does it cost', 3]],
    wes: [['charges', 3], ['haw moch dem go chop', 3]],
    fub: [['njoɓdi', 3]],
    ewo: [['moni ba nɔŋ', 3]],
  },
  TX_HISTORY: {
    fr: [['historique', 3], ['dernieres operations', 3], ['mes operations', 3], ['mouvements', 2], ['releve', 2], ['transactions', 2]],
    en: [['history', 3], ['transactions', 2], ['statement', 2], ['last operations', 3]],
    wes: [['history', 3], ['tins wey i don do', 3], ['transaction dem', 3]],
    fub: [['golle ɓennuɗe', 3], ['golle am', 2]],
  },
  BUY_AIRTIME: {
    fr: [['credit de communication', 4], ['credit telephone', 4], ['recharge*', 3], ['unites', 3], ['airtime', 3], ['credit', 2]],
    en: [['airtime', 3], ['top up', 3], ['topup', 3], ['credit', 2]],
    wes: [['kredit', 3], ['credit for fon', 4], ['top up', 3]],
    fub: [['kerdii', 3]],
  },
  PAY_BILL: {
    fr: [['facture', 3], ['payer', 1], ['eneo', 3], ['camwater', 3], ['canal', 2], ['electricite', 2], ['courant', 1]],
    en: [['bill', 3], ['pay', 1], ['electricity', 2]],
    wes: [['bill', 3], ['pay', 1], ['light bill', 3], ['wata bill', 3]],
    fub: [['fakture', 3], ['yoɓ*', 1]],
    ewo: [['yanər', 1]],
    bul: [["ya'ane", 1]],
  },
  WITHDRAW: {
    fr: [['retir*', 3], ['retrait', 3], ['sortir de l argent', 3], ['cash out', 3]],
    en: [['withdraw*', 3], ['cash out', 3], ['cashout', 3]],
    wes: [['comot moni', 3], ['komot moni', 3], ['withdraw', 3]],
    fub: [['yalting*', 3], ['yaltin*', 3]],
    // « nɔŋ moni » figure aussi dans « mód á nɔŋ moni » (bénéficiaire) : poids 2 < envoi (3).
    ewo: [['nɔŋ moni', 2]],
  },
  EXPLAIN_TERM: {
    fr: [['c est quoi', 3], ['qu est ce que', 3], ['que veut dire', 3], ['ca veut dire quoi', 3], ['explique', 3], ['signifie', 3]],
    en: [['what is', 3], ['what are', 3], ['what does', 3], ['explain', 3], ['meaning', 3]],
    wes: [['wetin be', 3], ['wetin mean', 3], ['explain', 3]],
    fub: [['ko woni', 3], ['ko ɗum woni', 3], ['firo', 3]],
  },
  GREETING: {
    fr: [['bonjour', 2], ['bonsoir', 2], ['salut', 2]],
    en: [['hello', 2], ['hi', 2], ['good morning', 2]],
    wes: [['how na', 2], ['ashia', 2]],
    fub: [['jam', 1], ['a nyalli jam', 2], ['a waali jam', 2], ['a hirti jam', 2], ['sannu', 2]],
  },
  HELP: {
    fr: [['aide', 3], ['aidez moi', 3], ['menu', 2], ['que puis je faire', 3]],
    en: [['help', 3], ['menu', 2]],
    wes: [['hep', 3], ['help', 3]],
    fub: [['ballal', 3], ['wallu', 2]],
    ewo: [['voili', 3]],
  },
};

/**
 * Oui / Non : comptés seulement en tête d'énoncé. « no » veut dire « comment » en fulfulde,
 * « non » ouvre aussi une correction (« non, 3000 »).
 * Ces listes sont communes à toutes les langues. Ewondo « non » (« Á yé » dans ewo.json) n'est
 * pas repris : forme douteuse, à faire confirmer avant d'en faire un indice d'annulation.
 */
export const CONFIRM_CUES: readonly CueSpec[] = [
  ['oui', 3], ['ok', 3], ['d accord', 3], ['confirme', 3], ['je confirme', 3], ['vas y', 3], ['valide', 3],
  ['yes', 3], ['confirm', 3], ['go ahead', 3],
  ['ehen', 3], ['na so', 3], ['confam', 3],
  ['eey', 3], ['ee', 3], ['tabbitin', 3],
  ['owe', 3], // ewondo « Owé » (term.yes)
];

export const CANCEL_CUES: readonly CueSpec[] = [
  ['non', 3], ['annule', 3], ['annuler', 3], ['stop', 3], ['laisse tomber', 3],
  ['no', 3], ['cancel', 3],
  ['cancel am', 3], ['lef am', 3], ['no be dat', 2],
  ['ala', 3], ['accu', 3], ['haɗ', 2],
];

/** Correction en tête d'énoncé : « non, 3000 », « ala, … », « sorry, … ». */
export const CORRECTION_LEADS: readonly string[] = ['non', 'no', 'ala', 'pardon', 'sorry', 'sori', 'yaafam'];

/** Correction n'importe où dans l'énoncé : « plutôt 3000 », « I mean 3000 », « a mean ». */
export const CORRECTION_MARKERS: readonly string[] = [
  'plutot', 'en fait', 'je voulais dire', 'corrige', 'finalement',
  'actually', 'i mean', 'instead', 'a mean', 'no be dat',
];
