import { bubbleCardFor } from '@nkap/client';
import { useNkap } from '@nkap/react';
import { useEffect } from 'react';
import { NkapBubble } from 'nkap-bubble';

/**
 * Répond aux lectures d'écran de la bulle, où que soit l'utilisateur dans l'app.
 * La fiche est rendue dans la langue de la conversation : parler pidgin à l'assistant
 * suffit pour que la bulle explique les écrans en pidgin.
 */
export function BubbleBridge(): null {
  const { chat } = useNkap();
  useEffect(() => {
    if (NkapBubble === null) return undefined;
    const bubble = NkapBubble;
    const subscription = bubble.addListener('onScreenRead', (event) => {
      bubble.showCard(bubbleCardFor(event, chat.getSnapshot().lang));
    });
    return () => subscription.remove();
  }, [chat]);
  return null;
}
