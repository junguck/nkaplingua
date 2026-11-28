/**
 * Canaux d'accès. Le cœur ne connaît que ces profils : il ne sait pas « dessiner » un écran,
 * il sait seulement combien de caractères et quel mode d'interaction le canal accepte.
 */
export const CHANNELS = ['mobile', 'web', 'ussd', 'sms', 'ivr', 'atm'] as const;
export type ChannelId = (typeof CHANNELS)[number];

export type InteractionMode = 'rich' | 'menu' | 'text' | 'voice';

/** `gsm7` : alphabet des réseaux USSD/SMS, longueur comptée en septets ; un seul caractère hors alphabet passe le message en UCS-2. */
export type Charset = 'gsm7' | 'utf8';

export interface ChannelProfile {
  readonly id: ChannelId;
  readonly label: string;
  /** Longueur maximale d'un message sortant, null = illimité. */
  readonly maxChars: number | null;
  readonly mode: InteractionMode;
  /** Le canal sait-il afficher des choix numérotés (USSD, SVI, GAB) ? */
  readonly numberedOptions: boolean;
  readonly charset: Charset;
}

export const CHANNEL_PROFILES: Readonly<Record<ChannelId, ChannelProfile>> = {
  mobile: { id: 'mobile', label: 'Application mobile', maxChars: null, mode: 'rich', numberedOptions: false, charset: 'utf8' },
  web: { id: 'web', label: 'Banque en ligne', maxChars: null, mode: 'rich', numberedOptions: false, charset: 'utf8' },
  ussd: { id: 'ussd', label: 'USSD', maxChars: 182, mode: 'menu', numberedOptions: true, charset: 'gsm7' },
  sms: { id: 'sms', label: 'SMS', maxChars: 160, mode: 'text', numberedOptions: true, charset: 'gsm7' },
  ivr: { id: 'ivr', label: 'Serveur vocal (SVI)', maxChars: null, mode: 'voice', numberedOptions: true, charset: 'utf8' },
  atm: { id: 'atm', label: 'Guichet automatique', maxChars: 240, mode: 'menu', numberedOptions: true, charset: 'utf8' },
};

export function isChannelId(value: string): value is ChannelId {
  return (CHANNELS as readonly string[]).includes(value);
}
