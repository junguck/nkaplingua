/*!
 * NkapLingua — moteur de compréhension financière multilingue
 * Fonctionne dans le navigateur (extension) ET dans Node (tests).
 *
 * Principe de sûreté : le moteur ne « traduit » jamais un chiffre, un nom ou un numéro.
 * 1. Les entités sensibles (montants, frais, téléphones, noms, références…) sont
 *    VERROUILLÉES (remplacées par des jetons) avant toute analyse.
 * 2. Les phrases connues sont reconnues par motifs et rendues avec un gabarit
 *    rédigé/validé par des locuteurs ; les entités sont réinjectées telles quelles.
 * 3. Un contrôle d'intégrité vérifie que chaque chiffre et chaque nom de la source
 *    se retrouve à l'identique dans la sortie. Sinon : la sortie est rejetée.
 * 4. Un contenu inédit n'est jamais traduit « au hasard » : il est classé
 *    (erreur, alerte, frais…), ses mots-clés sont glosés, ses conditions et
 *    interdictions sont signalées, et l'original reste visible.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NkapEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---------------------------------------------------------------- entités
  const NUM = '\\d{1,3}(?:[ \\u00a0\\u202f.,]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?';
  const CUR_SUFFIX = '(?:F\\s?CFA|FCFA|XAF|francs?\\s+CFA|francs?|FRS|Frs|F|€|EUR|USD|\\$)';
  const CUR_PREFIX = '(?:XAF|FCFA|EUR|USD|€|\\$)';
  const MONTHS = 'janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december';

  const ENTITY_RULES = [
    { type: 'REF', re: /(?<![\p{L}\d])(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9]{2,}(?:-[A-Z0-9]+)+(?![\p{L}\d])|(?<![\p{L}\d])[A-Z]{2,}\d{4,}[A-Z0-9]*(?![\p{L}\d])/gu },
    { type: 'AMOUNT', re: new RegExp(`(?:${CUR_PREFIX}\\s?(?:${NUM}))(?![\\d])|(?<![\\d])(?:${NUM})\\s?${CUR_SUFFIX}(?![\\p{L}\\d])`, 'gu') },
    { type: 'PERCENT', re: /(?<![\d])\d+(?:[.,]\d+)?\s?%/gu },
    { type: 'PHONE', re: /(?:\+\s?237[\s.\-]?)?(?<![\d])[26](?:[\s.\-]?\d){8}(?![\d])/gu },
    { type: 'DATE', re: new RegExp(`(?<![\\d])\\d{1,2}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{2,4}(?![\\d])|(?<![\\d])\\d{1,2}(?:er)?\\s(?:${MONTHS})(?:\\s\\d{4})?(?![\\p{L}])`, 'giu') },
    { type: 'TIME', re: /(?<![\d])\d{1,2}\s?[h:]\s?\d{2}(?![\d])/gu },
    { type: 'MASK', re: /\*{3,}\d{0,4}|(?<![\p{L}])X{3,}\d{0,4}(?![\p{L}])/gu },
    { type: 'NUM', re: /(?<![\d])\d+(?:[.,]\d+)?(?![\d])/gu }
  ];

  const TOKEN_RE = /⟦(\d+)⟧/g;
  const NAME_CUES = /(?:^|[\s(])(?:à|au|aux|to|de|from|pour|for|chez|bénéficiaire|beneficiary|destinataire|recipient|nom|name|expéditeur|sender|m\.|mme|mr|mrs|monsieur|madame)\s*:?\s+$/iu;
  const CAP_WORD = /^\p{Lu}[\p{L}'’\-.]*$/u;

  let DATA = null;           // { concepts, languages }
  let CONCEPTS = {};         // id -> concept
  let PATTERNS = [];         // phrase + term patterns
  let TERM_SCAN = [];        // gloss scanning
  let VOCAB = new Set();     // mots du glossaire (pour ne pas les prendre pour des noms)
  let OVERRIDES = {};        // lang -> { id -> {t,s} } (Studio linguistique)

  // ------------------------------------------------------------ utilitaires
  function stripIcons(s) {
    return s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u2190-\u21FF\u2500-\u27BF]/gu, ' ');
  }
  function norm(s) {
    return stripIcons(String(s)).normalize('NFC').toLowerCase()
      .replace(/[’‘`´]/g, "'")
      .replace(/[.,;:!?¡¿"«»“”()\[\]…•·|/\\–—_*#>]/g, ' ')
      .replace(/(^|\s)-+(\s|$)/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function digitRuns(s) { return (String(s).match(/\d+/g) || []).slice().sort(); }

  // ----------------------------------------------------------- verrouillage
  /** Remplace les entités sensibles par des jetons ⟦i⟧. */
  function protect(text) {
    const entities = [];
    let masked = String(text);
    for (const rule of ENTITY_RULES) {
      rule.re.lastIndex = 0;
      const cur = masked;
      masked = masked.replace(rule.re, (m, ...args) => {
        const off = args[args.length - 2];
        if (/⟦|⟧/.test(m) || cur[off - 1] === '⟦' || cur[off + m.length] === '⟧') return m;
        const raw = m.trim();
        if (!raw) return m;
        const lead = m.match(/^\s*/)[0], trail = m.match(/\s*$/)[0];
        entities.push({ type: rule.type, raw });
        return `${lead}⟦${entities.length - 1}⟧${trail}`;
      });
    }
    masked = protectNames(masked, entities);
    return { masked, entities };
  }

  function isVocabWord(w) {
    const n = norm(w).replace(/'/g, '');
    return !n || VOCAB.has(n) || n.length < 2;
  }
  function isNameToken(w) {
    if (!CAP_WORD.test(w)) return false;
    if (/^[A-Z]{2,5}$/.test(w)) return false;        // PIN, OTP, FCFA, SMS…
    return !isVocabWord(w);
  }

  function protectNames(masked, entities) {
    // Découpe en mots en conservant les séparateurs
    const parts = masked.split(/(\s+)/);
    const out = [];
    let i = 0;
    const wholeIsName = parts.filter((p) => p.trim()).every((p) => isNameToken(p.replace(/[,;:.!?]+$/, '')));
    while (i < parts.length) {
      const w = parts[i];
      const clean = w.replace(/[,;:.!?)]+$/, '');
      const before = out.join('');
      const sentenceStart = /(^|[.!?:]\s*)$/.test(before.trim() ? before : '') || !before.trim();
      const cue = NAME_CUES.test(before);
      if (isNameToken(clean) && (cue || wholeIsName || (!sentenceStart && isNameToken((parts[i + 2] || '').replace(/[,;:.!?)]+$/, ''))))) {
        // capture 1 à 4 mots capitalisés
        const seq = [clean];
        let j = i + 2;
        let tail = w.slice(clean.length);
        while (!tail && j < parts.length && seq.length < 4) {
          const n = parts[j].replace(/[,;:.!?)]+$/, '');
          if (!isNameToken(n)) break;
          seq.push(n);
          tail = parts[j].slice(n.length);
          j += 2;
        }
        if (cue || wholeIsName || seq.length >= 2) {
          entities.push({ type: 'NAME', raw: seq.join(' ') });
          out.push(`⟦${entities.length - 1}⟧${tail}`);
          i = j - 1;
          continue;
        }
      }
      out.push(w);
      i++;
    }
    return out.join('');
  }

  function restore(s, entities) {
    return s.replace(TOKEN_RE, (_, i) => (entities[+i] ? entities[+i].raw : ''));
  }

  // ---------------------------------------------------------- initialisation
  function init(data) {
    DATA = data;
    CONCEPTS = {};
    PATTERNS = [];
    TERM_SCAN = [];
    VOCAB = new Set();
    for (const c of data.concepts) {
      CONCEPTS[c.id] = c;
      const variants = [...(c.fr || []).map((v) => ({ v, src: 'fr' })), ...(c.en || []).map((v) => ({ v, src: 'en' }))];
      for (const { v, src } of variants) {
        norm(v.replace(/\{[A-Z0-9]+\}/g, ' ')).split(' ').forEach((w) => w && VOCAB.add(w.replace(/'/g, '')));
        const slots = [];
        const n = norm(v).replace(/\{([a-z0-9]+)\}/g, (_, s) => `§${s.toUpperCase()}§`);
        let reSrc = escapeRe(n).replace(/§([A-Z0-9]+)§/g, (_, s) => { slots.push(s); return '⟦(\\d+)⟧'; });
        reSrc = reSrc.replace(/ /g, '\\s*');
        PATTERNS.push({ id: c.id, type: c.type, re: new RegExp(`^${reSrc}$`, 'u'), slots, len: n.length, src });
        if (c.type === 'term') TERM_SCAN.push({ id: c.id, re: new RegExp(`(?<![\\p{L}])${escapeRe(n).replace(/ /g, '\\s+')}(?:s|x)?(?![\\p{L}])`, 'gu'), len: n.length });
      }
    }
    // Les motifs à entités (plus spécifiques) d'abord, puis les plus longs.
    PATTERNS.sort((a, b) => (b.slots.length - a.slots.length) || (b.len - a.len));
    TERM_SCAN.sort((a, b) => b.len - a.len);
    // Mots fréquents qui ne sont jamais des noms
    ['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'votre', 'vos', 'mon', 'ma', 'mes', 'vous', 'nous', 'il', 'elle', 'ce', 'cette', 'et', 'ou', 'en', 'sur', 'par', 'avec', 'sans', 'pas', 'ne', 'plus', 'the', 'your', 'you', 'we', 'our', 'is', 'are', 'will', 'be', 'and', 'or', 'of', 'in', 'on', 'for', 'with', 'not', 'do', 'please', 'veuillez', 'cliquez', 'appuyez', 'tapez', 'merci', 'bonjour', 'nouveau', 'nouvelle', 'mobile', 'money', 'pay', 'cameroun', 'cameroon', 'yaoundé', 'douala']
      .forEach((w) => VOCAB.add(w));
    return api;
  }

  function setOverrides(lang, map) { OVERRIDES[lang] = map || {}; }

  function languages() {
    return Object.values(DATA.languages).map((l) => ({ code: l.code, name: l.name, native: l.native, flag: l.flag, coverage: coverage(l.code) }));
  }

  /** Renvoie l'entrée d'un concept dans une langue, avec repli sur le français facile. */
  function entry(lang, id, opts = {}) {
    const c = CONCEPTS[id];
    if (!c) return null;
    const L = DATA.languages[lang];
    let e = OVERRIDES[lang] && OVERRIDES[lang][id];
    if (!e && L && L.entries[id] != null) e = L.entries[id];
    if (e && typeof e === 'string') e = { t: e, s: (L && L.default_status) || 'propose' };
    if (e && e.s === 'rejete') e = null;
    if (e && opts.strict && !(e.s === 'valide' || e.s === 'atteste' || e.s === 'reference')) e = null;
    if (e && e.t) return { text: e.t, status: e.s || 'propose', src: e.src || null, fallback: false, icon: c.icon, lang };
    return { text: c.easy, status: 'reference', src: 'Français facile', fallback: lang !== 'fr-facile', icon: c.icon, lang: 'fr-facile' };
  }

  function coverage(lang) {
    const ids = DATA.concepts.filter((c) => c.type !== 'ui' || true).map((c) => c.id);
    let have = 0, validated = 0;
    for (const id of ids) {
      const e = entry(lang, id);
      if (!e.fallback) { have++; if (e.status === 'valide' || e.status === 'atteste' || e.status === 'reference') validated++; }
    }
    return { total: ids.length, translated: have, validated, pct: Math.round((100 * have) / ids.length) };
  }

  function fill(template, slotMap) {
    return template.replace(/\{([A-Z0-9]+)\}/g, (m, s) => (slotMap[s] != null ? slotMap[s] : m));
  }

  // ------------------------------------------------------------- analyses
  const NEG_RE = /\b(?:ne|n')\b[^.!?]{0,60}\b(?:pas|jamais|plus|personne|aucun|aucune|rien)\b|\bjamais\b|\bnever\b|\b(?:do not|don't|does not|doesn't|must not|not)\b|\bne\s+\S+\s+jamais\b/iu;
  const COND_RE = /(?:^|[\s(])(?:si|sauf|uniquement|seulement|avant|après|au-delà|au delà|maximum|minimum|au moins|plafond|dans un délai|sous réserve|à condition|if|unless|only|before|after|at least|up to|within|exceeds?|dépasse)(?=[\s,.:;!?)]|$)/iu;

  const SCAM_RULES = [
    { key: 'demande_code', w: 3, re: /(?:envoy|donn|communiqu|transmet|partag|indiqu|dict|send|give|share|tell|forward)\w*[^.!?]{0,40}\b(?:code|pin|otp|mot de passe|password)\b/iu, needsNoNeg: true },
    { key: 'gain_miracle', w: 2, re: /\b(?:vous avez gagné|félicitations|gagnant|tombola|jackpot|you(?: have)? won|congratulations|winner|lottery|cadeau)\b/iu },
    { key: 'payer_pour_recevoir', w: 3, re: /\b(?:frais de (?:déblocage|dossier|retrait du gain|activation)|pay(?:ez|er)?\b[^.!?]{0,30}\bpour (?:recevoir|débloquer)|pay\b[^.!?]{0,30}\bto (?:receive|unlock|claim))/iu },
    { key: 'urgence', w: 1, re: /\b(?:urgent|immédiatement|tout de suite|dans les \d+ ?(?:minutes|heures)|sinon votre compte|immediately|within \d+ (?:minutes|hours))\b/iu },
    { key: 'erreur_transfert', w: 3, re: /\b(?:envoyé par erreur|par erreur sur votre compte|renvoy\w*\s+(?:moi\s+)?(?:l'|le\s+)?argent|sent (?:it )?by mistake|send (?:it )?back|retourn\w* l'argent)\b/iu },
    { key: 'menace_blocage', w: 2, re: /\b(?:compte|account)\b[^.!?]{0,30}\b(?:sera|will be)\b[^.!?]{0,15}\b(?:bloqué|suspendu|fermé|blocked|suspended|closed)\b/iu },
    { key: 'lien_suspect', w: 2, re: /(?:https?:\/\/(?!(?:www\.)?(?:localhost|127\.0\.0\.1))|bit\.ly|tinyurl|cliquez sur (?:ce|le) lien|click (?:this|the) link)/iu },
    { key: 'code_ussd_pin', w: 3, re: /#\d{2,4}\*[^#\s]*\*[^#\s]*#/u }
  ];
  const SCAM_LABELS = {
    demande_code: 'On vous demande un code secret',
    gain_miracle: 'On vous promet un gain ou un cadeau',
    payer_pour_recevoir: 'On vous demande de payer pour recevoir',
    urgence: 'On vous presse (urgence)',
    erreur_transfert: 'On dit avoir envoyé de l\'argent « par erreur »',
    menace_blocage: 'On menace de bloquer votre compte',
    lien_suspect: 'Lien ou adresse suspecte',
    code_ussd_pin: 'Code USSD contenant des données à saisir'
  };

  function detectScam(text) {
    const t = String(text);
    let score = 0; const reasons = [];
    for (const r of SCAM_RULES) {
      const m = t.match(r.re);
      if (!m) continue;
      if (r.needsNoNeg) {
        // « Ne partagez jamais votre code » est un conseil, pas une arnaque.
        const start = Math.max(0, m.index - 40);
        const ctx = t.slice(start, m.index + m[0].length);
        if (NEG_RE.test(ctx) || /\b(?:personne|anyone|nobody|aucun)\b/iu.test(t.slice(m.index, m.index + m[0].length + 30))) continue;
      }
      score += r.w; reasons.push({ key: r.key, label: SCAM_LABELS[r.key] });
    }
    // Un libellé court (bouton, titre) n'est pas un message : il faut une vraie phrase
    const words = (t.match(/\p{L}{2,}/gu) || []).length;
    return { score, scam: score >= 3 && words >= 6, reasons };
  }

  function scanTerms(maskedNorm) {
    const taken = new Array(maskedNorm.length).fill(false);
    const hits = [];
    for (const t of TERM_SCAN) {
      t.re.lastIndex = 0; let m;
      while ((m = t.re.exec(maskedNorm))) {
        let free = true;
        for (let k = m.index; k < m.index + m[0].length; k++) if (taken[k]) { free = false; break; }
        if (!free) continue;
        for (let k = m.index; k < m.index + m[0].length; k++) taken[k] = true;
        hits.push({ id: t.id, at: m.index, match: m[0] });
      }
    }
    hits.sort((a, b) => a.at - b.at);
    const seen = new Set();
    return hits.filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)));
  }

  const CAT_PRIORITY = ['fraud', 'pin', 'error', 'warning', 'confirm', 'fees', 'balance', 'transfer', 'success', 'condition', 'info'];

  function classify(maskedNorm, termHits, flags, entities) {
    const score = {};
    const add = (c, w) => { score[c] = (score[c] || 0) + w; };
    for (const h of termHits) {
      const c = CONCEPTS[h.id];
      add(c.cat, c.critical ? 2 : 1);
    }
    if (flags.scam && flags.scam.scam) add('fraud', 10);
    const ids = new Set(termHits.map((h) => h.id));
    if (flags.negation && (ids.has('term.pin') || ids.has('term.otp'))) add('pin', 4);
    if (ids.has('term.warning')) add('warning', 3);
    if (ids.has('term.error') || ids.has('term.insufficient') || ids.has('term.blocked')) add('error', 2);
    if (entities.some((e) => e.type === 'AMOUNT') && ids.has('term.fees')) add('fees', 1);
    if (flags.condition) add('condition', entities.some((e) => e.type === 'AMOUNT' || e.type === 'PERCENT') ? 1.5 : 0.5);
    let best = 'info', bestScore = 0;
    for (const c of CAT_PRIORITY) if ((score[c] || 0) > bestScore) { best = c; bestScore = score[c]; }
    return best;
  }

  // --------------------------------------------------------- intégrité
  /** Chaque entité doit réapparaître à l'identique, et aucun chiffre ne doit être perdu ou inventé. */
  function verifyIntegrity(sourceEntities, output, opts = {}) {
    const missing = [];
    for (const e of sourceEntities) {
      if (!output.includes(e.raw)) missing.push(e.raw);
    }
    const srcDigits = digitRuns(sourceEntities.map((e) => e.raw).join(' '));
    const outDigits = digitRuns(opts.allowedExtraText ? output.replace(opts.allowedExtraText, '') : output);
    const digitsOk = JSON.stringify(srcDigits) === JSON.stringify(outDigits);
    return { ok: missing.length === 0 && digitsOk, missing, digitsOk, checked: sourceEntities.length };
  }

  // ------------------------------------------------------------ traduction
  function splitSentences(masked) {
    return masked.split(/(?<=[.!?])\s+(?=\S)|\n+/u).map((s) => s.trim()).filter(Boolean);
  }

  function matchExact(segMasked, entities) {
    const n = norm(segMasked);
    if (!n) return null;
    for (const p of PATTERNS) {
      const m = n.match(p.re);
      if (!m) continue;
      const slotMap = {}; let ok = true; const used = [];
      p.slots.forEach((slot, k) => {
        const idx = +m[k + 1];
        const ent = entities[idx];
        const want = slot.replace(/\d+$/, '');
        if (!ent || ent.type !== want) ok = false;
        else { slotMap[slot] = ent.raw; used.push(idx); }
      });
      if (!ok) continue;
      // Toutes les entités du segment doivent être couvertes par le gabarit
      const segIdx = [...segMasked.matchAll(TOKEN_RE)].map((x) => +x[1]);
      if (segIdx.some((i) => !used.includes(i))) continue;
      return { id: p.id, slotMap, entIdx: segIdx };
    }
    return null;
  }

  /**
   * translate(text, lang, opts) → résultat structuré.
   * opts.strict : n'utiliser que les entrées validées/attestées.
   */
  function translate(text, lang, opts = {}) {
    const source = String(text || '').replace(/\s+/g, ' ').trim();
    const { masked, entities } = protect(source);
    const res = { source, lang, masked, entities, parts: [], terms: [], flags: {}, kind: 'skip', cat: 'info', integrity: { ok: true, missing: [], checked: 0 } };
    const letters = masked.replace(TOKEN_RE, '').replace(/[^\p{L}]/gu, '');
    if (letters.length < 2) { res.kind = entities.length ? 'entity-only' : 'skip'; return res; }

    res.flags.negation = NEG_RE.test(source);
    res.flags.condition = COND_RE.test(source);
    res.flags.scam = detectScam(source);

    const whole = matchExact(masked, entities);
    const sentences = whole ? [masked] : splitSentences(masked);
    let exactCount = 0;
    for (const s of sentences) {
      const m = matchExact(s, entities);
      if (m) {
        const e = entry(lang, m.id, opts);
        const text = fill(e.text, m.slotMap);
        const segEnts = m.entIdx.map((i) => entities[i]);
        const integ = verifyIntegrity(segEnts, text);
        if (integ.ok) {
          exactCount++;
          res.parts.push({ kind: 'exact', id: m.id, text, status: e.status, fallback: e.fallback, icon: CONCEPTS[m.id].icon, cat: CONCEPTS[m.id].cat, critical: !!CONCEPTS[m.id].critical, source: restore(s, entities), entities: segEnts, slots: m.slotMap });
          continue;
        }
        res.rejected = (res.rejected || []).concat([{ id: m.id, reason: 'integrity', missing: integ.missing }]);
      }
      res.parts.push({ kind: 'unknown', source: restore(s, entities), masked: s });
    }

    // Glose : mots-clés + catégorie, pour tout ce qui n'est pas reconnu exactement
    const unknown = res.parts.filter((p) => p.kind === 'unknown');
    const glossSrc = norm(unknown.length ? unknown.map((p) => p.masked).join(' ') : masked);
    const hits = scanTerms(glossSrc);
    res.terms = hits.map((h) => {
      const e = entry(lang, h.id, opts);
      return { id: h.id, match: h.match, text: e.text, status: e.status, fallback: e.fallback, icon: CONCEPTS[h.id].icon, critical: !!CONCEPTS[h.id].critical };
    });
    const allHits = scanTerms(norm(masked));
    res.cat = classify(norm(masked), allHits, res.flags, entities);
    // Une phrase exacte critique (ex. ne jamais partager le PIN) fixe la catégorie
    const crit = res.parts.find((p) => p.kind === 'exact' && p.critical);
    if (crit && res.cat !== 'fraud') res.cat = crit.cat;
    if (exactCount === 1 && sentences.length === 1 && res.cat !== 'fraud') res.cat = res.parts[0].cat;

    const head = entry(lang, `cat.${res.cat}`, opts);
    res.headline = { text: head.text, icon: head.icon, status: head.status, fallback: head.fallback, cat: res.cat };
    if (res.flags.negation) res.negationNote = entry(lang, 'flag.negation', opts);
    if (res.flags.condition) res.conditionNote = entry(lang, 'flag.condition', opts);

    res.kind = unknown.length === 0 ? 'exact' : (exactCount ? 'mixed' : 'gloss');
    res.text = res.parts.filter((p) => p.kind === 'exact').map((p) => p.text).join(' ');
    res.integrity = verifyIntegrity(res.parts.filter((p) => p.kind === 'exact').flatMap((p) => p.entities), res.text);
    res.critical = res.parts.some((p) => p.critical) || res.terms.some((t) => t.critical) || ['fraud', 'pin', 'error', 'warning'].includes(res.cat);
    const statuses = [...res.parts.filter((p) => p.kind === 'exact'), ...res.terms].map((p) => (p.fallback ? 'fallback' : p.status));
    res.confidence = statuses.length === 0 ? 'fallback'
      : statuses.every((s) => s === 'valide' || s === 'atteste' || s === 'reference') ? 'validated'
      : statuses.includes('fallback') ? 'partial' : 'proposed';
    return res;
  }

  // ------------------------------------------------------ montants et billets
  function parseAmount(raw) {
    const s = String(raw);
    const currency = /€|EUR/i.test(s) ? 'EUR' : /\$|USD/i.test(s) ? 'USD' : 'XAF';
    let n = s.replace(/[^\d.,\s  ]/g, '').trim();
    n = n.replace(/[\s  ]/g, '');
    if (/[.,]\d{3}(?![\d])/.test(n) && !/[.,]\d{1,2}$/.test(n)) n = n.replace(/[.,]/g, '');
    else if (/[.,]\d{1,2}$/.test(n)) n = n.replace(/[.,](?=\d{3}(?:[.,]|$))/g, '').replace(',', '.');
    const value = parseFloat(n);
    return isNaN(value) ? null : { value, currency };
  }

  const CEMAC = [
    { v: 10000, kind: 'note', color: '#6b4fa3' }, { v: 5000, kind: 'note', color: '#2e7d5b' },
    { v: 2000, kind: 'note', color: '#1f6fae' }, { v: 1000, kind: 'note', color: '#b8572a' },
    { v: 500, kind: 'coin', color: '#c9a227' }, { v: 100, kind: 'coin', color: '#9aa0a6' },
    { v: 50, kind: 'coin', color: '#9aa0a6' }, { v: 25, kind: 'coin', color: '#c9a227' },
    { v: 10, kind: 'coin', color: '#c9a227' }, { v: 5, kind: 'coin', color: '#b07a4a' },
    { v: 2, kind: 'coin', color: '#b07a4a' }, { v: 1, kind: 'coin', color: '#b07a4a' }
  ];
  function toBanknotes(value) {
    let rest = Math.round(value);
    const out = [];
    for (const d of CEMAC) {
      const c = Math.floor(rest / d.v);
      if (c > 0) { out.push({ value: d.v, count: c, kind: d.kind, color: d.color }); rest -= c * d.v; }
    }
    return out;
  }

  function checkTotal(amount, fee, total) {
    if (amount == null || fee == null || total == null) return { checked: false };
    const diff = Math.round((amount + fee - total) * 100) / 100;
    return { checked: true, ok: Math.abs(diff) < 0.5, expected: amount + fee, diff };
  }

  // Lecture vocale des montants en français (repli universel compréhensible)
  function amountToFrenchWords(n) {
    n = Math.round(n);
    if (n === 0) return 'zéro';
    const u = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
    const t = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
    function below100(x) {
      if (x <= 16) return u[x];
      if (x < 20) return 'dix-' + u[x - 10];
      if (x < 70) { const d = Math.floor(x / 10), r = x % 10; return t[d] + (r === 1 ? '-et-un' : r ? '-' + u[r] : ''); }
      if (x < 80) return 'soixante' + (x === 71 ? '-et-onze' : '-' + below100(x - 60));
      const r = x - 80; return 'quatre-vingt' + (r === 0 ? 's' : '-' + below100(r));
    }
    function below1000(x) {
      const c = Math.floor(x / 100), r = x % 100;
      let s = c === 0 ? '' : c === 1 ? 'cent' : u[c] + '-cent' + (r === 0 ? 's' : '');
      if (r) s += (s ? '-' : '') + below100(r);
      return s;
    }
    const parts = [];
    const mil = Math.floor(n / 1e6), th = Math.floor((n % 1e6) / 1000), rest = n % 1000;
    if (mil) parts.push((mil === 1 ? 'un' : below1000(mil)) + ' million' + (mil > 1 ? 's' : ''));
    if (th) parts.push(th === 1 ? 'mille' : below1000(th).replace(/cents$/, 'cent') + '-mille');
    if (rest) parts.push(below1000(rest));
    return parts.join(' ');
  }

  const api = {
    init, setOverrides, languages, entry, coverage, translate, protect, restore, verifyIntegrity,
    detectScam, parseAmount, toBanknotes, checkTotal, amountToFrenchWords, norm, fill,
    get concepts() { return CONCEPTS; },
    get data() { return DATA; },
    SCAM_LABELS
  };
  return api;
});
