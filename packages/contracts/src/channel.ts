/**
 * Canaux d'accès. Le cœur ne connaît que ces profils : il ne sait pas « dessiner » un écran,
 * il sait seulement combien de caractères et quel mode d'interaction le canal accepte.
 */
export const CHANNELS = ['mobile', 'web', 'ussd', 'sms', 'ivr', 'atm'] as const;
export type ChannelId = (typeof CHANNELS)[number];

export type InteractionMode = 'rich' | 'menu' | 'text' | 'voice';

export interface ChannelProfile {
  readonly id: ChannelId;
  readonly label: string;
  /** Longueur maximale d'un message sortant, null = illimité. */
  readonly maxChars: number | null;
  readonly mode: InteractionMode;
  /** Le canal sait-il afficher des choix numérotés (USSD, SVI, GAB) ? */
  readonly numberedOptions: boolean;
}

export const CHANNEL_PROFILES: Readonly<Record<ChannelId, ChannelProfile>> = {
  mobile: { id: 'mobile', label: 'Application mobile', maxChars: null, mode: 'rich', numberedOptions: false },
  web: { id: 'web', label: 'Banque en ligne', maxChars: null, mode: 'rich', numberedOptions: false },
  ussd: { id: 'ussd', label: 'USSD', maxChars: 182, mode: 'menu', numberedOptions: true },
  sms: { id: 'sms', label: 'SMS', maxChars: 160, mode: 'text', numberedOptions: true },
  ivr: { id: 'ivr', label: 'Serveur vocal (SVI)', maxChars: null, mode: 'voice', numberedOptions: true },
  atm: { id: 'atm', label: 'Guichet automatique', maxChars: 240, mode: 'menu', numberedOptions: true },
};

export function isChannelId(value: string): value is ChannelId {
  return (CHANNELS as readonly string[]).includes(value);
}
