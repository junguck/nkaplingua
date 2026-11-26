/* NkapLingua — script de contenu
 * Lit la page financière telle qu'elle s'affiche (sans toucher à son code source),
 * et superpose une couche de compréhension dans la langue nationale choisie.
 */
(() => {
  'use strict';
  if (window.__nkapLingua) return;
  window.__nkapLingua = true;

  const E = self.NkapEngine.init(self.NKAP_DATA);
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage;

  const DEFAULTS = {
    enabled: true, lang: 'fub', mode: 'bilingue', autoSpeak: false, shield: true, factsheet: true,
    bigText: false, strict: false, showOriginal: true, rate: 0.9, disabledSites: [],
    llm: { enabled: false }
  };
  let S = { ...DEFAULTS };
  const results = new WeakMap();      // élément-unité -> { key, res }
  const units = new Set();            // unités traitées (références fortes pour l'export des faits)
  const recordings = {};              // id concept -> dataURL (Studio linguistique)
  const stats = { units: 0, exact: 0, gloss: 0, entities: 0, integrityChecks: 0, integrityRejected: 0, scams: 0 };
  let observer = null, scheduled = false, busy = false;

  // ------------------------------------------------------------ réglages
  async function loadSettings() {
    if (!hasChrome) return;
    const st = await chrome.storage.sync.get('settings');
    S = { ...DEFAULTS, ...(st.settings || {}) };
    const loc = await chrome.storage.local.get(null);
    for (const [k, v] of Object.entries(loc)) {
      if (k.startsWith('ovr:')) E.setOverrides(k.slice(4), v);
      if (k.startsWith(`rec:${S.lang}:`)) recordings[k.split(':').slice(2).join(':')] = v;
    }
  }
  const siteDisabled = () => (S.disabledSites || []).includes(location.host || 'file');
  const active = () => S.enabled && !siteDisabled();
  const L = () => E.data.languages[S.lang] || E.data.languages['fr-facile'];
  const tr = (id) => E.entry(S.lang, id, { strict: S.strict });

  // ------------------------------------------------------------ DOM : unités de sens
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'SVG', 'CANVAS', 'IFRAME', 'TEMPLATE', 'INPUT', 'SELECT', 'NKAP-NOTE', 'NKAP-ROOT', 'HEAD', 'TITLE']);
  const displayOf = (el) => { try { return getComputedStyle(el).display; } catch { return 'block'; } };
  const isInline = (el) => { const d = displayOf(el); return d === 'inline' || d === 'contents'; };
  const isOurs = (el) => !!(el && el.closest && el.closest('nkap-note,nkap-root,[data-nkap-ui]'));

  function unitOf(node) {
    let el = node.nodeType === 1 ? node : node.parentElement;
    while (el && el !== document.body && !SKIP.has(el.tagName) && isInline(el)) el = el.parentElement;
    if (!el || SKIP.has(el.tagName) || isOurs(el) || el === document.body || el === document.documentElement) return null;
    if (el.closest('[contenteditable=""],[contenteditable="true"],[data-nkap-ignore]')) return null;
    return el;
  }

  function ownText(el) {
    let s = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeType === 1) {
        if (SKIP.has(n.tagName) || n.hasAttribute('data-nkap-ui')) continue;
        if (n.tagName === 'BR') { s += ' '; continue; }
        if (isInline(n)) s += ownText(n); else s += ' ';
      }
    }
    return s.replace(/\s+/g, ' ').trim();
  }

  function visible(el) {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function collectUnits(root) {
    const found = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim().length > 1 && /\p{L}/u.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    let n;
    while ((n = walker.nextNode())) { const u = unitOf(n); if (u) found.add(u); if (found.size > 1500) break; }
    // Boutons de type input et placeholders
    root.querySelectorAll && root.querySelectorAll('input[type=submit],input[type=button],input[placeholder],textarea[placeholder]').forEach((i) => !isOurs(i) && found.add(i));
    return found;
  }

  // ------------------------------------------------------------ rendu
  // Direction artistique : papier, encre de nuit, lavande, citron, ciel, corail.
  const INK = '#172430';
  const CAT_STYLE = {           // [fond de carte, pastille d'icône]
    fraud: ['#FF7C5C', '#FFFFFF'], pin: ['#FFE6DE', '#FF7C5C'], error: ['#FFE6DE', '#FF7C5C'], warning: ['#FFE6DE', '#FF7C5C'],
    confirm: ['#ECE6FF', '#A38BF3'], transfer: ['#ECE6FF', '#A38BF3'], fees: ['#F2FAD0', '#DDF46C'], success: ['#F2FAD0', '#DDF46C'],
    balance: ['#E1F1FA', '#A6D6EF'], condition: ['#E1F1FA', '#A6D6EF'], info: ['#FBF7EE', '#EDE6D6']
  };
  const FONT = '"Onest NK","Onest",system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif';
  const SVG = {
    speak: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 10h6M7 14h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    guide: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 8.5l-2 5-5 2 2-5z" fill="currentColor"/></svg>',
    orig: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h9M8.5 4v2c0 4-2 7-5 8.5M6 10c1.5 2.5 4 4 7 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M13 20l4-9 4 9M14.5 17h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8M7 6.5a7.5 7.5 0 1 0 10 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    min: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c.6 4.8 2.6 7.4 8 8-5.4.6-7.4 3.2-8 8-.6-4.8-2.6-7.4-8-8 5.4-.6 7.4-3.2 8-8z" fill="currentColor"/><path d="M19 15c.3 2 1.1 3.1 3 3.4-1.9.3-2.7 1.4-3 3.4-.3-2-1.1-3.1-3-3.4 1.9-.3 2.7-1.4 3-3.4z" fill="currentColor"/></svg>'
  };

  const NOTE_CSS = `
  :host{all:initial;display:block;margin:.45em 0 .15em;font:500 calc(13.5px * var(--nk-scale,1))/1.4 ${FONT};color:${INK};text-align:left;direction:ltr;user-select:text;-webkit-font-smoothing:antialiased}
  .card{background:var(--bg);border-radius:20px;padding:9px 10px 9px 9px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:start}
  .card.crit{box-shadow:inset 0 0 0 2px var(--acc)}
  .card.danger{color:${INK}}
  .ic{width:2.25em;height:2.25em;border-radius:50%;background:var(--acc);display:grid;place-items:center;font-size:1em;line-height:1}
  .main{font-weight:700;font-size:1.04em;letter-spacing:-.012em;line-height:1.35}
  .lock{background:#fff;color:${INK};border-radius:999px;padding:.05em .55em;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums;letter-spacing:0}
  .sub{margin-top:.35em;font-size:.92em}
  .chips{display:flex;flex-wrap:wrap;gap:.35em;margin-top:.45em}
  .chip{background:rgba(255,255,255,.75);border-radius:999px;padding:.15em .65em;font-size:.88em}
  .chip b{font-weight:750}
  .chip .k{opacity:.6}
  .flag{margin-top:.45em;font-size:.9em;font-weight:700;display:flex;gap:.4em;align-items:baseline}
  .badge{display:inline-block;font-size:.72em;font-weight:700;border-radius:999px;padding:.05em .55em;margin-left:.4em;vertical-align:.12em;white-space:nowrap;background:rgba(23,36,48,.08)}
  .b-ok{background:#DDF46C}.b-ai{background:#A38BF3;color:#fff}
  button{all:unset;cursor:pointer;flex:none;width:2.25em;height:2.25em;border-radius:50%;background:${INK};color:#fff;display:grid;place-items:center}
  button svg{width:1.05em;height:1.05em}
  button:hover{background:#2b3a49} button:focus-visible{outline:3px solid #A38BF3;outline-offset:2px}
  .orig{grid-column:2/4;font-size:.84em;opacity:.7;display:none}
  .card.show-orig .orig{display:block}
  .reasons{margin:.35em 0 0 1.1em;padding:0;font-size:.88em}
  `;

  function amountHtml(raw) {
    // Gros chiffres, devise et décimales en léger
    const m = String(raw).match(/^(\D*?)(\d[\d\s  .,]*?)([.,]\d{1,2})?(\s*\D*)$/);
    if (!m) return escapeHtml(raw);
    return `${m[1] ? `<span class="cur">${escapeHtml(m[1])}</span>` : ''}<span class="num">${escapeHtml(m[2])}</span>${m[3] ? `<span class="dec">${escapeHtml(m[3])}</span>` : ''}${m[4] ? `<span class="cur">${escapeHtml(m[4])}</span>` : ''}`;
  }

  function lockHtml(text, entities) {
    // Met en valeur les entités verrouillées dans un texte déjà rempli
    let html = escapeHtml(text);
    const raws = [...new Set(entities.map((e) => e.raw))].sort((a, b) => b.length - a.length);
    for (const r of raws) html = html.split(escapeHtml(r)).join(`<span class="lock" title="Valeur verrouillée — identique à l'original">${escapeHtml(r)}</span>`);
    return html;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function badges(statusList) {
    const st = statusList;
    if (st.includes('ai')) return `<span class="badge b-ai">${escapeHtml(tr('ui.ai').text)}</span>`;
    if (st.length && st.every((s) => s === 'fallback')) return '<span class="badge" title="Pas encore traduit : français facile">FR facile</span>';
    if (st.includes('propose')) return `<span class="badge" title="${escapeHtml(tr('ui.unvalidated').text)}">◌</span>`;
    if (st.length && st.every((s) => s === 'valide' || s === 'atteste')) return '<span class="badge b-ok" title="Validé">✓</span>';
    return '';
  }

  function buildNote(res, el) {
    const host = document.createElement('nkap-note');
    host.setAttribute('data-nkap-ui', '');
    host.setAttribute('lang', L().code === 'fr-facile' ? 'fr' : L().code);
    const root = host.attachShadow({ mode: 'open' });
    const [bg, acc] = CAT_STYLE[res.cat] || CAT_STYLE.info;
    const exact = res.parts.filter((p) => p.kind === 'exact');
    const st = [...exact, ...res.terms].map((p) => (p.fallback ? 'fallback' : p.status));
    let icon, inner = '';
    if (res.kind === 'exact') {
      icon = exact[0].icon || '';
      inner = `<span class="main">${lockHtml(res.text, res.entities)}</span>${badges(st)}`;
    } else {
      const h = res.headline;
      icon = h.icon;
      inner = `<span class="main">${escapeHtml(h.text)}</span>${badges(st)}`;
      if (exact.length) inner += `<div class="sub">${exact.map((p) => `${p.icon} ${lockHtml(p.text, res.entities)}`).join('<br>')}</div>`;
      if (res.terms.length) inner += `<div class="chips">${res.terms.slice(0, 8).map((t) => `<span class="chip"><span class="k">${escapeHtml(t.match)}</span> · <b>${escapeHtml(t.text)}</b></span>`).join('')}</div>`;
      const ents = res.entities.filter((e) => e.type !== 'NUM' || res.entities.length < 4);
      if (ents.length) inner += `<div class="chips">${ents.map((e) => `<span class="lock" title="${e.type} — valeur verrouillée">${escapeHtml(e.raw)}</span>`).join('')}</div>`;
      if (res.negationNote) inner += `<div class="flag"><span>🚫</span><span>${escapeHtml(res.negationNote.text)}</span></div>`;
      if (res.conditionNote) inner += `<div class="flag"><span>❗</span><span>${escapeHtml(res.conditionNote.text)}</span></div>`;
      if (res.flags.scam && res.flags.scam.scam) inner += `<div class="flag"><span>🚨</span><span>${escapeHtml(tr('ui.scam_alert').text)}</span></div><ul class="reasons">${res.flags.scam.reasons.map((r) => `<li>${escapeHtml(r.label)}</li>`).join('')}</ul>`;
      if (res.ai) inner += `<div class="sub">🤖 ${lockHtml(res.ai, res.entities)} <span class="badge b-ai">${escapeHtml(tr('ui.ai').text)}</span></div>`;
    }
    const body = `<span class="ic" aria-hidden="true">${icon}</span><div>${inner}</div>${speakBtn()}<div class="orig">Original : ${escapeHtml(res.source)}</div>`;
    const cls = ['card', res.critical && res.cat !== 'fraud' ? 'crit' : '', S.mode === 'immersif' ? 'show-orig' : ''].join(' ');
    root.innerHTML = `<style>${NOTE_CSS}</style><div class="${cls}" style="--bg:${bg};--acc:${acc}" role="note" aria-label="Explication NkapLingua">${body}</div>`;
    root.querySelector('button[data-speak]')?.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); speak(res); });
    root.querySelector('.card').addEventListener('dblclick', (ev) => { ev.currentTarget.classList.toggle('show-orig'); });
    return host;
  }
  const speakBtn = () => `<button data-speak title="Écouter" aria-label="Écouter">${SVG.speak}</button>`;

  function clearUnit(el) {
    el.querySelectorAll(':scope > nkap-note').forEach((n) => n.remove());
    el.removeAttribute('data-nkap-sub');
    el.classList.remove('nkap-replace', 'nkap-crit', 'nkap-scam', 'nkap-has');
  }

  function render(el, res) {
    clearUnit(el);
    if (res.kind === 'skip' || res.kind === 'entity-only') return;
    // Rien d'utile à dire (aucun mot-clé, aucun signal) : on n'ajoute pas de bruit
    const quiet = !res.flags.negation && !res.flags.condition && !res.entities.length && !(res.flags.scam && res.flags.scam.scam);
    const noSignal = !res.flags.negation && !res.flags.condition && !(res.flags.scam && res.flags.scam.scam);
    if (res.kind === 'gloss' && noSignal && !res.terms.length && res.cat === 'info') return; // ex. « SMS +237 6… » : rien à expliquer
    if (res.kind === 'gloss' && quiet) {
      // Libellé court non reconnu (nom de marque, titre…) : on ne glose que si les mots-clés en sont l'essentiel
      const letters = res.source.replace(/[^\p{L}]/gu, '').length || 1;
      const covered = res.terms.reduce((n, t) => n + t.match.replace(/[^\p{L}]/gu, '').length, 0);
      const words = (res.source.match(/\p{L}{2,}/gu) || []).length;
      if (!res.terms.length || (words <= 3 && covered / letters < 0.5)) return;
    }
    el.classList.add('nkap-has');
    if (res.critical) el.classList.add('nkap-crit');
    if (res.flags.scam && res.flags.scam.scam) el.classList.add('nkap-scam');
    if (S.mode === 'survol') return; // affichage au survol uniquement
    const tag = el.tagName;
    const compact = res.kind === 'exact' && res.entities.length === 0 && (res.source.length <= 30 || (res.source.length <= 48 && !res.critical));
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (res.kind !== 'exact' && !res.terms.length) return;
      const cur = el.getAttribute('placeholder');
      if (cur && !el.dataset.nkapPh) { el.dataset.nkapPh = cur; el.setAttribute('placeholder', `${cur} · ${res.text || res.headline.text}`); }
      if (el.type === 'submit' || el.type === 'button') el.title = `${res.text || res.headline.text}`;
      return;
    }
    if (compact || tag === 'BUTTON' || tag === 'OPTION' || el.getAttribute('role') === 'button') {
      const icon = res.parts[0]?.icon || res.headline?.icon || '';
      const label = res.text || (res.cat === 'info' && res.terms.length ? res.terms.map((t) => t.text).join(' · ') : res.headline.text);
      el.setAttribute('data-nkap-sub', `${icon} ${label}`.trim());
      el.title = `${res.source}\n→ ${res.text || res.headline.text}`;
      if (S.mode === 'immersif') { el.style.setProperty('--nkap-fs', getComputedStyle(el).fontSize); el.classList.add('nkap-replace'); }
      return;
    }
    el.appendChild(buildNote(res, el));
  }

  // ------------------------------------------------------------ traitement
  function processUnit(el) {
    if (!el.isConnected || !visible(el)) return;
    let text;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') text = el.dataset.nkapPh || el.getAttribute('placeholder') || el.value || '';
    else text = ownText(el);
    if (!text || text.length > 600) return;
    const key = `${S.lang}|${S.mode}|${S.strict}|${text}`;
    const prev = results.get(el);
    if (prev && prev.key === key && (el.querySelector(':scope > nkap-note') || el.hasAttribute('data-nkap-sub') || S.mode === 'survol' || prev.res.kind === 'skip' || prev.res.kind === 'entity-only')) return;
    const res = E.translate(text, S.lang, { strict: S.strict });
    results.set(el, { key, res });
    units.add(el);
    if (!prev || prev.res.source !== res.source) {
      stats.units++;
      if (res.kind === 'exact') stats.exact++; else if (res.kind !== 'skip' && res.kind !== 'entity-only') stats.gloss++;
      stats.entities += res.entities.length;
      stats.integrityChecks += res.parts.filter((p) => p.kind === 'exact').length;
      stats.integrityRejected += (res.rejected || []).length;
      if (res.flags.scam && res.flags.scam.scam) { stats.scams++; scamToast(res, el); }
      if (S.autoSpeak && res.critical && res.kind !== 'skip') speak(res);
    }
    render(el, res);
    if (S.llm && S.llm.enabled && (res.kind === 'gloss' || res.kind === 'mixed') && !res.ai) askAI(el, res, key);
  }

  function processAll(root = document.body) {
    if (!active() || busy || !root) return;
    busy = true;
    try {
      pauseObserver();
      for (const u of collectUnits(root)) processUnit(u);
      autoFactsheet();
    } finally { resumeObserver(); busy = false; }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    (window.requestIdleCallback || setTimeout)(() => { scheduled = false; processAll(); }, { timeout: 400 });
  }

  function pauseObserver() { observer && observer.disconnect(); }
  function resumeObserver() {
    if (!observer) observer = new MutationObserver((muts) => {
      if (muts.every((m) => isOurs(m.target) || [...m.addedNodes].every((n) => n.nodeType === 1 && (n.tagName === 'NKAP-NOTE' || n.tagName === 'NKAP-ROOT')))) return;
      schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'placeholder', 'value'] });
  }

  function resetAll() {
    document.querySelectorAll('nkap-note').forEach((n) => n.remove());
    document.querySelectorAll('[data-nkap-sub]').forEach((el) => el.removeAttribute('data-nkap-sub'));
    document.querySelectorAll('.nkap-has,.nkap-crit,.nkap-scam,.nkap-replace').forEach((el) => el.classList.remove('nkap-has', 'nkap-crit', 'nkap-scam', 'nkap-replace'));
    document.querySelectorAll('[data-nkap-ph]').forEach((el) => { el.setAttribute('placeholder', el.dataset.nkapPh); delete el.dataset.nkapPh; });
    for (const u of units) results.delete(u);
    units.clear();
    hideFactsheet();
  }

  // ------------------------------------------------------------ voix
  function voiceFor(langTag) {
    const vs = speechSynthesis.getVoices();
    return vs.find((v) => v.lang === langTag) || vs.find((v) => v.lang.startsWith(langTag.slice(0, 2))) || null;
  }
  function spokenAmounts(text, entities, langTag) {
    let out = text;
    for (const e of entities) {
      if (e.type === 'AMOUNT') {
        const a = E.parseAmount(e.raw);
        if (a) out = out.split(e.raw).join(langTag.startsWith('fr') ? `${E.amountToFrenchWords(a.value)} ${a.currency === 'XAF' ? 'francs CFA' : a.currency}` : `${a.value} ${a.currency === 'XAF' ? 'CFA francs' : a.currency}`);
      } else if (e.type === 'PHONE') out = out.split(e.raw).join(e.raw.replace(/\D/g, '').split('').join(' '));
    }
    return out.replace(/[\p{Extended_Pictographic}]/gu, '');
  }
  function speakQueue(items) {
    speechSynthesis.cancel();
    const play = (i) => {
      if (i >= items.length) return;
      const it = items[i];
      if (it.audio) { const a = new Audio(it.audio); a.onended = () => play(i + 1); a.onerror = () => play(i + 1); a.play().catch(() => play(i + 1)); return; }
      const u = new SpeechSynthesisUtterance(it.text);
      u.lang = it.lang; u.rate = S.rate || 0.9; const v = voiceFor(it.lang); if (v) u.voice = v;
      u.onend = () => play(i + 1); u.onerror = () => play(i + 1);
      speechSynthesis.speak(u);
    };
    play(0);
  }
  function speak(res) {
    const tts = L().tts || 'fr-FR';
    const items = [];
    const exact = res.parts.filter((p) => p.kind === 'exact');
    if (res.kind !== 'exact') items.push({ text: res.headline.text, lang: res.headline.fallback ? 'fr-FR' : tts });
    for (const p of exact) {
      if (recordings[p.id]) {
        items.push({ audio: recordings[p.id] });
        for (const e of p.entities || []) items.push({ text: spokenAmounts(e.raw, [e], 'fr-FR'), lang: 'fr-FR' });
      } else items.push({ text: spokenAmounts(p.text, p.entities || [], p.fallback ? 'fr-FR' : tts), lang: p.fallback ? 'fr-FR' : tts });
    }
    if (res.kind !== 'exact') {
      for (const t of res.terms.slice(0, 5)) items.push({ text: t.text, lang: t.fallback ? 'fr-FR' : tts });
      if (res.negationNote) items.push({ text: res.negationNote.text, lang: res.negationNote.fallback ? 'fr-FR' : tts });
      if (res.conditionNote) items.push({ text: res.conditionNote.text, lang: res.conditionNote.fallback ? 'fr-FR' : tts });
      for (const e of res.entities.filter((x) => x.type === 'AMOUNT')) items.push({ text: spokenAmounts(e.raw, [e], 'fr-FR'), lang: 'fr-FR' });
    }
    speakQueue(items);
  }

  // ------------------------------------------------------------ interface flottante (shadow DOM)
  let ui = null;
  function UI() {
    if (ui) return ui;
    const host = document.createElement('nkap-root');
    host.setAttribute('data-nkap-ui', '');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${UI_CSS}</style>
      <nav class="dock" aria-label="NkapLingua">
        <button class="me" data-act="menu" aria-expanded="false" title="NkapLingua"><span class="logo">N</span><span class="lname"></span></button>
        <button class="ib" data-act="facts" data-tt="ui.factsheet">${SVG.card}</button>
        <button class="ib" data-act="guide" data-tt="guide">${SVG.guide}</button>
        <button class="ib" data-act="read" data-tt="ui.listen">${SVG.speak}</button>
        <button class="ib" data-act="orig" data-tt="ui.original">${SVG.orig}</button>
        <button class="ib" data-act="off" data-tt="pause">${SVG.pause}</button>
      </nav>
      <section class="facts" hidden aria-label="Fiche claire"></section>
      <section class="guide" hidden aria-live="polite"></section>
      <div class="toasts"></div>
      <div class="bubble" hidden></div>`;
    document.documentElement.appendChild(host);
    ui = { host, root, $: (s) => root.querySelector(s) };
    root.addEventListener('click', onUiClick);
    refreshUiTexts();
    return ui;
  }
  function refreshUiTexts() {
    if (!ui) return;
    ui.$('.lname').textContent = L().native;
    ui.root.querySelectorAll('[data-t]').forEach((n) => { n.textContent = tr(n.dataset.t).text; });
    ui.root.querySelectorAll('[data-tt]').forEach((n) => {
      const t = n.dataset.tt === 'guide' ? 'Guide' : n.dataset.tt === 'pause' ? 'Pause' : tr(n.dataset.tt).text;
      n.title = t; n.setAttribute('aria-label', t);
    });
    ui.host.style.setProperty('--nk-scale', S.bigText ? 1.3 : 1);
  }
  function onUiClick(ev) {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'menu') { const d = ui.$('.dock'); d.classList.toggle('open'); b.setAttribute('aria-expanded', d.classList.contains('open')); }
    if (act === 'facts') showFactsheet(true);
    if (act === 'guide') startGuide();
    if (act === 'read') readPage();
    if (act === 'orig') { b.classList.toggle('on'); document.querySelectorAll('nkap-note').forEach((n) => n.shadowRoot?.querySelector('.card')?.classList.toggle('show-orig')); }
    if (act === 'off') { S.enabled = false; resetAll(); ui.host.remove(); ui = null; }
    if (act === 'close-facts') { factsDismissed = JSON.stringify(lastFacts); hideFactsheet(); }
    if (act === 'min-facts') ui.$('.facts').classList.toggle('min');
    if (act === 'close-guide') stopGuide();
    if (act === 'next') guideStep(+1);
    if (act === 'prev') guideStep(-1);
    if (act === 'speak-facts') speakFacts();
    if (act === 'close-toast') b.closest('.toast').remove();
    if (act === 'close-bubble') ui.$('.bubble').hidden = true;
    if (act === 'speak-bubble' && ui.bubbleRes) speak(ui.bubbleRes);
  }

  const UI_CSS = `
  :host{all:initial;--nk-scale:1;--ink:${INK};--paper:#FBF7EE;--lav:#A38BF3;--lime:#DDF46C;--sky:#A6D6EF;--coral:#FF7C5C;
    font:500 calc(14px * var(--nk-scale))/1.45 ${FONT};color:var(--ink);-webkit-font-smoothing:antialiased}
  *{box-sizing:border-box}
  [hidden]{display:none!important}
  button{all:unset;cursor:pointer}
  button:focus-visible{outline:3px solid var(--lav);outline-offset:2px}
  svg{width:20px;height:20px;display:block}
  .round{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:rgba(23,36,48,.07);flex:none}
  .round:hover{background:rgba(23,36,48,.13)}
  .round svg{width:17px;height:17px}

  /* Barre flottante : pilule d'encre, comme une barre de navigation */
  .dock{position:fixed;left:16px;bottom:16px;z-index:2147483646;display:flex;align-items:center;gap:4px;background:var(--ink);border-radius:999px;padding:6px;box-shadow:0 14px 34px rgba(23,36,48,.32)}
  .me{display:flex;align-items:center;gap:9px;color:#fff;font-weight:700;padding-right:12px;border-radius:999px}
  .logo{width:36px;height:36px;border-radius:50%;background:var(--lime);color:var(--ink);display:grid;place-items:center;font-weight:800;font-size:17px;letter-spacing:-.04em}
  .ib{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#fff}
  .ib:hover{background:rgba(255,255,255,.12)}
  .ib.on{background:var(--paper);color:var(--ink)}
  .dock:not(.open) .ib{display:none}

  /* Fiche claire */
  .facts{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:min(372px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:var(--paper);border-radius:32px;box-shadow:0 26px 64px rgba(23,36,48,.28);padding:18px 18px 16px}
  .fh{display:flex;align-items:center;gap:6px}
  .fh h2{all:unset;flex:1;display:flex;align-items:center;gap:6px;font-weight:800;font-size:1.55em;letter-spacing:-.035em;line-height:1}
  .fh h2 svg{width:.8em;height:.8em;color:var(--lav)}
  .facts.min{width:auto;padding:10px 10px 10px 18px;border-radius:999px}
  .facts.min>:not(.fh){display:none}
  .hero{text-align:center;padding:18px 0 8px}
  .hero .lab{font-weight:600}
  .big{font-weight:800;font-size:2.7em;letter-spacing:-.04em;line-height:1.05;font-variant-numeric:tabular-nums}
  .big .cur{font-weight:400;font-size:.5em;letter-spacing:0;margin-left:.15em}
  .big .dec{font-weight:400}
  .hero .hint{font-size:.85em;opacity:.6;margin-top:2px}
  .who{display:flex;align-items:center;gap:12px;background:#fff;border-radius:24px;padding:10px 12px;margin:10px 0}
  .av{width:46px;height:46px;border-radius:50%;background:var(--lav);display:grid;place-items:center;font-weight:800;font-size:1.05em;flex:none;box-shadow:0 0 0 3px #fff,0 0 0 5px var(--lav)}
  .who .n{font-weight:800;font-size:1.08em;letter-spacing:-.01em}
  .who .p{font-weight:600;opacity:.7;font-variant-numeric:tabular-nums}
  .who .l{font-size:.8em;opacity:.6}
  .tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .tile{border-radius:24px;padding:12px 14px 14px;min-height:92px;display:flex;flex-direction:column;justify-content:space-between;gap:8px}
  .tile .lab{font-weight:600;font-size:.88em;line-height:1.25}
  .tile .val{font-weight:800;font-size:1.4em;letter-spacing:-.025em;font-variant-numeric:tabular-nums;line-height:1.1}
  .tile .val .cur{font-weight:400;font-size:.62em;letter-spacing:0}
  .tile.wide{grid-column:1/-1;min-height:0}
  .t-amount{background:var(--lav)}.t-fee{background:var(--lime)}.t-balance{background:var(--sky)}.t-ref{background:#fff}
  .notes{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:12px}
  .notes .nl{width:100%;font-size:.82em;font-weight:600;opacity:.65}
  .bill{height:34px;min-width:62px;border-radius:9px;display:grid;place-items:center;padding:0 8px;font-weight:800;font-size:.8em;font-variant-numeric:tabular-nums;box-shadow:inset 0 0 0 2px rgba(255,255,255,.45)}
  .coin{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:.7em;background:#fff;box-shadow:inset 0 0 0 2px var(--ink)}
  .mult{font-weight:800;font-size:.9em;margin-right:-2px}
  .check{display:flex;gap:10px;align-items:flex-start;border-radius:22px;padding:12px 14px;margin-top:12px;font-weight:700;line-height:1.35}
  .check.ok{background:var(--lime)}
  .check.bad{background:var(--coral);animation:shake .45s 2}
  .check small{display:block;font-weight:600;margin-top:2px;font-variant-numeric:tabular-nums}
  @keyframes shake{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
  .fa{display:flex;gap:8px;margin-top:14px}
  .cta{flex:1;display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--ink);color:#fff;border-radius:999px;padding:6px 6px 6px 16px;font-weight:700}
  .cta .arr{width:32px;height:32px;border-radius:50%;background:var(--lime);color:var(--ink);display:grid;place-items:center}
  .cta .arr svg{width:17px;height:17px}
  .cta.alt{background:var(--lav);color:var(--ink)}
  .cta.alt .arr{background:#fff}

  /* Guide */
  .guide{position:fixed;left:50%;transform:translateX(-50%);bottom:84px;z-index:2147483647;width:min(440px,calc(100vw - 32px));background:var(--ink);color:#fff;border-radius:30px;padding:18px;box-shadow:0 22px 50px rgba(23,36,48,.4)}
  .gtop{display:flex;align-items:center;gap:10px}
  .gi{width:46px;height:46px;border-radius:50%;background:var(--lime);display:grid;place-items:center;font-size:1.35em;flex:none}
  .dots{flex:1;display:flex;gap:5px}
  .dots i{height:6px;flex:1;max-width:34px;border-radius:3px;background:rgba(255,255,255,.18)}
  .dots i.on{background:var(--lime)}
  .guide .round{background:rgba(255,255,255,.1);color:#fff}
  .guide .round:hover{background:rgba(255,255,255,.2)}
  .gt{font-size:1.28em;font-weight:700;letter-spacing:-.015em;line-height:1.3;margin:14px 2px 16px}
  .ga{display:flex;gap:8px;justify-content:flex-end;align-items:center}
  .guide .cta{flex:none;background:var(--lime);color:var(--ink);gap:14px}
  .guide .cta .arr{background:var(--ink);color:var(--lime)}

  /* Alerte arnaque */
  .toasts{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:8px;width:min(520px,calc(100vw - 28px))}
  .toast{background:var(--coral);color:var(--ink);border-radius:28px;padding:14px;box-shadow:0 18px 44px rgba(255,124,92,.45);display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start;animation:drop .35s ease-out}
  @keyframes drop{from{transform:translateY(-10px)}} /* jamais d'opacité 0 : une alerte reste visible même si l'animation ne tourne pas */
  .toast .ti{width:44px;height:44px;border-radius:50%;background:#fff;display:grid;place-items:center;font-size:1.3em}
  .toast b{display:block;font-weight:800;font-size:1.12em;letter-spacing:-.015em;margin-bottom:2px}
  .toast ul{margin:6px 0 0 18px;padding:0;font-size:.9em;font-weight:600}
  .toast .round{background:rgba(23,36,48,.12)}

  /* Bulle de sélection */
  .bubble{position:fixed;z-index:2147483647;width:min(380px,calc(100vw - 20px));background:var(--paper);border-radius:26px;box-shadow:0 18px 44px rgba(23,36,48,.28);padding:8px}
  .bubble .bt{display:flex;gap:6px;justify-content:flex-end;margin-top:6px}
  .bubble .ent{padding:6px 8px;font-weight:700}
  @media (prefers-reduced-motion: reduce){.check.bad,.toast{animation:none}}
  `;

  // ------------------------------------------------------------ bouclier anti-arnaque
  const toasted = new WeakSet();
  function scamToast(res, el) {
    if (!S.shield || toasted.has(el)) return;
    toasted.add(el);
    const u = UI();
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'alert');
    t.innerHTML = `<span class="ti" aria-hidden="true">🚨</span><div><b>${escapeHtml(tr('cat.fraud').text)}</b>${escapeHtml(tr('ui.scam_alert').text)}<ul>${res.flags.scam.reasons.map((r) => `<li>${escapeHtml(r.label)}</li>`).join('')}</ul></div><button class="round" data-act="close-toast" aria-label="Fermer">${SVG.close}</button>`;
    u.$('.toasts').appendChild(t);
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
    if (S.autoSpeak) speakQueue([{ text: tr('cat.fraud').text + '. ' + tr('ui.scam_alert').text, lang: tr('ui.scam_alert').fallback ? 'fr-FR' : L().tts }]);
  }

  // ------------------------------------------------------------ fiche claire
  const FACT_FROM_PHRASE = {
    'ph.amount_is': { AMOUNT: 'amount' }, 'ph.fees_are': { AMOUNT: 'fee' }, 'ph.fee_applied': { AMOUNT: 'fee' },
    'ph.total_is': { AMOUNT: 'total' }, 'ph.total_debit': { AMOUNT: 'total' }, 'ph.balance_is': { AMOUNT: 'balance' }, 'ph.new_balance': { AMOUNT: 'balance' },
    'ph.beneficiary_is': { NAME: 'beneficiary' }, 'ph.phone_is': { PHONE: 'phone' }, 'ph.reference_is': { REF: 'ref' },
    'ph.send_to': { AMOUNT: 'amount', NAME: 'beneficiary' }, 'ph.send_to_phone': { AMOUNT: 'amount', NAME: 'beneficiary', PHONE: 'phone' },
    'ph.send_to_number': { AMOUNT: 'amount', PHONE: 'phone' }
  };
  const FACT_FROM_LABEL = {
    'term.amount': ['amount', 'AMOUNT'], 'term.fees': ['fee', 'AMOUNT'], 'term.total': ['total', 'AMOUNT'], 'term.balance': ['balance', 'AMOUNT'],
    'term.beneficiary': ['beneficiary', 'NAME'], 'term.name': ['beneficiary', 'NAME'], 'term.phone': ['phone', 'PHONE'], 'term.reference': ['ref', 'REF']
  };
  const FACT_META = {
    beneficiary: ['👤', 'term.beneficiary'], phone: ['📱', 'term.phone'], amount: ['🔢', 'term.amount'], fee: ['🧾', 'term.fees'],
    total: ['➕', 'term.total'], balance: ['💰', 'term.balance'], ref: ['🏷️', 'term.reference']
  };

  function valueNear(el, type) {
    const cands = [];
    if (el.nextElementSibling) cands.push(el.nextElementSibling);
    if (el.parentElement) { cands.push(...[...el.parentElement.children].filter((c) => c !== el)); if (el.parentElement.nextElementSibling) cands.push(el.parentElement.nextElementSibling); }
    for (const c of cands) {
      if (isOurs(c)) continue;
      const txt = (c.tagName === 'INPUT' ? c.value : (c.innerText || c.textContent || '')).trim();
      if (!txt || txt.length > 120) continue;
      const { entities } = E.protect(txt);
      const hit = entities.find((e) => e.type === type);
      if (hit) return hit.raw;
      if (type === 'NAME' && /^\p{Lu}[\p{L}'’\- .]{1,60}$/u.test(txt) && !E.translate(txt, 'fr-facile').parts.some((p) => p.kind === 'exact')) return txt;
    }
    return null;
  }

  function extractFacts() {
    const f = {};
    for (const el of units) {
      if (!el.isConnected || !visible(el)) continue;
      const r = results.get(el); if (!r) continue;
      const res = r.res;
      for (const p of res.parts.filter((x) => x.kind === 'exact')) {
        const map = FACT_FROM_PHRASE[p.id];
        if (map) for (const [slot, key] of Object.entries(map)) if (p.slots && p.slots[slot] && !f[key]) f[key] = p.slots[slot];
        const lab = FACT_FROM_LABEL[p.id];
        if (lab && res.parts.length === 1 && res.entities.length === 0 && !f[lab[0]]) { const v = valueNear(el, lab[1]); if (v) f[lab[0]] = v; }
      }
    }
    return f;
  }

  let factsAuto = false, factsDismissed = null;
  function autoFactsheet() {
    if (!S.factsheet) return;
    const f = extractFacts();
    const n = ['amount', 'fee', 'total', 'beneficiary', 'phone'].filter((k) => f[k]).length;
    const sig = JSON.stringify(f);
    if (n >= 3) { if (factsDismissed === sig) return; if (factsAuto && lastFacts && JSON.stringify(lastFacts) === sig && ui && !ui.$('.facts').hidden) return; factsAuto = true; showFactsheet(false, f); }
    else if (factsAuto) { factsAuto = false; hideFactsheet(); }
  }

  const BILL_COLOR = { 10000: '#A38BF3', 5000: '#DDF46C', 2000: '#FF7C5C', 1000: '#A6D6EF' };
  function notesHtml(raw) {
    const a = E.parseAmount(raw);
    if (!a || a.currency !== 'XAF' || a.value > 5e7) return '';
    return `<div class="notes" role="img" aria-label="${escapeHtml(tr('ui.notes').text)}"><span class="nl">${escapeHtml(tr('ui.notes').text)}</span>${E.toBanknotes(a.value).map((d) => {
      const one = d.kind === 'note'
        ? `<span class="bill" style="background:${BILL_COLOR[d.value]}">${d.value.toLocaleString('fr-FR').replace(/ /g, ' ')}</span>`
        : `<span class="coin">${d.value}</span>`;
      return d.count > 4 ? `<span class="mult">${d.count}×</span>${one}` : one.repeat(d.count);
    }).join('')}</div>`;
  }

  const initials = (name) => String(name).split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  let lastFacts = null;
  function showFactsheet(manual, facts) {
    const f = facts || extractFacts();
    const u = UI();
    lastFacts = f;
    const lab = (k) => escapeHtml(tr(FACT_META[k][1]).text);
    let html = `<div class="fh"><h2>${escapeHtml(tr('ui.factsheet').text)} ${SVG.spark}</h2>
      <button class="round" data-act="min-facts" aria-label="Réduire" title="Réduire">${SVG.min}</button>
      <button class="round" data-act="close-facts" aria-label="Fermer" title="Fermer">${SVG.close}</button></div>`;
    const heroKey = f.total ? 'total' : f.amount ? 'amount' : f.balance ? 'balance' : null;
    if (heroKey) html += `<div class="hero"><div class="lab">${lab(heroKey)}</div><div class="big">${amountHtml(f[heroKey])}</div>${heroKey === 'total' && f.balance ? `<div class="hint">${lab('balance')} : ${escapeHtml(f.balance)}</div>` : ''}</div>`;
    if (f.beneficiary || f.phone) html += `<div class="who"><span class="av" aria-hidden="true">${escapeHtml(initials(f.beneficiary || '#'))}</span><div><div class="l">${lab('beneficiary')}</div>${f.beneficiary ? `<div class="n">${escapeHtml(f.beneficiary)}</div>` : ''}${f.phone ? `<div class="p">${escapeHtml(f.phone)}</div>` : ''}</div></div>`;
    const tiles = [];
    if (f.amount && heroKey !== 'amount') tiles.push(['t-amount', 'amount']);
    if (f.fee) tiles.push(['t-fee', 'fee']);
    if (f.balance && heroKey !== 'balance' && heroKey !== 'total') tiles.push(['t-balance', 'balance']);
    if (f.ref) tiles.push(['t-ref wide', 'ref']);
    if (tiles.length) html += `<div class="tiles">${tiles.map(([c, k]) => `<div class="tile ${c}${tiles.length === 1 ? ' wide' : ''}"><span class="lab">${FACT_META[k][0]} ${lab(k)}</span><span class="val">${k === 'ref' ? escapeHtml(f[k]) : amountHtml(f[k])}</span></div>`).join('')}</div>`;
    if (!heroKey && !tiles.length && !f.beneficiary) html += `<div class="hero"><div class="lab">${escapeHtml(tr('cat.info').text)}</div><div class="hint">—</div></div>`;
    if (heroKey) html += notesHtml(f[heroKey]);
    const a = f.amount && E.parseAmount(f.amount), fe = f.fee && E.parseAmount(f.fee), t = f.total && E.parseAmount(f.total);
    const chk = E.checkTotal(a && a.value, fe && fe.value, t && t.value);
    if (chk.checked) html += `<div class="check ${chk.ok ? 'ok' : 'bad'}" role="${chk.ok ? 'status' : 'alert'}"><span aria-hidden="true">${chk.ok ? '✓' : '🚨'}</span><div>${escapeHtml(tr(chk.ok ? 'ui.total_ok' : 'ui.total_mismatch').text)}${chk.ok ? '' : `<small>${escapeHtml(f.amount)} + ${escapeHtml(f.fee)} ≠ ${escapeHtml(f.total)}</small>`}</div></div>`;
    html += `<div class="fa"><button class="cta" data-act="speak-facts"><span>${escapeHtml(tr('ui.listen').text)}</span><span class="arr">${SVG.speak}</span></button><button class="cta alt" data-act="guide"><span>Guide</span><span class="arr">${SVG.next}</span></button></div>`;
    u.$('.facts').innerHTML = html;
    u.$('.facts').hidden = false;
    u.factsCheck = chk;
    if (chk.checked && !chk.ok && S.autoSpeak) speakQueue([{ text: tr('ui.total_mismatch').text, lang: L().tts }]);
  }
  function hideFactsheet() { if (ui) ui.$('.facts').hidden = true; }
  function speakFacts() {
    const f = lastFacts || extractFacts();
    const tts = L().tts;
    const items = [];
    for (const k of ['beneficiary', 'phone', 'amount', 'fee', 'total', 'balance']) {
      if (!f[k]) continue;
      const e = tr(FACT_META[k][1]);
      items.push({ text: e.text, lang: e.fallback ? 'fr-FR' : tts });
      items.push({ text: spokenAmounts(f[k], E.protect(f[k]).entities, 'fr-FR'), lang: 'fr-FR' });
    }
    if (ui && ui.factsCheck && ui.factsCheck.checked) { const e = tr(ui.factsCheck.ok ? 'ui.total_ok' : 'ui.total_mismatch'); items.push({ text: e.text, lang: e.fallback ? 'fr-FR' : tts }); }
    speakQueue(items);
  }

  // ------------------------------------------------------------ guide pas à pas
  let guide = null;
  function findField(words) {
    const inputs = [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter((i) => visible(i) && !isOurs(i));
    return inputs.find((i) => {
      const lab = (i.labels && [...i.labels].map((l) => l.innerText).join(' ')) || '';
      const hay = E.norm(`${lab} ${i.dataset.nkapPh || i.placeholder || ''} ${i.name || ''} ${i.id || ''} ${i.getAttribute('aria-label') || ''}`);
      return words.some((w) => hay.includes(w));
    });
  }
  function findButton(words) {
    return [...document.querySelectorAll('button,[role=button],input[type=submit],a')].filter((b) => visible(b) && !isOurs(b))
      .find((b) => words.some((w) => E.norm(b.innerText || b.value || '').includes(w)));
  }
  const isControl = (u) => u.matches('button,a,label,option,[role=button],input');
  function detectScreen() {
    const contentUnits = [...units].filter((u) => u.isConnected && visible(u) && !isControl(u));
    const visibleRes = contentUnits.map((u) => results.get(u)?.res).filter(Boolean);
    const cats = visibleRes.map((r) => r.cat);
    const facts = extractFacts();
    const steps = [];
    if (cats.includes('fraud')) steps.push({ id: 'cat.fraud' });
    if (cats.includes('error')) steps.push({ id: 'guide.error', el: [...units].find((u) => contentUnits.includes(u) && results.get(u)?.res.cat === 'error') });
    if (facts.total || (facts.amount && facts.beneficiary)) {
      steps.push({ id: 'guide.summary', el: null, facts: true });
      steps.push({ id: 'ph.irreversible' });
      const c = findButton(['confirmer', 'confirm', 'valider']); if (c) steps.push({ id: 'guide.transfer_confirm', el: c });
      return steps;
    }
    const num = findField(['numéro', 'numero', 'téléphone', 'telephone', 'phone', 'bénéficiaire', 'beneficiaire', 'recipient']);
    const amt = findField(['montant', 'amount', 'somme']);
    if (num || amt) {
      if (num) steps.push({ id: 'guide.transfer_number', el: num });
      if (amt) steps.push({ id: 'guide.transfer_amount', el: amt });
      steps.push({ id: 'guide.transfer_check', el: [...units].find((u) => results.get(u)?.res.cat === 'fees' && visible(u)) });
      const c = findButton(['continuer', 'suivant', 'envoyer', 'continue', 'next', 'send']); if (c) steps.push({ id: 'guide.transfer_confirm', el: c });
    }
    if (cats.includes('success')) steps.push({ id: 'guide.success', el: [...units].find((u) => results.get(u)?.res.cat === 'success' && visible(u)) });
    if (cats.includes('fees')) steps.push({ id: 'guide.fees', el: [...units].find((u) => results.get(u)?.res.cat === 'fees' && visible(u)) });
    if (cats.includes('balance')) steps.push({ id: 'guide.balance', el: [...units].find((u) => results.get(u)?.res.cat === 'balance' && visible(u)) });
    if (cats.includes('pin') || cats.includes('warning')) steps.push({ id: 'guide.security', el: [...units].find((u) => ['pin', 'warning'].includes(results.get(u)?.res.cat) && visible(u)) });
    if (!steps.length) steps.push({ id: 'cat.info' });
    return steps;
  }
  function startGuide() { processAll(); guide = { steps: detectScreen(), i: 0 }; guideStep(0); }
  function stopGuide() { document.querySelectorAll('.nkap-hl').forEach((e) => e.classList.remove('nkap-hl')); if (ui) ui.$('.guide').hidden = true; guide = null; }
  function guideStep(d) {
    if (!guide) return;
    guide.i = Math.max(0, Math.min(guide.steps.length - 1, guide.i + d));
    const st = guide.steps[guide.i];
    const e = tr(st.id);
    document.querySelectorAll('.nkap-hl').forEach((x) => x.classList.remove('nkap-hl'));
    if (st.el) { st.el.classList.add('nkap-hl'); try { st.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} }
    if (st.facts) showFactsheet(true);
    const u = UI();
    const last = guide.i === guide.steps.length - 1;
    const dots = guide.steps.map((_, i) => `<i class="${i <= guide.i ? 'on' : ''}"></i>`).join('');
    u.$('.guide').innerHTML = `<div class="gtop"><span class="gi" aria-hidden="true">${e.icon}</span><span class="dots" role="img" aria-label="Étape ${guide.i + 1} sur ${guide.steps.length}">${dots}</span><button class="round" data-act="close-guide" aria-label="Fermer le guide">${SVG.close}</button></div>
      <div class="gt">${escapeHtml(e.text)}</div>
      <div class="ga">${guide.i > 0 ? `<button class="round" data-act="prev" aria-label="Étape précédente">${SVG.prev}</button>` : ''}${last ? `<button class="cta" data-act="close-guide"><span>OK</span><span class="arr">${SVG.next}</span></button>` : `<button class="cta" data-act="next"><span>${escapeHtml(tr('ui.next').text)}</span><span class="arr">${SVG.next}</span></button>`}</div>`;
    u.$('.guide').hidden = false;
    speakQueue([{ text: e.text, lang: e.fallback ? 'fr-FR' : L().tts }]);
  }

  // ------------------------------------------------------------ lecture de page & sélection
  function readPage() {
    processAll();
    const ordered = [...units].filter((u) => u.isConnected && visible(u)).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const items = [];
    for (const u of ordered.slice(0, 40)) {
      const res = results.get(u)?.res;
      if (!res || res.kind === 'skip' || res.kind === 'entity-only') {
        const t = (u.innerText || '').trim(); if (t && E.protect(t).entities.length) items.push({ text: spokenAmounts(t, E.protect(t).entities, 'fr-FR'), lang: 'fr-FR' });
        continue;
      }
      if (res.kind === 'exact') res.parts.forEach((p) => items.push(recordings[p.id] ? { audio: recordings[p.id] } : { text: spokenAmounts(p.text, p.entities || [], p.fallback ? 'fr-FR' : L().tts), lang: p.fallback ? 'fr-FR' : L().tts }));
      else items.push({ text: res.headline.text, lang: res.headline.fallback ? 'fr-FR' : L().tts });
    }
    speakQueue(items);
  }

  function showBubble(text, rect) {
    const res = E.translate(text, S.lang, { strict: S.strict });
    if (res.kind === 'skip') return;
    const u = UI();
    u.bubbleRes = res;
    const b = u.$('.bubble');
    b.innerHTML = '';
    if (res.kind === 'entity-only') {
      b.innerHTML = `<div class="ent">${res.entities.map((e) => `<div class="big" style="font-size:1.8em">${e.type === 'AMOUNT' ? amountHtml(e.raw) : escapeHtml(e.raw)}</div>`).join('')}${res.entities.filter((e) => e.type === 'AMOUNT').map((e) => notesHtml(e.raw)).join('')}</div>`;
    } else {
      const n = buildNote(res);
      b.appendChild(n);
    }
    b.insertAdjacentHTML('beforeend', `<div class="bt"><button class="round" data-act="speak-bubble" aria-label="Écouter">${SVG.speak}</button><button class="round" data-act="close-bubble" aria-label="Fermer">${SVG.close}</button></div>`);
    b.hidden = false;
    const top = Math.min(window.innerHeight - 20, rect.bottom + 8);
    b.style.left = `${Math.max(10, Math.min(window.innerWidth - 390, rect.left))}px`;
    b.style.top = `${top}px`;
    requestAnimationFrame(() => { const h = b.getBoundingClientRect().height; if (top + h > window.innerHeight - 10) b.style.top = `${Math.max(10, rect.top - h - 8)}px`; });
  }

  document.addEventListener('mouseup', (ev) => {
    if (!active() || isOurs(ev.target) || ev.composedPath().some((n) => n && n.tagName === 'NKAP-ROOT')) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel && sel.toString().trim();
      if (!text || text.length < 3 || text.length > 500) return;
      showBubble(text, sel.getRangeAt(0).getBoundingClientRect());
    }, 10);
  });

  // Survol (mode « survol ») : bulle au passage de la souris
  let hoverTimer = null;
  document.addEventListener('mouseover', (ev) => {
    if (!active() || S.mode !== 'survol') return;
    const el = ev.target.closest && ev.target.closest('.nkap-has');
    clearTimeout(hoverTimer);
    if (!el) return;
    hoverTimer = setTimeout(() => { const r = results.get(el); if (r) showBubble(r.res.source, el.getBoundingClientRect()); }, 350);
  });

  // ------------------------------------------------------------ IA optionnelle (données masquées)
  const aiCache = new Map();
  function askAI(el, res, key) {
    if (!hasChrome) return;
    const masked = res.masked;
    if (aiCache.has(masked + S.lang)) { res.ai = aiCache.get(masked + S.lang); render(el, res); return; }
    chrome.runtime.sendMessage({ type: 'llm', masked, lang: S.lang, langName: L().name, entityCount: res.entities.length }, (reply) => {
      if (!reply || !reply.ok) return;
      const out = reply.text;
      // Vérification stricte : chaque jeton exactement une fois, aucun chiffre ajouté hors jetons
      const toks = [...out.matchAll(/⟦(\d+)⟧/g)].map((m) => +m[1]).sort();
      const want = [...masked.matchAll(/⟦(\d+)⟧/g)].map((m) => +m[1]).sort();
      if (JSON.stringify(toks) !== JSON.stringify(want) || /\d/.test(out.replace(/⟦\d+⟧/g, ''))) { stats.integrityRejected++; return; }
      const restored = E.restore(out, res.entities);
      aiCache.set(masked + S.lang, restored);
      const cur = results.get(el);
      if (cur && cur.key === key) { cur.res.ai = restored; pauseObserver(); render(el, cur.res); resumeObserver(); }
    });
  }

  // ------------------------------------------------------------ messages
  if (hasChrome) {
    chrome.runtime.onMessage.addListener((msg, _s, reply) => {
      if (msg.type === 'getState') { reply({ stats, lang: S.lang, enabled: active(), host: location.host || 'file', facts: extractFacts() }); return; }
      if (msg.type === 'settingsChanged') { loadSettings().then(() => { resetAll(); if (active()) { UI(); refreshUiTexts(); applyRootClasses(); processAll(); } else if (ui) { ui.host.remove(); ui = null; } }); }
      if (msg.type === 'factsheet') { processAll(); showFactsheet(true); }
      if (msg.type === 'guide') startGuide();
      if (msg.type === 'readPage') readPage();
      if (msg.type === 'translateSelection') { const s = window.getSelection(); const r = s && s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : { left: 20, top: 20, bottom: 40 }; showBubble(msg.text, r); }
      if (msg.type === 'toggle') { chrome.storage.sync.set({ settings: { ...S, enabled: !S.enabled } }); }
      if (msg.type === 'readSelection') { const t = window.getSelection()?.toString().trim(); if (t) speak(E.translate(t, S.lang)); else readPage(); }
      reply && reply({ ok: true });
    });
    chrome.storage.onChanged.addListener((ch) => {
      if (ch.settings || Object.keys(ch).some((k) => k.startsWith('ovr:') || k.startsWith('rec:'))) {
        loadSettings().then(() => { resetAll(); if (active()) { UI(); refreshUiTexts(); applyRootClasses(); processAll(); } else if (ui) { ui.host.remove(); ui = null; } });
      }
    });
  }

  function applyRootClasses() {
    document.documentElement.classList.toggle('nkap-big', !!S.bigText);
    document.documentElement.classList.toggle('nkap-immersif', S.mode === 'immersif');
  }

  // ------------------------------------------------------------ démarrage
  (async () => {
    await loadSettings();
    if (!active()) return;
    applyRootClasses();
    UI();
    processAll();
    resumeObserver();
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
  })();

  // Exposé pour les tests de bout en bout
  window.__nkapDebug = { stats, translate: (t) => E.translate(t, S.lang), facts: extractFacts, settings: () => S };
})();
