import type { BubbleCardPayload, ScreenReadEvent } from '@nkap/client';
import { NativeModule, requireOptionalNativeModule } from 'expo';

type BubbleEvents = {
  onScreenRead: (event: ScreenReadEvent) => void;
  onRunningChange: (event: { readonly running: boolean }) => void;
};

declare class NkapBubbleNative extends NativeModule<BubbleEvents> {
  hasOverlayPermission(): boolean;
  openOverlaySettings(): void;
  isAccessibilityEnabled(): boolean;
  openAccessibilitySettings(): void;
  setAllowedPackages(packages: readonly string[]): void;
  getAllowedPackages(): string[];
  /** Lève une erreur si la permission de superposition manque. */
  start(): void;
  stop(): boolean;
  isRunning(): boolean;
  /** Faux si la bulle n'est pas lancée. */
  showCard(card: BubbleCardPayload): boolean;
}

/**
 * `null` sur iOS, le web et Expo Go : la bulle exige un build de développement Android
 * (`pnpm --filter @nkap/mobile android`). Les écrans testent cette valeur au lieu de planter.
 */
export const NkapBubble: NkapBubbleNative | null = requireOptionalNativeModule<NkapBubbleNative>('NkapBubble');

/**
 * Liste blanche par défaut. Chrome sert la démonstration sur les simulateurs web SAFINUM.
 * Les identifiants réels des applis MoMo / Orange Money se relèvent sur l'appareil
 * (`adb shell pm list packages`) avant de les ajouter : on n'en invente pas.
 */
export const DEFAULT_ALLOWED_PACKAGES: readonly string[] = ['com.android.chrome'];
