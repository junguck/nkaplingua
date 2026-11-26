// Lecture : enregistrement natif si présent, sinon synthèse FRANÇAISE (fr-FR) — jamais une autre langue.
let current = null, audioEl = null;
const voices = () => new Promise((res) => {
  const v = speechSynthesis.getVoices(); if (v.length) return res(v);
  speechSynthesis.addEventListener('voiceschanged', () => res(speechSynthesis.getVoices()), { once: true });
  setTimeout(() => res(speechSynthesis.getVoices()), 1500);
});
export function unlock() { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch {} }
export function cancel() { current?.(); current = null; speechSynthesis.cancel(); if (audioEl) { audioEl.pause(); audioEl = null; } }
export async function speakFr(text, rate = 0.9) {
  const all = await voices();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR'; u.rate = rate;
  u.voice = all.find((v) => v.lang === 'fr-FR') ?? all.find((v) => v.lang?.startsWith('fr')) ?? null;
  return new Promise((res) => {
    let done = false; const fin = () => { if (!done) { done = true; clearTimeout(wd); res(); } };
    const wd = setTimeout(fin, 2500 + text.length * 90); // la synthèse Chrome ne déclenche parfois jamais onend
    current = fin; u.onend = u.onerror = fin; speechSynthesis.speak(u);
  });
}
export function playBlob(blob) {
  return new Promise((res) => {
    const url = URL.createObjectURL(blob); audioEl = new Audio(url); current = res;
    audioEl.onended = audioEl.onerror = () => { URL.revokeObjectURL(url); res(); };
    audioEl.play().catch(res);
  });
}
// Priorité : enregistrement natif > brouillon (voix FR approximative, si activé) > français facile.
export async function play(item, rate) {
  if (item.rec) return playBlob(item.rec.blob);
  return speakFr(item.draftSpoken ?? item.spoken, rate);
}
