import { getSettings, saveSettings, get, set } from '../lib/store.js';
import { loadGlossary } from '../lib/prompts.js';
import { allRecs, getRec, saveRecording, validate, delRec, putRec, isValidated, speakersOf } from '../lib/audio-store.js';
import { playBlob, cancel } from '../lib/speak.js';

const $ = (id) => document.getElementById(id);
const g = await loadGlossary();
let settings = await getSettings();
let proposals = await get('proposals', []);
const toast = (t) => { const m = $('msg'); m.textContent = t; m.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => (m.style.display = 'none'), 4000); };

addEventListener('error', (e) => toast('⚠️ Erreur : ' + (e.error?.message ?? e.message)));
addEventListener('unhandledrejection', (e) => toast('⚠️ Erreur : ' + (e.reason?.message ?? e.reason)));

// ---- groupes et langues
const groups = [['s9', 'Phrases du répondeur'], ['s7', 'Salutations'], ['s6', 'Nombres'], ['s8', 'Vocabulaire'], ['s1', 'Termes financiers']];
$('group').innerHTML = groups.map(([id, n]) => `<option value="${id}">${n}</option>`).join('');
const langs = g.languages.filter((l) => l.code !== 'fr-facile');
$('lang').innerHTML = langs.map((l) => `<option value="${l.code}">${l.emoji} ${l.name}</option>`).join('');
$('lang').value = settings.lang !== 'fr-facile' ? settings.lang : 'fub';
$('speaker').value = settings.speaker ?? '';
$('speaker').onchange = async () => { settings = { ...settings, speaker: $('speaker').value.trim() }; await saveSettings(settings); };
const who = () => { const w = $('speaker').value.trim(); if (!w) { toast('Écrivez votre nom en haut d\'abord.'); $('speaker').focus(); } return w; };

// ---- enregistrement micro
let mr = null, chunks = [], recKey = null;
async function startRec(key, btn) {
  const by = who(); if (!by) return;
  if (mr) return stopRec();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
  if (!stream) return toast('Micro refusé ou introuvable.');
  chunks = []; recKey = key; mr = new MediaRecorder(stream);
  mr.ondataavailable = (e) => chunks.push(e.data);
  mr.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    await saveRecording($('lang').value, recKey, new Blob(chunks, { type: mr.mimeType }), by);
    mr = null; toast('Enregistré par ' + by + '. Il faut maintenant qu\'un AUTRE locuteur le valide.'); render();
  };
  btn.classList.add('rec'); btn.textContent = '⏹ Stop'; mr.start();
}
const stopRec = () => mr?.stop();

// ---- tableau
async function render() {
  const lang = $('lang').value, sec = g.sections.find((s) => s.id === $('group').value);
  const recs = Object.fromEntries((await allRecs()).filter((r) => r.lang === lang).map((r) => [r.key, r]));
  $('rows').innerHTML = '';
  for (const c of sec.concepts) {
    const cell = c.cells[lang], rec = recs[c.id], prop = proposals.find((p) => p.id === c.id && p.lang === lang);
    const tr = document.createElement('tr');
    const st = rec ? (isValidated(rec) ? `<span class="st ok">✅ validé (${[...speakersOf(rec)].join(', ')})</span>` : `<span class="st">◌ enregistré par ${rec.by} — à valider</span>`) : '<span class="st">— pas d\'audio</span>';
    tr.innerHTML = `<td>${c.emoji} ${c.cells['fr-facile'].text}<div class="st">${c.id}${cell ? ` · actuel : ${cell.status === 'weak' ? '📚⚠' : cell.status === 'attested' ? '📚' : cell.status === 'draft' ? '✎' : '◌'} ${cell.text}` : ''}</div></td>
      <td><input type="text" value="${(prop?.text ?? '').replace(/"/g, '&quot;')}" placeholder="${cell?.status === 'draft' ? '✎ brouillon IA : ' + cell.text.replace(/"/g, '&quot;') : cell ? 'à corriger ?' : 'proposer'}" data-id="${c.id}"></td>
      <td class="actions">${st}<br><button data-a="rec">🎙️ Enregistrer</button> ${rec ? '<button data-a="play">▶️</button><button data-a="val">✅ Je valide</button><button data-a="del">🗑</button>' : ''}</td>`;
    tr.querySelector('input').onchange = async (e) => {
      const by = who(); if (!by) return;
      proposals = proposals.filter((p) => !(p.id === c.id && p.lang === lang));
      if (e.target.value.trim()) proposals.push({ id: c.id, lang, text: e.target.value.trim(), by });
      await set('proposals', proposals); toast('Proposition enregistrée (statut ◌ jusqu\'à 2e validation).');
    };
    tr.querySelector('[data-a=rec]').onclick = (e) => startRec(c.id, e.target);
    tr.querySelector('[data-a=play]')?.addEventListener('click', async () => { cancel(); playBlob((await getRec(lang, c.id)).blob); });
    tr.querySelector('[data-a=val]')?.addEventListener('click', async () => { const w = who(); if (!w) return; try { await validate(lang, c.id, w); toast('Validé par ' + w); render(); } catch (e) { toast(e.message); } });
    tr.querySelector('[data-a=del]')?.addEventListener('click', async () => { await delRec(lang, c.id); render(); });
    $('rows').append(tr);
  }
}
$('lang').onchange = $('group').onchange = render;

// ---- réglages
$('langchecks').innerHTML = g.languages.map((l) => `<label class="chk"><input type="checkbox" data-l="${l.code}" ${settings.offeredLangs.includes(l.code) ? 'checked' : ''}> ${l.emoji} ${l.name.split(' (')[0]}</label>`).join('');
$('langchecks').onchange = async () => {
  const sel = [...document.querySelectorAll('[data-l]:checked')].map((i) => i.dataset.l);
  if (sel.length > 4 || !sel.includes('fr-facile')) { toast('Entre 1 et 4 langues, avec le français facile (repli obligatoire).'); return load(); }
  settings = { ...settings, offeredLangs: sel }; await saveSettings(settings); toast('Menu vocal mis à jour.');
};
for (const k of ['strictAudio', 'speakNotif', 'demoFast', 'draftMode', 'draftVoice', 'dailyTip']) {
  $(k).checked = !!settings[k];
  $(k).onchange = async () => { settings = { ...settings, [k]: $(k).checked }; await saveSettings(settings); };
}
const load = async () => { settings = await getSettings(); document.querySelectorAll('[data-l]').forEach((i) => (i.checked = settings.offeredLangs.includes(i.dataset.l))); };

// ---- export / import
const dl = (name, data) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name; a.click(); };
$('exp-prop').onclick = () => dl('propositions.json', JSON.stringify(proposals, null, 1));
$('exp-rec').onclick = async () => {
  const out = [];
  for (const r of await allRecs()) out.push({ ...r, blob: undefined, mime: r.mime, b64: await new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result.split(',')[1]); f.readAsDataURL(r.blob); }) });
  dl('enregistrements.json', JSON.stringify(out));
};
$('imp-rec').onchange = async (e) => {
  const list = JSON.parse(await e.target.files[0].text());
  for (const r of list) { const bin = Uint8Array.from(atob(r.b64), (c) => c.charCodeAt(0)); const { b64, ...rest } = r; await putRec({ ...rest, blob: new Blob([bin], { type: r.mime }) }); }
  toast(list.length + ' enregistrements importés'); render();
};
render();
