// Petit wrapper chrome.storage.local (repli localStorage hors extension).
const area = globalThis.chrome?.storage?.local;
export const DEFAULT_SETTINGS = {
  lang: 'fr-facile',
  offeredLangs: ['fr-facile', 'fub', 'ewo', 'gya'], // max 4 choix par menu (bonne pratique IVR)
  strictAudio: true,   // ne jouer que des enregistrements validés par >= 2 locuteurs
  speakNotif: true,    // lire les notifications à voix haute
  demoFast: true,      // rappels en minutes au lieu de jours (démo)
  draftMode: true,     // utiliser les brouillons IA (non validés) tant qu'il n'y a pas d'enregistrement validé
  draftVoice: true,    // les dire avec une voix FRANÇAISE approximative (test seulement)
  dailyTip: false,     // conseil de sécurité quotidien
  speaker: '',         // nom de la personne qui enregistre/valide dans le Studio
};
export async function get(key, def) {
  try {
    if (area) { const r = await area.get(key); return r[key] ?? def; }
    const v = localStorage.getItem('nk:' + key); return v ? JSON.parse(v) : def;
  } catch { return def; }
}
export async function set(key, val) {
  try { if (area) await area.set({ [key]: val }); else localStorage.setItem('nk:' + key, JSON.stringify(val)); } catch (e) { console.warn('store.set', e); }
}
export const getSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await get('ivrSettings', {})) });
export const saveSettings = (s) => set('ivrSettings', s);
