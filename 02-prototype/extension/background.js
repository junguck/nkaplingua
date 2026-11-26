/* NkapLingua — service worker (module) :
 * overlay (menus, raccourcis, IA masquée) + répondeur (notifications, alarmes, audio).
 */
import { getSettings as getIvrSettings, get, set } from './lib/store.js';
import { getRec, isValidated } from './lib/audio-store.js';

const DEFAULTS = {
  enabled: true, lang: 'fub', mode: 'bilingue', autoSpeak: false, shield: true, factsheet: true,
  bigText: false, strict: false, showOriginal: true, rate: 0.9, disabledSites: [], llm: { enabled: false }
};
const APP = 'repondeur/app.html';

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { settings } = await chrome.storage.sync.get('settings');
  await chrome.storage.sync.set({ settings: { ...DEFAULTS, ...(settings || {}) } });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'nkap-translate', title: 'NkapLingua : comprendre « %s »', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'nkap-facts', title: 'NkapLingua : fiche claire de cette page', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'nkap-guide', title: 'NkapLingua : guide pas à pas', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'nkap-ivr', title: 'NkapLingua : ouvrir le répondeur', contexts: ['action', 'page'] });
  });
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#bienvenue') });
  await syncTip();
});
chrome.runtime.onStartup.addListener(syncTip);
chrome.storage.onChanged.addListener((c) => { if (c.ivrSettings) syncTip(); });

const send = (tabId, msg) => chrome.tabs.sendMessage(tabId, msg).catch(() => {});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'nkap-ivr') return openApp();
  if (!tab) return;
  if (info.menuItemId === 'nkap-translate') send(tab.id, { type: 'translateSelection', text: info.selectionText });
  if (info.menuItemId === 'nkap-facts') send(tab.id, { type: 'factsheet' });
  if (info.menuItemId === 'nkap-guide') send(tab.id, { type: 'guide' });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'repondeur') return openApp();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const map = { toggle: 'toggle', 'read-aloud': 'readSelection', guide: 'guide', factsheet: 'factsheet' };
  if (map[command]) send(tab.id, { type: map[command] });
});

async function openApp(route = '') {
  const url = chrome.runtime.getURL(APP) + route;
  const [t] = await chrome.tabs.query({ url: chrome.runtime.getURL(APP) + '*' });
  if (t) {
    await chrome.tabs.update(t.id, { active: true, url });
    await chrome.windows.update(t.windowId, { focused: true });
  } else await chrome.tabs.create({ url });
}

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument?.()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Lire les invites vocales enregistrées du répondeur'
  });
}

async function showNotif(p) {
  const id = p.id ?? 'nk-' + Date.now();
  const base = { type: 'basic', iconUrl: 'icons/icon128.png', title: p.title, message: p.message, priority: 2 };
  chrome.notifications.create(id, { ...base, requireInteraction: true, buttons: [{ title: '🔊 Écouter' }, { title: 'Ouvrir le répondeur' }] }, () => {
    if (chrome.runtime.lastError) chrome.notifications.create(id, base);
  });
  await set('notif:' + id, p);
  const s = await getIvrSettings();
  if (s.speakNotif) await speakNotif(p, s);
}

async function speakNotif(p, s) {
  if (p.audioKey) {
    const rec = await getRec(p.audioKey.lang, p.audioKey.key).catch(() => null);
    if (rec && (!s.strictAudio || isValidated(rec))) {
      await ensureOffscreen();
      return chrome.runtime.sendMessage({ target: 'offscreen', type: 'play', lang: p.audioKey.lang, key: p.audioKey.key });
    }
  }
  chrome.tts.speak(p.spoken ?? p.message, { lang: 'fr-FR', rate: 0.9 });
}

async function glossaryHints(lang) {
  try {
    const res = await fetch(chrome.runtime.getURL('glossary/bundle.json'));
    const data = await res.json();
    const L = data.languages[lang];
    if (!L) return '';
    return Object.entries(L.entries).filter(([id]) => id.startsWith('term.'))
      .map(([id, e]) => {
        const c = data.concepts.find((x) => x.id === id);
        return `${(c.fr || [])[0]} = ${typeof e === 'string' ? e : e.t}`;
      }).join('\n');
  } catch { return ''; }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.target === 'offscreen') return;
  if (msg.type === 'llm') {
    (async () => {
      const { settings } = await chrome.storage.sync.get('settings');
      const llm = (settings && settings.llm) || {};
      const { llmKey } = await chrome.storage.local.get('llmKey');
      if (!llm.enabled || !llmKey) return reply({ ok: false, error: 'IA désactivée' });
      const hints = await glossaryHints(msg.lang);
      const system = `Tu traduis des messages d'applications financières camerounaises vers ${msg.langName}.
Règles absolues :
- Les jetons ⟦0⟧, ⟦1⟧… représentent des montants, noms ou numéros : recopie CHAQUE jeton exactement une fois, sans le modifier, et n'écris AUCUN chiffre.
- Conserve le sens exact : interdictions (ne… jamais), conditions (si, sauf, maximum), avertissements.
- Phrases courtes et simples. Réponds uniquement par la traduction.
Glossaire de référence (à respecter) :
${hints}`;
      try {
        let text = '';
        if ((llm.provider || 'anthropic') === 'anthropic') {
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': llmKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
            body: JSON.stringify({ model: llm.model || 'claude-haiku-5-5', max_tokens: 400, system, messages: [{ role: 'user', content: msg.masked }] })
          });
          const j = await r.json();
          text = (j.content || []).map((b) => b.text || '').join('').trim();
        } else {
          const r = await fetch(llm.endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${llmKey}` },
            body: JSON.stringify({ model: llm.model, messages: [{ role: 'system', content: system }, { role: 'user', content: msg.masked }], temperature: 0 })
          });
          const j = await r.json();
          text = (j.choices && j.choices[0] && j.choices[0].message.content || '').trim();
        }
        reply({ ok: !!text, text });
      } catch (e) { reply({ ok: false, error: String(e) }); }
    })();
    return true;
  }
  (async () => {
    try {
      if (msg.type === 'notify') await showNotif(msg.payload);
      else if (msg.type === 'alarm') {
        await set('alarm:' + msg.name, msg.payload);
        await chrome.alarms.create(msg.name, { delayInMinutes: Math.max(0.5, msg.delayMin) });
      } else if (msg.type === 'reset') {
        for (const a of await chrome.alarms.getAll()) if (a.name !== 'daily-tip') await chrome.alarms.clear(a.name);
        const n = await chrome.notifications.getAll();
        for (const id of Object.keys(n)) chrome.notifications.clear(id);
        const all = await chrome.storage.local.get(null);
        await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith('alarm:') || k.startsWith('notif:')));
      } else if (msg.type === 'open') await openApp(msg.route);
      reply?.({ ok: true });
    } catch (e) { console.error(e); reply?.({ ok: false, error: String(e) }); }
  })();
  return true;
});

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === 'daily-tip') {
    const g = await (await fetch(chrome.runtime.getURL('glossary/ivr.json'))).json();
    const find = (id) => g.sections.flatMap((x) => x.concepts).find((c) => c.id === id)?.cells['fr-facile']?.text ?? '';
    return showNotif({ id: 'tip', title: find('ivr.notif_tip_title'), message: find('ivr.notif_tip'), route: '#tip' });
  }
  const p = await get('alarm:' + a.name);
  if (p) await showNotif({ ...p, id: a.name });
});

const clickNotif = async (id) => { const p = await get('notif:' + id); chrome.notifications.clear(id); await openApp(p?.route ?? ''); };
chrome.notifications.onClicked.addListener(clickNotif);
chrome.notifications.onButtonClicked.addListener(async (id, i) => {
  if (i === 0) { const p = await get('notif:' + id); if (p) await speakNotif(p, await getIvrSettings()); }
  else clickNotif(id);
});

async function syncTip() {
  const s = await getIvrSettings();
  if (s.dailyTip) chrome.alarms.create('daily-tip', { periodInMinutes: 1440, delayInMinutes: 1 });
  else chrome.alarms.clear('daily-tip');
}
