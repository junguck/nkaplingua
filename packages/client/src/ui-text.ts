import { LANGUAGES, type LanguageCode, type TranslationStatus } from '@nkap/contracts';
import { renderTemplate, type RenderedText, type TemplateSet } from '@nkap/core';

/**
 * Libellés d'interface (web, mobile). Formes nationales reprises du glossaire de présélection
 * (statut « proposé ») ; une entrée sans forme nationale retombe sur le français, signalée —
 * jamais de traduction inventée pour remplir un bouton.
 */
export const UI_TEXT = {
  'ui.home': { fr: 'Accueil', en: 'Home', fub: 'Fuɗɗorde', wes: 'Haus' },
  'ui.assistant': { fr: 'Assistant', en: 'Assistant' },
  'ui.balance': { fr: 'Solde disponible', en: 'Available balance', fub: 'Ceede keddiiɗe', wes: 'Balans' },
  'ui.history': { fr: 'Dernières opérations', en: 'Recent activity', fub: 'Golle ɓennuɗe', wes: 'Ol di tins wey you don do' },
  'ui.history.empty': { fr: 'Aucune opération.', en: 'No transactions yet.' },
  'ui.send': { fr: 'Envoyer', en: 'Send', fub: 'Neldu', wes: 'Sen' },
  'ui.confirm': { fr: 'Confirmer', en: 'Confirm', fub: 'Tabbitin', wes: 'Confam' },
  'ui.cancel': { fr: 'Annuler', en: 'Cancel', fub: 'Accu', wes: 'Cancel am' },
  'ui.listen': { fr: 'Écouter', en: 'Listen', fub: 'Nan', wes: 'Hear am' },
  'ui.help': { fr: 'Aide', en: 'Help', fub: 'Wallu', wes: 'Hep' },
  'ui.placeholder': { fr: 'Écrivez ou parlez à l’assistant…', en: 'Type or talk to the assistant…' },
  'ui.voice.review': { fr: 'Texte reconnu — vérifiez-le avant l’envoi.', en: 'Recognized text — review it before sending.' },
  'ui.voice.confirm': { fr: 'Confirmer le texte', en: 'Confirm text' },
  'ui.voice.edit': { fr: 'Modifier', en: 'Edit' },
  'ui.mic': { fr: 'Parler', en: 'Speak' },
  'ui.mic.unavailable': {
    fr: 'Aucune reconnaissance vocale n’existe pour cette langue : écrivez, ou utilisez les boutons.',
    en: 'No speech recognition exists for this language: type, or use the buttons.',
  },
  'ui.mic.listening': { fr: 'Je vous écoute…', en: 'Listening…' },
  'ui.language': { fr: 'Langue', en: 'Language' },
  'ui.unvalidated': {
    fr: 'traduction pas encore validée par des locuteurs',
    en: 'not yet checked by native speakers',
    fub: 'fulɓe ndaartaaki tawo',
    wes: 'native speaker never check am yet',
  },
  'ui.fallback': { fr: 'certaines phrases sont affichées en français', en: 'some sentences are shown in French' },
  'ui.lockedValues': {
    fr: 'Montants, noms et numéros ne sont jamais traduits',
    en: 'Amounts, names and numbers are never translated',
    fub: 'Limle e inɗe mbaylaaki',
  },
  'ui.offline': { fr: 'Moteur embarqué · fonctionne hors ligne', en: 'On-device engine · works offline' },
  'ui.trace': { fr: 'Trace jury', en: 'Jury trace' },
  'ui.welcome': {
    fr: 'Demandez dans votre langue : « Neldu ujineere jowi ka Fadimatou », « Abeg sen faiv tausand give Maman », « Quel est mon solde ? »',
    en: 'Ask in your language: “Neldu ujineere jowi ka Fadimatou”, “Abeg sen faiv tausand give Maman”, “What is my balance?”',
  },
  'ui.in': { fr: 'Reçu', en: 'Received' },
  'ui.out': { fr: 'Envoyé', en: 'Sent' },
  'ui.bubble': { fr: 'Bulle', en: 'Bubble' },
  'ui.bubble.title': { fr: 'Bulle « touche pour comprendre »', en: '“Tap to understand” bubble' },
  'ui.bubble.pitch': {
    fr: 'Touchez la bulle au-dessus de votre application financière : je lis l’écran une seule fois et je vous explique montant, frais, total et risques, dans votre langue.',
    en: 'Tap the bubble over your financial app: I read the screen once and explain amount, fees, total and risks, in your language.',
  },
  'ui.bubble.overlay': { fr: 'Afficher par-dessus les autres applis', en: 'Display over other apps' },
  'ui.bubble.accessibility': { fr: 'Lecture d’écran à la demande', en: 'On-demand screen reading' },
  'ui.bubble.start': { fr: 'Lancer la bulle', en: 'Start the bubble' },
  'ui.bubble.stop': { fr: 'Arrêter la bulle', en: 'Stop the bubble' },
  'ui.bubble.allowed': { fr: 'Applications autorisées', en: 'Allowed apps' },
  'ui.bubble.privacy': {
    fr: 'Rien n’est lu en arrière-plan. Rien ne quitte le téléphone. Seules les applis de la liste sont lues.',
    en: 'Nothing is read in the background. Nothing leaves the phone. Only listed apps are read.',
  },
  'ui.bubble.try': { fr: 'Essayer sur un écran exemple', en: 'Try on a sample screen' },
  'ui.bubble.unsupported': { fr: 'La bulle n’existe que sur Android.', en: 'The bubble is Android only.' },
  'ui.bubble.accessibilityOff': {
    fr: 'Activez « Lecture d’écran à la demande » de NkapLingua dans les réglages d’accessibilité.',
    en: 'Turn on NkapLingua “On-demand screen reading” in the accessibility settings.',
  },
  'ui.granted': { fr: 'Autorisé', en: 'Granted' },
  'ui.grant': { fr: 'Autoriser', en: 'Allow' },
  'status.reference': { fr: 'Référence', en: 'Reference' },
  'status.validated': { fr: 'Validé par des locuteurs', en: 'Validated by speakers' },
  'status.attested': { fr: 'Attesté', en: 'Attested' },
  'status.proposed': { fr: 'Proposé', en: 'Proposed' },
  'status.draft': { fr: 'Brouillon', en: 'Draft' },
} as const satisfies Readonly<Record<string, TemplateSet>>;

export type UiTextKey = keyof typeof UI_TEXT;

export function uiText(key: UiTextKey, lang: LanguageCode): RenderedText {
  return renderTemplate(UI_TEXT[key], lang, {}, key);
}

/** Raccourci quand seul le texte compte (attribut, titre). */
export function t(key: UiTextKey, lang: LanguageCode): string {
  return uiText(key, lang).text;
}

export function statusLabel(status: TranslationStatus, lang: LanguageCode): string {
  return t(`status.${status}`, lang);
}

/** Un texte national non validé doit être signalé à l'utilisateur (honnêteté linguistique). */
export function needsReviewBadge(status: TranslationStatus): boolean {
  return status === 'proposed' || status === 'draft';
}

export const SUPPORTED_LANGUAGES: readonly LanguageCode[] = LANGUAGES;
