/* NkapLingua — fenêtre de l'extension */
const E = self.NkapEngine.init(self.NKAP_DATA);
const $ = (s) => document.querySelector(s);
let S, tab, host;

async function save(patch) {
  S = { ...S, ...patch };
  await chrome.storage.sync.set({ settings: S });
  render();
}
async function loadOverrides() {
  const loc = await chrome.storage.local.get(null);
  for (const [k, v] of Object.entries(loc)) if (k.startsWith('ovr:')) E.setOverrides(k.slice(4), v);
}

const AV = {
  fub: ['Fulfulde', '#DDF46C', '#b9d33a'], wes: ['Pidgin', '#FFD3C6', '#FF7C5C'], ewo: ['Ewondo', '#A6D6EF', '#5fa9d1'],
  dua: ['Duala', '#ECE6FF', '#A38BF3'], bas: ['Basaa', '#F2FAD0', '#b9d33a'], bbj: ['Ghomálá’', '#E1F1FA', '#5fa9d1'], 'fr-facile': ['Facile', '#FFFFFF', '#172430']
};
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function render() {
  $('#enabled').checked = !!S.enabled;
  const order = ['fub', 'wes', 'ewo', 'dua', 'bas', 'bbj', 'fr-facile'].filter((c) => E.data.languages[c]);
  const L = E.data.languages[S.lang] || E.data.languages.fub;
  const cv = E.coverage(L.code);
  const kit = cv.pct < 50;
  $('#current').innerHTML = `<div class="h"><span class="nm">${esc(L.name)}</span><span class="code">${esc(L.code)}</span></div>
    <div class="pct">${cv.pct}<span> % traduit</span></div>
    <div class="meta"><span class="chip">${cv.translated} entrées</span><span class="chip alt">${cv.validated} vérifiées</span>${kit ? '<span class="chip alt">kit de démarrage</span>' : ''}</div>
    <div class="reg">${esc(L.region)}</div>`;
  $('#langs').innerHTML = order.map((c) => {
    const [nm, bg, ring] = AV[c] || [c, '#fff', '#172430'];
    return `<button class="av" role="radio" aria-checked="${S.lang === c}" data-lang="${c}" title="${esc(E.data.languages[c].name)}" style="--ring:${ring}">
      <span class="c" style="background:${bg}">${E.data.languages[c].flag}</span><span class="n">${esc(nm)}</span></button>`;
  }).join('');
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-checked', b.dataset.mode === S.mode));
  document.querySelectorAll('[data-opt]').forEach((i) => { i.checked = !!S[i.dataset.opt]; });
  $('#site').checked = !(S.disabledSites || []).includes(host);
  $('#host').textContent = host || 'ce site';
  const sel = document.querySelector('.av[aria-checked="true"]');
  if (sel) sel.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

async function refreshStats() {
  if (!tab) return;
  try {
    const st = await chrome.tabs.sendMessage(tab.id, { type: 'getState' });
    if (!st) return;
    $('#stats').hidden = false;
    $('#s-units').textContent = st.stats.exact + st.stats.gloss;
    $('#s-ent').textContent = st.stats.entities;
    $('#s-scam').textContent = st.stats.scams;
  } catch { /* page sans script de contenu (ex. chrome://) */ }
}

document.addEventListener('click', async (ev) => {
  const l = ev.target.closest('[data-lang]'); if (l) return save({ lang: l.dataset.lang });
  const m = ev.target.closest('[data-mode]'); if (m) return save({ mode: m.dataset.mode });
  const a = ev.target.closest('[data-act]');
  if (a && tab) { chrome.tabs.sendMessage(tab.id, { type: a.dataset.act }).catch(() => {}); window.close(); }
});
document.addEventListener('change', (ev) => {
  const o = ev.target.closest('[data-opt]'); if (o) return save({ [o.dataset.opt]: o.checked });
  if (ev.target.id === 'enabled') return save({ enabled: ev.target.checked });
  if (ev.target.id === 'site') {
    const set = new Set(S.disabledSites || []);
    ev.target.checked ? set.delete(host) : set.add(host);
    return save({ disabledSites: [...set] });
  }
});
$('#studio').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
$('#repondeur').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('repondeur/app.html') });
  window.close();
});

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { host = new URL(tab.url).host || 'file'; } catch { host = ''; }
  const DEFAULTS = { enabled: true, lang: 'fub', mode: 'bilingue', autoSpeak: false, shield: true, factsheet: true, bigText: false, strict: false, disabledSites: [], llm: { enabled: false } };
  S = { ...DEFAULTS, ...((await chrome.storage.sync.get('settings')).settings || {}) };
  await loadOverrides();
  render();
  refreshStats(); setInterval(refreshStats, 1500);
})();
