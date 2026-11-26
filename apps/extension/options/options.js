/* NkapLingua — Studio linguistique, laboratoire et réglages IA */
const E = self.NkapEngine.init(self.NKAP_DATA);
const D = self.NKAP_DATA;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ORDER = ['fub', 'wes', 'ewo', 'dua', 'bas', 'bbj', 'fr-facile'];
const STATUS_LABEL = { valide: 'validé', atteste: 'attesté', propose: 'à valider', manquant: 'manquant', rejete: 'rejeté', reference: 'référence' };
const hasChrome = typeof chrome !== 'undefined' && chrome.storage;
const store = {
  async get(k) { return hasChrome ? (await chrome.storage.local.get(k))[k] : JSON.parse(localStorage.getItem(k) || 'null'); },
  async set(k, v) { return hasChrome ? chrome.storage.local.set({ [k]: v }) : localStorage.setItem(k, JSON.stringify(v)); },
  async del(k) { return hasChrome ? chrome.storage.local.remove(k) : localStorage.removeItem(k); }
};

let lang = 'fub', ovr = {}, recs = {};

// ------------------------------------------------------------ onglets
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(id) {
  document.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === id));
  document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.id !== id; });
  history.replaceState(null, '', `#${id}`);
}
if (location.hash) showTab(location.hash.slice(1));

// ------------------------------------------------------------ studio
function fillLangSelect(sel) {
  sel.innerHTML = ORDER.filter((c) => D.languages[c]).map((c) => `<option value="${c}">${D.languages[c].flag} ${esc(D.languages[c].name)}</option>`).join('');
}
fillLangSelect($('#lang')); fillLangSelect($('#labLang'));

async function loadLang(code) {
  lang = code;
  ovr = (await store.get(`ovr:${code}`)) || {};
  E.setOverrides(code, ovr);
  recs = {};
  if (hasChrome) {
    const all = await chrome.storage.local.get(null);
    for (const [k, v] of Object.entries(all)) if (k.startsWith(`rec:${code}:`)) recs[k.slice(`rec:${code}:`.length)] = v;
  }
  renderRows();
}

function current(id) {
  const o = ovr[id];
  const base = D.languages[lang].entries[id];
  const b = base == null ? null : typeof base === 'string' ? { t: base, s: D.languages[lang].default_status || 'propose' } : base;
  if (o) return { ...b, ...o, edited: true };
  return b || { t: '', s: 'manquant' };
}

function renderCoverage() {
  const cv = E.coverage(lang);
  const crit = D.concepts.filter((c) => c.critical);
  const critOk = crit.filter((c) => ['valide', 'atteste'].includes(current(c.id).s)).length;
  $('#cov').innerHTML = `<span><b>${cv.translated}/${cv.total}</b> traduites <span class="bar"><i style="width:${cv.pct}%"></i></span></span>
    <span><b>${cv.validated}</b> attestées ou validées</span><span><b>${critOk}/${crit.length}</b> critiques validées</span>`;
}

function renderRows() {
  renderCoverage();
  const f = $('#filter').value, q = E.norm($('#q').value || '');
  const rows = D.concepts.filter((c) => {
    const cur = current(c.id);
    if (f === 'critical' && !c.critical) return false;
    if (f === 'todo' && !(cur.s === 'propose')) return false;
    if (f === 'missing' && cur.s !== 'manquant') return false;
    if (f === 'valid' && !['valide', 'atteste'].includes(cur.s)) return false;
    if (q && !E.norm(`${c.id} ${(c.fr || []).join(' ')} ${(c.en || []).join(' ')} ${c.easy} ${cur.t}`).includes(q)) return false;
    return true;
  });
  $('#rows').innerHTML = rows.map((c) => {
    const cur = current(c.id);
    const votes = (cur.votes || []).length;
    const slots = (c.easy.match(/\{[A-Z0-9]+\}/g) || []).join(' ');
    return `<div class="r" data-id="${c.id}">
      <div class="ic" aria-hidden="true">${c.icon}${c.critical ? '<span class="crit" title="Critique"></span>' : ''}</div>
      <div class="src"><b>${esc((c.fr || [])[0] || c.easy)}</b>
        <small>FR facile : ${esc(c.easy)}</small>
        ${(c.en || []).length ? `<small>EN : ${esc(c.en[0])}</small>` : ''}
        <code>${c.id}${slots ? ' · à garder : ' + esc(slots) : ''}</code></div>
      <div><textarea aria-label="Traduction ${esc(c.id)}" ${lang === 'fr-facile' ? 'readonly' : ''}>${esc(cur.t || '')}</textarea>
        <div class="meta"><span class="st ${cur.s}">${STATUS_LABEL[cur.s] || cur.s}</span>
        ${votes ? ` · ${votes} validation(s) : ${esc(cur.votes.join(', '))}` : ''}${cur.src ? ` · source : ${esc(cur.src)}` : ''}${recs[c.id] ? ' · 🎙️ voix enregistrée' : ''}</div></div>
      <div class="act">
        <button data-a="save" title="Enregistrer la correction">Enregistrer</button>
        <button data-a="ok" title="Je valide en tant que locuteur natif">Valider</button>
        <button data-a="ko" title="Le sens est faux">Rejeter</button>
        <button data-a="rec" class="rec" title="Enregistrer la prononciation">🎙️ Voix</button>
        ${recs[c.id] ? '<button data-a="play" title="Écouter l\'enregistrement">▶ Écouter</button>' : ''}
      </div></div>`;
  }).join('') || '<p>Aucune entrée.</p>';
}

async function persist() { await store.set(`ovr:${lang}`, ovr); E.setOverrides(lang, ovr); renderRows(); }

let recorder = null;
$('#rows').addEventListener('click', async (ev) => {
  const b = ev.target.closest('button[data-a]'); if (!b) return;
  const row = b.closest('.r'); const id = row.dataset.id; const c = E.concepts[id];
  const who = ($('#validator').value || '').trim();
  const text = row.querySelector('textarea').value.trim();
  const cur = current(id);
  if (b.dataset.a === 'save') {
    const want = [...new Set(c.easy.match(/\{[A-Z0-9]+\}/g) || [])].sort().join();
    const got = [...new Set(text.match(/\{[A-Z0-9]+\}/g) || [])].sort().join();
    if (want !== got) return alert(`Cette phrase doit contenir exactement : ${want || '(aucun emplacement)'}\nCes valeurs (montants, noms…) sont recopiées automatiquement.`);
    if (/\d/.test(text.replace(/\{[A-Z0-9]+\}/g, '')) && id.startsWith('ph.')) return alert('N\'écrivez pas de chiffres : utilisez les emplacements {AMOUNT}, {NUM}…');
    ovr[id] = { t: text, s: 'propose', votes: [], by: who || 'anonyme', at: new Date().toISOString() };
    return persist();
  }
  if (b.dataset.a === 'ok') {
    if (!who) return alert('Indiquez votre nom de validateur·rice en haut de la page.');
    if (!text) return alert('Entrée vide.');
    const votes = [...new Set([...(cur.text === text || cur.t === text ? cur.votes || [] : []), who])];
    ovr[id] = { ...(ovr[id] || {}), t: text, votes, s: votes.length >= 2 ? 'valide' : 'propose', at: new Date().toISOString() };
    return persist();
  }
  if (b.dataset.a === 'ko') { ovr[id] = { ...(ovr[id] || {}), t: text, s: 'rejete', by: who, at: new Date().toISOString() }; return persist(); }
  if (b.dataset.a === 'play') return new Audio(recs[id]).play();
  if (b.dataset.a === 'rec') {
    if (recorder) { recorder.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        recorder = null; b.classList.remove('on');
        const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
        recs[id] = url; await store.set(`rec:${lang}:${id}`, url); renderRows();
      };
      recorder.start(); b.classList.add('on'); b.textContent = '⏹ Arrêter';
      setTimeout(() => recorder && recorder.state === 'recording' && recorder.stop(), 12000);
    } catch (e) { alert('Micro indisponible : ' + e.message); }
  }
});

$('#lang').addEventListener('change', (e) => loadLang(e.target.value));
$('#filter').addEventListener('change', renderRows);
$('#q').addEventListener('input', renderRows);
$('#validator').addEventListener('change', (e) => store.set('validator', e.target.value));

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('#exportJson').addEventListener('click', () => {
  const base = JSON.parse(JSON.stringify(D.languages[lang]));
  for (const [id, o] of Object.entries(ovr)) base.entries[id] = { t: o.t, s: o.s, votes: o.votes, by: o.by, at: o.at };
  base.exported_at = new Date().toISOString();
  download(`${lang}.json`, JSON.stringify(base, null, 2), 'application/json');
});
$('#exportCsv').addEventListener('click', async () => {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const langs = ORDER.filter((c) => D.languages[c]);
  for (const c of langs) E.setOverrides(c, (await store.get(`ovr:${c}`)) || {});
  const lines = [['id', 'critique', 'francais', 'anglais', 'francais_facile', ...langs.flatMap((c) => [c, `${c}_statut`])].map(q).join(',')];
  for (const c of D.concepts) lines.push([c.id, c.critical ? 'oui' : '', (c.fr || []).join(' | '), (c.en || []).join(' | '), c.easy,
    ...langs.flatMap((l) => { const e = E.entry(l, c.id); return [e.fallback ? '' : e.text, e.fallback ? 'manquant' : e.status]; })].map(q).join(','));
  E.setOverrides(lang, ovr);
  download('nkaplingua-glossaire.csv', '﻿' + lines.join('\n'), 'text/csv');
});
$('#importJson').addEventListener('change', async (ev) => {
  const file = ev.target.files[0]; if (!file) return;
  try {
    const j = JSON.parse(await file.text());
    if (!j.code || !j.entries) throw new Error('format inattendu (code + entries)');
    const o = (await store.get(`ovr:${j.code}`)) || {};
    for (const [id, e] of Object.entries(j.entries)) if (E.concepts[id]) o[id] = typeof e === 'string' ? { t: e, s: 'propose', votes: [] } : e;
    await store.set(`ovr:${j.code}`, o);
    $('#lang').value = j.code; await loadLang(j.code);
    alert(`Import réussi : ${Object.keys(j.entries).length} entrées pour ${j.code}.`);
  } catch (e) { alert('Import impossible : ' + e.message); }
});
$('#resetLang').addEventListener('click', async () => {
  if (!confirm('Effacer toutes vos corrections et validations pour cette langue ?')) return;
  await store.del(`ovr:${lang}`); await loadLang(lang);
});

// ------------------------------------------------------------ laboratoire
const SAMPLES = [
  'Votre solde est de 125 500 FCFA.',
  'Frais de transfert : 1 500 FCFA',
  'Ne partagez jamais votre code PIN avec personne.',
  'Code PIN incorrect. Il vous reste 2 tentatives.',
  'Your balance is XAF 40,000',
  'Félicitations ! Vous avez gagné 500 000 FCFA. Envoyez votre code PIN au 699 88 77 66 pour recevoir votre gain.',
  'Au-delà de 500 000 FCFA par jour, les transferts sont soumis à une vérification d\'identité en agence.',
  'Les retraits effectués après 18h00 seront traités le lendemain, sauf le dimanche.'
];
$('#samples').innerHTML = SAMPLES.map((s, i) => `<button data-s="${i}">${esc(s.slice(0, 38))}…</button>`).join('');
$('#samples').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (b) { $('#labIn').value = SAMPLES[+b.dataset.s]; runLab(); } });
function runLab() {
  const l = $('#labLang').value;
  const r = E.translate($('#labIn').value, l);
  const maskedHtml = esc(r.masked).replace(/⟦(\d+)⟧/g, (m, i) => `<span class="tok" title="${esc(r.entities[i].type)}">⟦${i}⟧ ${esc(r.entities[i].type)}</span>`);
  let h = `<div class="step"><h4>1. Verrouillage des valeurs sensibles</h4>${maskedHtml}<br><small>${r.entities.map((e, i) => `⟦${i}⟧ = <b>${esc(e.raw)}</b>`).join(' · ') || 'aucune'}</small></div>`;
  h += `<div class="step"><h4>2. Reconnaissance</h4>${r.parts.map((p) => p.kind === 'exact' ? `✔ <code>${p.id}</code> (${STATUS_LABEL[p.fallback ? 'manquant' : p.status] || p.status}${p.fallback ? ' → repli français facile' : ''})` : `✱ inédit : « ${esc(p.source)} »`).join('<br>') || '—'}</div>`;
  h += `<div class="step"><h4>3. Classification et signaux</h4>Catégorie : <b>${r.cat}</b> ${r.headline ? '— ' + esc(r.headline.text) : ''}<br>
    Interdiction : ${r.flags.negation ? '<b>oui</b> 🚫' : 'non'} · Condition : ${r.flags.condition ? '<b>oui</b> ❗' : 'non'} · Arnaque : ${r.flags.scam && r.flags.scam.scam ? `<b class="ko">OUI (${r.flags.scam.reasons.map((x) => esc(x.label)).join(', ')})</b>` : (r.flags.scam ? `non (score ${r.flags.scam.score})` : 'non')}
    ${r.terms.length ? `<br>Mots-clés : ${r.terms.map((t) => `${t.icon} ${esc(t.match)} → <b>${esc(t.text)}</b>`).join(' · ')}` : ''}</div>`;
  const locked = r.entities.length;
  h += `<div class="step"><h4>4. Contrôle d'intégrité</h4>${r.integrity.ok ? `<span class="ok">✅ ${r.integrity.checked ? `${r.integrity.checked} valeur(s) réinjectée(s), chiffres identiques` : `${locked} valeur(s) verrouillée(s), affichée(s) telles quelles`} — aucune traduction libre</span>` : `<span class="ko">✖ rejet : ${esc(r.integrity.missing.join(', '))}</span>`}${(r.rejected || []).length ? `<br><span class="ko">${r.rejected.length} gabarit(s) rejeté(s) par sécurité</span>` : ''}</div>`;
  h += `<div class="step"><h4>5. Résultat</h4><div class="out">${esc(r.text || (r.headline && r.headline.text) || '')}</div></div>`;
  $('#labOut').innerHTML = h;
}
$('#labIn').addEventListener('input', runLab);
$('#labLang').addEventListener('change', runLab);

// ------------------------------------------------------------ IA
async function loadAI() {
  if (!hasChrome) return;
  const { settings = {} } = await chrome.storage.sync.get('settings');
  const llm = settings.llm || {};
  $('#aiOn').checked = !!llm.enabled; $('#aiProv').value = llm.provider || 'anthropic';
  $('#aiModel').value = llm.model || ''; $('#aiEndpoint').value = llm.endpoint || '';
  $('#aiKey').value = (await chrome.storage.local.get('llmKey')).llmKey || '';
}
$('#aiForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!hasChrome) return;
  const { settings = {} } = await chrome.storage.sync.get('settings');
  settings.llm = { enabled: $('#aiOn').checked, provider: $('#aiProv').value, model: $('#aiModel').value.trim(), endpoint: $('#aiEndpoint').value.trim() };
  await chrome.storage.sync.set({ settings });
  await chrome.storage.local.set({ llmKey: $('#aiKey').value.trim() });
  $('#aiMsg').textContent = '✅ Enregistré';
});

$('#openIvr')?.addEventListener('click', () => {
  if (hasChrome) chrome.tabs.create({ url: chrome.runtime.getURL('repondeur/app.html') });
});
$('#openIvrStudio')?.addEventListener('click', () => {
  if (hasChrome) chrome.tabs.create({ url: chrome.runtime.getURL('studio/studio.html') });
});

(async () => {
  $('#validator').value = (await store.get('validator')) || '';
  $('#lang').value = 'fub'; $('#labLang').value = 'fub';
  await loadLang('fub');
  runLab();
  loadAI();
})();
