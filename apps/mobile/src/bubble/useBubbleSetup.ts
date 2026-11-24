import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { DEFAULT_ALLOWED_PACKAGES, NkapBubble } from 'nkap-bubble';

export interface BubbleSetup {
  readonly supported: boolean;
  readonly overlay: boolean;
  readonly accessibility: boolean;
  readonly running: boolean;
  readonly allowed: readonly string[];
  readonly error: string | null;
}

const UNSUPPORTED: BubbleSetup = { supported: false, overlay: false, accessibility: false, running: false, allowed: [], error: null };

function read(error: string | null = null): BubbleSetup {
  if (NkapBubble === null) return UNSUPPORTED;
  return {
    supported: true,
    overlay: NkapBubble.hasOverlayPermission(),
    accessibility: NkapBubble.isAccessibilityEnabled(),
    running: NkapBubble.isRunning(),
    allowed: NkapBubble.getAllowedPackages(),
    error,
  };
}

/** État des autorisations, relu au retour des réglages Android (l'utilisateur y accorde les droits). */
export function useBubbleSetup(): BubbleSetup & { readonly toggle: () => void } {
  const [state, setState] = useState<BubbleSetup>(() => {
    if (NkapBubble !== null && NkapBubble.getAllowedPackages().length === 0) NkapBubble.setAllowedPackages(DEFAULT_ALLOWED_PACKAGES);
    return read();
  });

  useEffect(() => {
    if (NkapBubble === null) return undefined;
    const onActive = AppState.addEventListener('change', (s) => s === 'active' && setState(read()));
    const onRunning = NkapBubble.addListener('onRunningChange', () => setState(read()));
    return () => {
      onActive.remove();
      onRunning.remove();
    };
  }, []);

  const toggle = useCallback((): void => {
    if (NkapBubble === null) return;
    try {
      if (NkapBubble.isRunning()) NkapBubble.stop();
      else NkapBubble.start();
      setState(read());
    } catch (e) {
      setState(read(e instanceof Error ? e.message : String(e)));
    }
  }, []);

  return { ...state, toggle };
}
