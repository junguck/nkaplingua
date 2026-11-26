import type { TermId } from '@nkap/contracts';
import type { TemplateSet } from './types';

export interface TermEntry {
  /** Formes qui désignent le terme, toutes langues confondues (repliées à la comparaison). */
  readonly cues: readonly string[];
  readonly label: TemplateSet;
  readonly explanation: TemplateSet;
}

/**
 * Terminologie financière expliquée. Les libellés fulfulde et pidgin viennent du glossaire
 * de présélection (statut « proposé ») ; les phrases d'explication composées pour la finale
 * sont marquées « draft » tant qu'un locuteur ne les a pas relues.
 *
 * Ewondo (`ewo`) et bulu (`bul`) : LIBELLÉS recopiés tels quels de ewo.json / bul.json (statut « proposé »,
 * jamais relus par un locuteur). Aucune explication n'est rédigée dans ces langues : elle retombe sur le
 * français avec le repli signalé. Un terme sans libellé ewo/bul n'a simplement pas encore été fourni.
 */
export const TERMS_LEXICON: Readonly<Record<TermId, TermEntry>> = {
  fees: {
    cues: ['frais', 'commission', 'fee', 'fees', 'charges', 'njoɓdi', 'mɔni ba nɔŋ'],
    label: { fr: 'Frais', en: 'Fees', fub: 'Njoɓdi', wes: 'Charges', ewo: 'Í mɔ̄ní bá nɔ́ŋ' },
    explanation: {
      fr: "Les frais, c'est l'argent que le service prend pour faire l'opération. Ils s'ajoutent au montant : montant + frais = total.",
      en: 'Fees are the money the service takes to carry out the operation. They are added to the amount: amount + fees = total.',
      fub: { text: 'Njoɓdi ko ceede ɗe sarwis ittata ngam golle ɗen. Ceede + njoɓdi = fof.', status: 'draft' },
      wes: { text: 'Charges na di moni wey di sevis go chop for do di transaction. Moni + charges = total.', status: 'draft' },
    },
  },
  balance: {
    cues: ['solde', 'balance', 'balans', 'ceede keddiiɗe', 'mɔni a lig a nkɔp'],
    label: { fr: 'Solde', en: 'Balance', fub: 'Ceede keddiiɗe', wes: 'Balans', ewo: 'Í mɔ̄ní á líg á ǹkɔ́p' },
    explanation: {
      fr: "Le solde, c'est l'argent qui reste sur votre compte maintenant.",
      en: 'The balance is the money left in your account right now.',
      fub: 'Ceede keddiiɗe (solde): ko ceede heddii e konte maa jooni.',
      wes: 'Balans na di moni wey e remain for ya akaunt now.',
    },
  },
  total: {
    cues: ['total', 'montant total', 'total a debiter', 'fof', 'ol togeda', 'mɔni a sə'],
    label: { fr: 'Total', en: 'Total', fub: 'Fof', wes: 'Total', ewo: 'Mɔ̄ní á sə' },
    explanation: {
      fr: "Le total, c'est tout ce qui sort de votre compte : le montant envoyé plus les frais.",
      en: 'The total is everything that leaves your account: the amount sent plus the fees.',
      fub: 'Fuu (ceede + njoɓdi): ko fof ko yaltata e konte maa.',
      wes: 'Ol togeda (moni + charges): na everytin wey go komot for ya akaunt.',
    },
  },
  beneficiary: {
    cues: ['beneficiaire', 'destinataire', 'beneficiary', 'recipient', 'mo heɓata', 'mod a nɔŋ mɔni', 'mote a bi mone'],
    label: { fr: 'Bénéficiaire', en: 'Beneficiary', fub: 'Mo heɓata ceede', wes: 'Pesin wey go receive', ewo: 'Í mód á nɔ́ŋ mɔ̄ní', bul: 'Mote a bi moné' },
    explanation: {
      fr: "Le bénéficiaire, c'est la personne qui reçoit l'argent. Vérifiez toujours son nom et son numéro.",
      en: 'The beneficiary is the person who receives the money. Always check their name and number.',
      fub: { text: 'Mo heɓata ceede. Ndaar innde e limgal makko no feewi.', status: 'draft' },
      wes: 'Pesin wey go receive di moni. Check di nem an di nomba fine fine.',
    },
  },
  irreversible: {
    cues: ['irreversible', 'definitif', 'waawaa artirteede'],
    label: { fr: 'Irréversible', en: 'Irreversible', fub: 'Waawaa artirteede', wes: 'You no fit change am again' },
    explanation: {
      fr: "Irréversible : après confirmation, on ne peut plus annuler. L'argent part pour toujours.",
      en: 'Irreversible: once confirmed, it cannot be undone. The money is gone for good.',
      fub: 'Si a tabbitinii, waawaa artirteede. Ceede ɗen yahii.',
      wes: 'When you confam, you no fit cancel am again. Di moni don go for good.',
    },
  },
  pin: {
    cues: ['code pin', 'pin', 'code secret', 'mot de passe', 'sirri'],
    label: { fr: 'Code secret (PIN)', en: 'PIN', fub: 'Lammba sirri', wes: 'Secret code (PIN)' },
    explanation: {
      fr: 'Le code secret protège votre argent. Ne le donnez JAMAIS à personne, même pas à un agent.',
      en: 'Your PIN protects your money. NEVER give it to anyone, not even an agent.',
      fub: 'Taa hokku neɗɗo sirri maa (PIN) abada! Hay ajan.',
      wes: 'Neva give ya secret code (PIN) to anybody. At all at all!',
    },
  },
  otp: {
    cues: ['otp', 'code de validation', 'code recu par sms'],
    label: { fr: 'Code reçu par SMS', en: 'One-time code', fub: 'Sirri SMS', wes: 'SMS code' },
    explanation: {
      fr: 'Le code reçu par SMS est secret : ne le donnez JAMAIS à personne.',
      en: 'The code received by SMS is secret: NEVER share it.',
      fub: 'Sirri SMS ngon ko sirri: taa hokku neɗɗo abada!',
      wes: 'Di code wey dem sen for SMS na secret. Neva give am to anybody!',
    },
  },
  limit: {
    cues: ['plafond', 'limite', 'limit', 'keerol'],
    label: { fr: 'Plafond', en: 'Limit', fub: 'Keerol', wes: 'Limit' },
    explanation: {
      fr: "Le plafond, c'est le montant maximum que vous pouvez envoyer en une fois ou par jour.",
      en: 'The limit is the maximum amount you can send at once or per day.',
      fub: { text: 'Keerol ko ceede ɓurɗe ɗe waawaa neldude e golle go’o.', status: 'draft' },
      wes: 'Limit na di moni wey you no fit pass when you sen.',
    },
  },
  airtime: {
    cues: ['credit de communication', 'unites', 'airtime', 'kerdii'],
    label: { fr: 'Crédit de communication', en: 'Airtime', fub: { text: 'Kerdii', status: 'attested' }, wes: 'Kredit for fon' },
    explanation: {
      fr: "Le crédit de communication, c'est l'argent pour appeler et envoyer des SMS.",
      en: 'Airtime is the money used for calls and text messages.',
      fub: { text: 'Kerdii: ceede ngam apeel e mesaas.', status: 'draft' },
      wes: 'Kredit for fon na di moni for call an sen SMS.',
    },
  },
  withdraw: {
    cues: ['retrait', 'withdrawal', 'yaltingo ceede', 'nɔŋ mɔni'],
    label: { fr: 'Retrait', en: 'Withdrawal', fub: 'Yaltingo ceede', wes: 'Comot moni', ewo: 'Á nɔ́ŋ mɔ̄ní' },
    explanation: {
      fr: "Le retrait, c'est sortir votre argent en espèces chez un agent ou au guichet automatique, avec un code.",
      en: 'A withdrawal means taking your money out in cash at an agent or ATM, with a code.',
      fub: { text: 'Yaltingo ceede: heɓugo ceede e juuɗe e ajan walla e masiŋ, e lammba.', status: 'draft' },
      wes: 'Comot moni na wen you take ya moni for cash for agent or ATM, wit code.',
    },
  },
  deposit: {
    cues: ['depot', 'deposit', 'naatngo ceede', 'fud mɔni'],
    label: { fr: 'Dépôt', en: 'Deposit', fub: 'Naatngo ceede e konte', wes: 'Put moni for akaunt', ewo: 'Á fúd mɔ̄ní' },
    explanation: {
      fr: "Le dépôt, c'est mettre de l'argent sur votre compte, chez un agent.",
      en: 'A deposit means putting money into your account at an agent.',
      fub: 'Naatngo ceede e konte maa, e ajan.',
      wes: 'Put moni for ya akaunt for agent.',
    },
  },
  history: {
    cues: ['historique', 'history', 'releve', 'golle ɓennuɗe'],
    label: { fr: 'Historique', en: 'History', fub: 'Golle ɓennuɗe', wes: 'History' },
    explanation: {
      fr: "L'historique, c'est la liste de vos opérations passées : envois, réceptions, paiements.",
      en: 'The history is the list of your past operations: sent, received, paid.',
      fub: 'Golle ɓennuɗe: ko a waɗi e konte maa.',
      wes: 'Ol di tins wey you don do for ya akaunt.',
    },
  },
  reference: {
    cues: ['reference', 'numero de transaction', 'limgal golle'],
    label: { fr: 'Référence', en: 'Reference', fub: 'Limgal golle', wes: 'Transaction nomba' },
    explanation: {
      fr: "La référence est le numéro de l'opération. Gardez-la : c'est votre preuve.",
      en: 'The reference is the operation number. Keep it: it is your proof.',
      fub: 'Limgal golle: resu ɗum ngam seedeeje.',
      wes: 'Nomba for di transaction. Keep am as proof.',
    },
  },
  agent: {
    cues: ['agent', 'point de service', 'ajan'],
    label: { fr: 'Agent', en: 'Agent', fub: 'Ajan', wes: 'Agent' },
    explanation: {
      fr: "L'agent est un commerçant agréé où l'on dépose et retire de l'argent. Il ne demande jamais votre code secret.",
      en: 'An agent is an approved shop where you deposit and withdraw money. They never ask for your PIN.',
      fub: 'Ajan goonga naamnataa sirri maa abada.',
      wes: 'Agent na sevis point. Real agent neva ask ya secret code.',
    },
  },
  fraud: {
    cues: ['arnaque', 'fraude', 'escroquerie', 'scam', 'fraud', 'feyman', 'jamfa', 'gujjo'],
    label: { fr: 'Arnaque', en: 'Scam', fub: 'Jamfa', wes: 'Feyman bizness' },
    explanation: {
      fr: 'Une arnaque, c’est quelqu’un qui veut votre argent ou votre code. Un vrai service ne demande JAMAIS votre code ni de payer pour recevoir un gain.',
      en: 'A scam is someone after your money or your code. A real service NEVER asks for your PIN or for payment to receive a prize.',
      fub: 'Sarwis goongaajo naamnataa sirri maa abada. Ɗum jamfa!',
      wes: 'Real sevis neva ask ya secret code, an neva ask you pay before you receive prize. Na feyman!',
    },
  },
  interest: {
    cues: ['interet', 'interets', 'interest', 'ɓeydaari'],
    label: { fr: 'Intérêts', en: 'Interest', fub: 'Ɓeydaari', wes: 'Interest' },
    explanation: {
      fr: "Les intérêts, c'est l'argent en plus qu'il faut rendre quand on emprunte.",
      en: 'Interest is the extra money you pay back when you borrow.',
      fub: 'Ɓeydaari (ko ɓeydete) ngam ñamaande.',
      wes: 'Interest na moni wey you go add when you pay back loan.',
    },
  },
  loan: {
    cues: ['pret', 'emprunt', 'loan', 'ñamaande', 'kol mɔni'],
    label: { fr: 'Prêt', en: 'Loan', fub: 'Ñamaande', wes: 'Loan', ewo: 'Í kól mɔ̄ní' },
    explanation: {
      fr: "Un prêt, c'est de l'argent emprunté qu'il faut rembourser, souvent avec des intérêts.",
      en: 'A loan is borrowed money you must pay back, often with interest.',
      fub: 'Ñamaande: ceede ɓe artirta.',
      wes: 'Loan na moni wey you go pay back.',
    },
  },
};
