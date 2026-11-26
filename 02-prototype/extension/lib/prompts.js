// Résolution d'une invite : texte à afficher, texte à dire, audio natif éventuel.
// Politique (issue de la recherche) : on ne PRONONCE une langue que par un enregistrement humain validé ;
// sinon français facile + pictogramme. Jamais de synthèse vocale pour fub/ewo/gya/…
import { fmtAmount, spokenAmount, fmtPhone, digitsSpoken, fmtDate } from './fr.js';
import { getRec, isValidated } from './audio-store.js';
import { fulfuldeForFrenchVoice } from './translit.js';

const NATIVE_OK = new Set(['attested', 'validated']);
export async function loadGlossary(url) {
  url = url || (typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('glossary/ivr.json')
    : new URL('../glossary/ivr.json', import.meta.url));
  const g = await (await fetch(url)).json();
  g.byId = new Map(g.sections.flatMap((s) => s.concepts).map((c) => [c.id, c]));
  g.langName = Object.fromEntries(g.languages.map((l) => [l.code, l.name]));
  return g;
}
const DISPLAY = { AMOUNT: fmtAmount, PHONE: fmtPhone, DATE: fmtDate, CODE: (v) => String(v).replace(/(\d{3})(?=\d)/g, '$1 ') };
const SPOKEN = { AMOUNT: spokenAmount, PHONE: digitsSpoken, CODE: digitsSpoken, REF: digitsSpoken, DATE: fmtDate };
export const expand = (text, params, table) => text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? (table[k] ?? String)(params[k]) : m));
export const hasPlaceholder = (t) => /\{\w+\}/.test(t);

export async function resolve(g, id, lang, params = {}, { strict = true, drafts = false, draftVoice = false } = {}) {
  const c = g.byId.get(id);
  if (!c) return { id, emoji: '❔', display: id, spoken: id, native: null, rec: null, badge: 'FR' };
  const fr = c.cells['fr-facile']?.text ?? id;
  const out = { id, emoji: c.emoji, critical: c.critical, display: expand(fr, params, DISPLAY), spoken: expand(fr, params, SPOKEN), native: null, rec: null, badge: 'FR' };
  if (lang === 'fr-facile') return out;
  const cell = c.cells[lang];
  if (cell && NATIVE_OK.has(cell.status)) out.native = { text: expand(cell.text, params, DISPLAY), status: cell.status };
  // Brouillon IA : affiché seulement en « mode brouillon », jamais prononcé.
  else if (drafts && cell?.status === 'draft') {
    out.draft = expand(cell.text, params, DISPLAY);
    if (draftVoice) out.draftSpoken = expand(fulfuldeForFrenchVoice(cell.text), params, SPOKEN); // voix FR approximative
  }
  // Les phrases avec montant/nom/numéro ne sont pas jouées en natif : les fragments audio de chiffres n'existent pas encore.
  if (!hasPlaceholder(fr)) {
    try {
      const rec = await getRec(lang, id);
      if (rec && (!strict || isValidated(rec))) { out.rec = rec; out.draft = out.draftSpoken = undefined; out.badge = isValidated(rec) ? 'NATIF ✅' : 'NATIF ◌'; }
    } catch (e) { /* IndexedDB indisponible */ }
  }
  return out;
}
