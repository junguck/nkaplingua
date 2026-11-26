// Lit un enregistrement natif validé pour une notification (le service worker ne peut pas jouer d'audio).
import { getRec } from './lib/audio-store.js';
chrome.runtime.onMessage.addListener((m) => {
  if (m?.target !== 'offscreen' || m.type !== 'play') return;
  getRec(m.lang, m.key).then((r) => {
    if (!r) return;
    const url = URL.createObjectURL(r.blob);
    const a = new Audio(url); a.onended = () => URL.revokeObjectURL(url); a.play();
  });
});
