import { getSettings, saveSettings, get, set } from '../lib/store.js';
import { createEngine, DEFAULT_LEDGER } from '../lib/ivr-engine.js';
import { loadGlossary, resolve } from '../lib/prompts.js';
import { allRecs, isValidated } from '../lib/audio-store.js';
import { play, cancel, unlock } from '../lib/speak.js';
import { fmtAmount } from '../lib/fr.js';

const SHORT = { 'fr-facile': 'le français facile', fub: 'le fulfulde', ewo: "l'ewondo", gya: 'le gbaya', wes: 'le pidgin', dua: 'le duala', bas: 'le basaa', bbj: 'le ghomálá', mdd: 'le mbum', tik: 'le tikar', vut: 'le vute', dur: 'le dii' };
const $ = (id) => document.getElementById(id);
const g = await loadGlossary();
let settings = await getSettings();
let ledger = await get('ledger', null) ?? DEFAULT_LEDGER();
let engine = null, starting = false, gen = 0, timer = null, timeouts = 0;

const ivrKeys = g.sections.find((s) => s.id === 's9').concepts.map((c) => c.id);
async function readyMap() {
  const recs = await allRecs().catch(() => []);
  const m = {};
  for (const l of settings.offeredLangs) {
    const okRecs = recs.filter((r) => r.lang === l && (isValidated(r) || !settings.strictAudio));
    m[l] = l === 'fr-facile' || okRecs.some((r) => r.key === 'ivr.main_1');
  }
  return m;
}

// ---------- rendu
function renderSide() {
  $('balance').textContent = fmtAmount(ledger.balance);
  $('history').innerHTML = ledger.history.slice(0, 5).map((h) => `<li>${new Date(h.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${h.kind} ${fmtAmount(h.amount)}${h.to ? ' → ' + h.to : ''}</li>`).join('') || '<li>Aucune opération</li>';
}
async function renderLangs() {
  const recs = await allRecs().catch(() => []);
  $('langs').innerHTML = settings.offeredLangs.map((l) => {
    const mine = recs.filter((r) => r.lang === l && ivrKeys.includes(r.key));
    const val = mine.filter(isValidated).length;
    const cur = l === settings.lang ? ' ◀' : '';
    return `<div class="lang"><span>${g.languages.find((x) => x.code === l)?.emoji ?? ''} ${g.langName[l] ?? l}${cur}</span><span>${l === 'fr-facile' ? 'référence' : `${val}/${ivrKeys.length} validées · ${mine.length} enreg.`}</span></div>`;
  }).join('');
}
function addLine(item, text) {
  const d = document.createElement('div');
  d.className = 'line' + (item.critical ? ' critical' : '');
  const ok = item.rec && item.badge.includes('✅');
  d.innerHTML = `<span class="em">${item.emoji}</span><span class="tx"></span><span class="badge${ok ? ' ok' : ''}">${item.rec ? '🎙️ ' : '🔊 '}${item.badge}</span>`;
  d.querySelector('.tx').textContent = item.display;
  if (item.native) { const n = document.createElement('span'); n.className = 'native'; n.textContent = item.native.text + (item.native.status === 'attested' ? ' 📚' : ' ✅'); d.querySelector('.tx').append(n); }
  if (item.draft) { const n = document.createElement('span'); n.className = 'native draft'; n.textContent = '✎ ' + item.draft + '  — BROUILLON IA, non validé' + (item.draftSpoken ? ' · voix française approximative' : ''); d.querySelector('.tx').append(n); }
  $('screen').append(d); $('screen').scrollTop = 1e9;
  return d;
}

// ---------- parole
async function say(items) {
  const my = ++gen; cancel(); clearTimeout(timer);
  for (const it of items) {
    if (my !== gen) return;
    const r = await resolve(g, it.key, engine.state.lang, it.params, { strict: settings.strictAudio, drafts: settings.draftMode, draftVoice: settings.draftVoice });
    const el = addLine(r); el.classList.add('playing');
    await play(r, 0.9);
    el.classList.remove('playing');
  }
  if (my === gen && engine) timer = setTimeout(onTimeout, 15000);
}
async function onTimeout() {
  if (!engine) return;
  if (++timeouts > 2) return hangup();
  const r = engine.timeout(); await say([...r.say, ...engine.repeat().say]);
}

// ---------- effets
async function effects(list) {
  for (const e of list) {
    if (e.type === 'save-ledger') { await set('ledger', ledger); renderSide(); }
    else if (e.type === 'lang') { settings = { ...settings, lang: e.lang }; await saveSettings(settings); renderLangs(); }
    else if (e.type === 'notify' || e.type === 'alarm') {
      const lang = engine.state.lang;
      const body = await resolve(g, e.bodyKey, lang, e.params, { strict: settings.strictAudio, drafts: settings.draftMode, draftVoice: settings.draftVoice });
      const title = await resolve(g, e.titleKey, lang, {}, { strict: settings.strictAudio, drafts: settings.draftMode });
      const payload = { title: title.display + (title.draft ? ' · ' + title.draft : ''), message: body.display + (body.native ? '\n' + body.native.text : '') + (body.draft ? '\n✎ ' + body.draft : ''), spoken: body.draftSpoken ?? body.spoken, route: e.route, audioKey: body.rec ? { lang, key: e.bodyKey } : null };
      chrome.runtime.sendMessage(e.type === 'notify' ? { type: 'notify', payload } : { type: 'alarm', name: e.name, delayMin: e.delayMin, payload });
    }
  }
}

// ---------- touches
function flash(k) {
  const b = $('keys').querySelector(`[data-k="${k}"]`); if (!b) return;
  b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 150);
}
async function press(k) {
  flash(k);
  if (!engine) { if (!starting) await call(); return; } // une touche avant « Appeler » lance l'appel
  timeouts = 0; cancel(); clearTimeout(timer);   // une touche annule le délai d'inactivité en cours
  const r = engine.press(k);
  $('buffer').textContent = engine.state.buf || '—';
  await effects(r.effects);
  if (r.say.length) await say(r.say);
  else if (engine) timer = setTimeout(onTimeout, 15000);   // saisie au clavier : on relance le délai
}
async function call() {
  if (engine || starting) return;
  starting = true; unlock();
  settings = await getSettings();
  ledger = await get('ledger', null) ?? ledger;
  engine = createEngine({ ledger, settings, langNames: SHORT });
  engine.setReady(await readyMap());
  $('screen').innerHTML = ''; $('call').disabled = true; $('hang').disabled = false; $('banner').hidden = true;
  timeouts = 0; starting = false;
  await say(engine.start().say);
}
function hangup() { if (engine) info('📴 Appel terminé.'); gen++; cancel(); clearTimeout(timer); engine = null; $('call').disabled = false; $('hang').disabled = true; $('buffer').textContent = '—'; }

// ---------- init
$('keys').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => `<button data-k="${k}" aria-label="touche ${k}">${k}</button>`).join('');
$('keys').addEventListener('click', (e) => { const k = e.target.closest('button')?.dataset.k; if (k) press(k); });
addEventListener('keydown', (e) => { if (/^[0-9*#]$/.test(e.key)) press(e.key); });
$('call').onclick = () => call(); $('hang').onclick = hangup;
const info = (msg) => { $('banner').hidden = false; $('banner').textContent = msg; };
$('studio').onclick = () => window.open(chrome.runtime.getURL('studio/studio.html'), '_blank');
$('reset').onclick = async () => {
  hangup();                                              // coupe l'appel en cours (le moteur garde une référence au solde)
  for (const k of Object.keys(ledger)) delete ledger[k];
  Object.assign(ledger, DEFAULT_LEDGER());               // en place : aucune référence périmée
  await set('ledger', ledger);
  chrome.runtime.sendMessage({ type: 'reset' }).catch?.(() => {}); // efface rappels et notifications en attente
  $('screen').innerHTML = '';
  $('banner').hidden = false; $('banner').textContent = '✅ Démo réinitialisée : solde ' + fmtAmount(ledger.balance) + ', historique, tontine, crédits et rappels effacés. Appuyez sur « Appeler ».';
  renderSide();
};
$('test-notif').onclick = async () => {
  const t = await resolve(g, 'ivr.notif_tip_title', 'fr-facile'); const b = await resolve(g, 'ivr.notif_tip', 'fr-facile');
  try {
    const r = await chrome.runtime.sendMessage({ type: 'notify', payload: { title: t.display, message: b.display, spoken: b.spoken, route: '#tip' } });
    if (r && r.ok === false) return info('⚠️ Notification refusée : ' + r.error);
    const level = await new Promise((res) => { if (chrome.notifications?.getPermissionLevel) chrome.notifications.getPermissionLevel(res); else res('granted'); });
    info(level === 'denied'
      ? '⚠️ Les notifications de Chrome sont bloquées. Réglages Système → Notifications → Google Chrome → Autoriser.'
      : '🔔 Notification envoyée. Si rien n\'apparaît : Réglages Système → Notifications → Google Chrome → Autoriser, et désactivez « Ne pas déranger ».');
  } catch (e) { info('⚠️ Impossible d\'envoyer la notification : ' + (e?.message ?? e)); }
};
if (location.hash) { $('banner').hidden = false; $('banner').textContent = 'Ouvert depuis une notification. Appuyez sur « Appeler » pour continuer.'; }
// Les erreurs ne doivent plus être silencieuses
const showErr = (e) => { $('banner').hidden = false; $('banner').textContent = '⚠️ Erreur : ' + (e?.message ?? e); console.error(e); };
addEventListener('error', (e) => showErr(e.error ?? e.message));
addEventListener('unhandledrejection', (e) => showErr(e.reason));
renderSide(); renderLangs();
