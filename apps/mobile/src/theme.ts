import type { ScreenAlertLevel } from '@nkap/client';
import type { TranslationStatus } from '@nkap/contracts';

/** Même identité que le web (vert Mboa Pay, ambre) : un seul produit, plusieurs canaux. */
export const colors = {
  primary: '#0f5a46',
  primaryDark: '#0b4536',
  primarySoft: '#e3f1eb',
  onPrimary: '#ffffff',
  background: '#f6f8f7',
  surface: '#ffffff',
  text: '#1a2621',
  muted: '#62706a',
  border: '#e2e8e5',
  accent: '#f5e6c4',
  onAccent: '#6b4a10',
  danger: '#b42318',
  success: '#1f7a55',
} as const;

export const alertColors: Readonly<Record<ScreenAlertLevel, { readonly bg: string; readonly fg: string }>> = {
  danger: { bg: '#fde4e1', fg: '#aa1e14' },
  warning: { bg: '#fdf1d6', fg: '#784600' },
  info: { bg: '#def3e9', fg: '#0f5a46' },
};

export function statusColors(status: TranslationStatus): { readonly bg: string; readonly fg: string } {
  return status === 'proposed' || status === 'draft' ? alertColors.warning : alertColors.info;
}

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
