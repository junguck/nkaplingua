const pptxgen = require('pptxgenjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const fa = require('react-icons/fa6');
const { applyTheme } = require(process.env.APPLY_THEME ?? './apply_theme.js');

const OUT = require('path').join(__dirname, 'NkapLingua-Pitch-LaboLinguistique.pptx');
const TEAM = process.env.TEAM_IMAGE ?? require('path').join(__dirname, 'equipe.png');
const SLOGAN = '« Tout le monde devrait pouvoir parler argent, dans sa propre langue. »';

const THEME = {
  name: 'NkapLingua Pitch', headFontFace: 'Arial', bodyFontFace: 'Arial',
  colors: { dk1: '122B2C', lt1: 'FFFFFF', dk2: '102A2A', lt2: 'F6F5EE', accent1: '007C68', accent2: 'F0C45B', accent3: 'D9F3E5', accent4: '526666', accent5: 'C8553D', accent6: '7FB59A', hlink: '007C68', folHlink: '102A2A' },
};
const H = THEME.colors;

async function icon(name, color) {
  const svg = renderToStaticMarkup(React.createElement(fa[name], { color: '#' + color, size: 256 }));
  return 'image/png;base64,' + (await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer()).toString('base64');
}

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = 'NkapLingua, pitch';
  pres.author = 'Shun&Co.';
  pres.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial' };
  const C = pres.SchemeColor;

  pres.defineSlideMaster({
    title: 'Sombre', background: { color: H.dk2 },
    objects: [
      { text: { text: 'NKAPLINGUA  /  SHUN&CO.', options: { x: 0.6, y: 0.3, w: 6, h: 0.3, fontSize: 10, bold: true, color: C.accent3, charSpacing: 2, margin: 0 } } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 2.2, w: 12.1, h: 1.4, fontSize: 54, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.6, y: 3.75, w: 11.5, h: 1.5, fontSize: 24, color: C.accent2, valign: 'top', align: 'left', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'foot', type: 'body', x: 0.6, y: 6.4, w: 11.5, h: 0.5, fontSize: 14, color: C.accent3, align: 'left', margin: 0 }, text: '' } },
    ],
  });
  pres.defineSlideMaster({
    title: 'Contenu', background: { color: H.lt2 }, margin: [0.5, 0.6, 0.7, 0.6],
    objects: [
      { text: { text: 'NKAPLINGUA  /  SHUN&CO.', options: { x: 0.6, y: 0.25, w: 6, h: 0.3, fontSize: 10, bold: true, color: C.accent1, charSpacing: 2, margin: 0 } } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.6, w: 12.1, h: 0.8, fontSize: 32, bold: true, color: C.text1, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'sub', type: 'body', x: 0.6, y: 1.38, w: 12.1, h: 0.45, fontSize: 16, color: C.accent4, align: 'left', margin: 0 }, text: '' } },
    ],
    slideNumber: { x: 12.2, y: 0.25, w: 0.5, h: 0.3, fontSize: 10, color: C.accent1, align: 'right' },
  });
  pres.defineSlideMaster({ title: 'Image', background: { color: H.lt1 } });

  const I = {};
  const list = [['phone', 'FaMobileRetro'], ['sms', 'FaCommentSms'], ['call', 'FaPhoneVolume'], ['app', 'FaMobileScreenButton'], ['web', 'FaGlobe'], ['atm', 'FaMoneyBillWave'],
    ['user', 'FaUser'], ['bank', 'FaBuildingColumns'], ['gate', 'FaTowerBroadcast'], ['brain', 'FaLanguage'], ['users', 'FaUserGroup'], ['pen', 'FaPenToSquare'], ['eye', 'FaUserCheck'],
    ['bolt', 'FaBolt'], ['coins', 'FaCoins'], ['mic', 'FaMicrophone'], ['check', 'FaCircleCheck'], ['lock', 'FaLock'], ['shield', 'FaShieldHalved'], ['box', 'FaBox'], ['copy', 'FaClone'],
    ['clock', 'FaStopwatch'], ['house', 'FaHouseLock'], ['heart', 'FaHeartPulse'], ['arrows', 'FaArrowsRotate'], ['chart', 'FaChartLine'], ['hand', 'FaHandshake'], ['grad', 'FaGraduationCap'],
    ['book', 'FaBookOpen'], ['seed', 'FaSeedling'], ['flag', 'FaFlagCheckered'], ['play', 'FaPlay'], ['x', 'FaXmark']];
  for (const [k, n] of list) { I[k] = await icon(n, 'FFFFFF'); I[k + 'G'] = await icon(n, H.accent1); }

  const circ = (s, key, x, y, d, fill, name) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill }, objectName: name + ' cercle' });
    const p = d * 0.27; s.addImage({ data: I[key], x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, objectName: name + ' icône' });
  };
  const box = (s, x, y, w, h, fill, name, line) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: fill }, line: { color: line ?? fill, width: 1 }, objectName: name });
  const t = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, fontFace: 'Arial', ...o });
  const arrow = (s, x1, y1, x2, y2, color, name) => s.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(Math.abs(x2 - x1), 0.001), h: Math.max(Math.abs(y2 - y1), 0.001),
    flipH: x2 < x1, flipV: y2 < y1, line: { color, width: 2.5, endArrowType: 'triangle' }, objectName: name });
  const content = (title, sub, section) => { const s = pres.addSlide({ masterName: 'Contenu', sectionTitle: section }); s.addText(title, { placeholder: 'title' }); if (sub) s.addText(sub, { placeholder: 'sub' }); return s; };

  // 1. Équipe
  pres.addSection({ title: 'Ouverture' });
  let s = pres.addSlide({ masterName: 'Image', sectionTitle: 'Ouverture' });
  s.addImage({ path: TEAM, x: 0, y: 0, w: 13.333, h: 7.5, altText: 'Équipe Shun and Co : Onguene Abraham, Jun Guck Ngapmou Bryan, Embolla Shane, ENSPY ; partenaires du salon', objectName: 'Équipe' });
  s.addNotes("Bonjour. Nous sommes Shun&Co., trois élèves ingénieurs de l'ENSPY. Entre nous, on parle fulfulde, ewondo, pidgin et haoussa : c'est précisément de cela que nous allons parler.");

  // 2. Titre
  s = pres.addSlide({ masterName: 'Sombre', sectionTitle: 'Ouverture' });
  s.addText('NkapLingua', { placeholder: 'title' });
  s.addText([{ text: 'Le middleware qui parle votre langue,', options: { breakLine: true } }, { text: 'le laboratoire qui la fait vivre.' }], { placeholder: 'body' });
  s.addText(SLOGAN + '   ·   Shun&Co., SAFINUM Innovate Challenge 2026', { placeholder: 'foot' });
  s.addNotes("Nkap veut dire l'argent, Lingua la langue. Notre conviction tient en une phrase : tout le monde devrait pouvoir parler argent, dans sa propre langue. Et nous allons vous montrer qu'en servant les clients dans leur langue, on peut aussi créer des emplois.");

  // 3. Le défi
  pres.addSection({ title: 'Le constat' });
  s = content("Être bancarisé n'est point comprendre sa banque", "L'accès progresse ; la compréhension, elle, reste en souffrance.", 'Le constat');
  const st = [['60,87 %', 'des adultes ont un compte, banque ou mobile money', 'Banque mondiale, Global Findex, 2024', H.accent1], ['30,9 M', 'comptes mobile money au Cameroun', 'BEAC, fin 2024', H.accent1], ['28,8 %', 'ne lisaient ni le français ni l’anglais', '12 ans et plus, recensement 2005', H.accent5]];
  st.forEach(([n, l, src, col], i) => {
    const x = 0.6 + i * 4.1; box(s, x, 2.15, 3.8, 3.3, H.lt1, 'Chiffre ' + (i + 1), 'E3E1D6');
    t(s, n, { x: x + 0.3, y: 2.45, w: 3.2, h: 1.1, fontSize: 52, bold: true, color: col, objectName: 'Valeur ' + (i + 1) });
    t(s, l, { x: x + 0.3, y: 3.65, w: 3.2, h: 0.9, fontSize: 17, color: C.text1, objectName: 'Libellé ' + (i + 1) });
    t(s, src, { x: x + 0.3, y: 4.85, w: 3.2, h: 0.35, fontSize: 11, color: C.accent4, objectName: 'Source ' + (i + 1) });
  });
  box(s, 0.6, 5.8, 12.1, 0.95, H.dk2, 'Bandeau constat');
  t(s, "Des millions de comptes ouverts, et autant de menus en français qui intimident, égarent ou découragent.", { x: 0.9, y: 5.8, w: 11.5, h: 0.95, fontSize: 18, color: C.background1, valign: 'middle', objectName: 'Message constat' });
  s.addNotes("Plus de six adultes sur dix ont un compte. Mais près de trois Camerounais sur dix ne lisaient ni le français ni l'anglais. L'argent mobile est arrivé jusqu'au village ; sa langue, elle, est restée en ville.");

  // 4. Thèse
  pres.addSection({ title: 'La solution' });
  s = content('Notre thèse : un moteur, et une communauté', 'Seul, le middleware traduit. Adossé au laboratoire linguistique, il fédère.', 'La solution');
  const eq = [['brain', 'Le middleware', "Comprend l'usager, interroge la banque, répond dans sa langue.", H.accent1], ['users', 'Le laboratoire linguistique', 'Des locuteurs proposent, vérifient et enregistrent les phrases.', H.accent1], ['hand', 'Inclusion et emplois', 'Des clients enfin compris, des locuteurs enfin rémunérés.', H.dk2]];
  eq.forEach(([k, ti, d, col], i) => {
    const x = 0.6 + i * 4.35; box(s, x, 2.2, 3.75, 3.6, i === 2 ? H.dk2 : H.lt1, 'Terme ' + (i + 1), i === 2 ? H.dk2 : 'E3E1D6');
    circ(s, k, x + 0.35, 2.5, 1.0, i === 2 ? H.accent2 : col, ti);
    t(s, ti, { x: x + 0.35, y: 3.7, w: 3.1, h: 0.8, fontSize: 21, bold: true, color: i === 2 ? C.background1 : C.text1, objectName: ti });
    t(s, d, { x: x + 0.35, y: 4.5, w: 3.1, h: 1.1, fontSize: 15, color: i === 2 ? C.accent3 : C.accent4, objectName: ti + ' détail' });
    if (i < 2) t(s, i === 0 ? '+' : '=', { x: x + 3.75, y: 3.3, w: 0.6, h: 0.8, fontSize: 40, bold: true, color: C.accent2, align: 'center', valign: 'middle', objectName: 'Signe ' + (i + 1) });
  });
  t(s, "La valeur ne naît pas de l'un ou de l'autre, mais de leur alliance.", { x: 0.6, y: 6.1, w: 12.1, h: 0.5, fontSize: 18, italic: true, color: C.accent1, objectName: 'Conclusion thèse' });
  s.addNotes("Un middleware qui traduit, c'est une bonne idée. Mais une traduction figée vieillit, et une langue ne se décrète pas : elle se cultive. C'est pourquoi nous avons adossé notre moteur à un laboratoire linguistique vivant.");

  // 5. Architecture
  s = content("L'architecture, en un coup d'œil", 'Une seule couche entre la passerelle et la banque, nourrie par les locuteurs.', 'La solution');
  const nodes = [['user', 'Usager', 0.6], ['gate', 'Passerelle SAFINUM', 3.6], ['brain', 'Middleware NkapLingua', 6.6], ['bank', 'Banque', 9.9]];
  nodes.forEach(([k, l, x], i) => {
    box(s, x, 2.15, i === 2 ? 2.9 : 2.5, 1.55, i === 2 ? H.dk2 : H.lt1, l, i === 2 ? H.dk2 : 'E3E1D6');
    circ(s, k, x + 0.2, 2.42, 0.95, i === 2 ? H.accent2 : H.accent1, l);
    t(s, l, { x: x + 1.25, y: 2.25, w: (i === 2 ? 2.9 : 2.5) - 1.35, h: 1.35, fontSize: 15, bold: true, color: i === 2 ? C.background1 : C.text1, valign: 'middle', objectName: l + ' libellé' });
  });
  arrow(s, 3.15, 2.92, 3.55, 2.92, H.accent1, 'Flèche 1'); arrow(s, 6.15, 2.92, 6.55, 2.92, H.accent1, 'Flèche 2'); arrow(s, 9.55, 2.92, 9.85, 2.92, H.accent1, 'Flèche 3');
  box(s, 6.6, 4.65, 2.9, 1.5, H.accent1, 'Laboratoire');
  circ(s, 'users', 6.8, 4.92, 0.95, H.accent2, 'Laboratoire');
  t(s, 'Laboratoire linguistique', { x: 7.85, y: 4.75, w: 1.55, h: 1.3, fontSize: 15, bold: true, color: C.background1, valign: 'middle', objectName: 'Laboratoire libellé' });
  arrow(s, 8.05, 4.6, 8.05, 3.75, H.accent2, 'Flèche labo');
  t(s, 'phrases et voix vérifiées, publiées en direct', { x: 8.25, y: 3.95, w: 3.2, h: 0.45, fontSize: 13, italic: true, color: C.accent4, objectName: 'Légende labo' });
  t(s, 'Six canaux servis', { x: 0.6, y: 4.7, w: 5.5, h: 0.4, fontSize: 15, bold: true, color: C.text1, objectName: 'Titre canaux' });
  [['phone', 'Téléphone simple'], ['sms', 'SMS'], ['call', 'Appel vocal'], ['app', 'Application'], ['web', 'Web'], ['atm', 'Guichet']].forEach(([k, l], i) => {
    const x = 0.6 + i * 0.95; circ(s, k, x + 0.1, 5.2, 0.6, H.accent1, l);
    t(s, l, { x, y: 5.85, w: 0.9, h: 0.5, fontSize: 9, color: C.accent4, align: 'center', objectName: l + ' canal' });
  });
  s.addNotes("Sans entrer dans la mécanique : l'usager parle à la passerelle SAFINUM, notre middleware comprend et dialogue avec la banque. Et sous lui, le laboratoire linguistique lui fournit en continu des phrases et des voix vérifiées par des locuteurs.");

  // 6. Parcours
  s = content('Du message à la confirmation', 'Un échange naturel, même sur un téléphone à touches.', 'La solution');
  box(s, 0.9, 2.05, 4.3, 4.75, H.dk2, 'Téléphone'); box(s, 1.1, 2.3, 3.9, 4.25, H.lt1, 'Écran');
  const bub = (tx, y, h, me, n) => { const x = me ? 2.3 : 1.25; box(s, x, y, 2.6, h, me ? H.accent2 : H.accent3, 'Bulle ' + n); t(s, tx, { x: x + 0.12, y: y + 0.05, w: 2.36, h: h - 0.1, fontSize: 12, color: C.text1, valign: 'middle', objectName: 'Texte bulle ' + n }); };
  bub('Envoie 15 000 à Paul', 2.5, 0.5, true, 1);
  bub('Envoi de 15 000 FCFA à Paul Mbarga. Frais 150 FCFA. Total 15 150 FCFA. 1. Confirmer 0. Annuler', 3.15, 1.4, false, 2);
  bub('1', 4.75, 0.45, true, 3);
  bub('15 000 FCFA envoyés. Merci.', 5.4, 0.65, false, 4);
  [['check', "L'usager s'exprime librement", 'Nul besoin de connaître les menus par cœur.'], ['eye', 'Le service relit avant tout débit', 'Montant, frais et total, puis accord explicite.'], ['brain', 'La langue change en chemin', "Sans que l'opération ne soit perdue."]].forEach(([k, ti, d], i) => {
    const y = 2.2 + i * 1.5; circ(s, k, 6.0, y, 0.85, H.accent1, ti);
    t(s, ti, { x: 7.1, y, w: 5.6, h: 0.45, fontSize: 19, bold: true, color: C.text1, objectName: ti });
    t(s, d, { x: 7.1, y: y + 0.5, w: 5.6, h: 0.5, fontSize: 15, color: C.accent4, objectName: ti + ' détail' });
  });
  s.addNotes("Concrètement : on écrit comme on parle. Le service relit le montant et les frais, et rien ne part sans l'accord explicite du client.");

  // 7. Middleware seul
  pres.addSection({ title: 'La plus-value' });
  s = content('Le middleware seul : une bonne idée, à l’horizon limité', "Un moteur sans communauté finit par parler une langue qui n'est plus la sienne.", 'La plus-value');
  box(s, 0.6, 2.1, 5.9, 3.45, H.lt1, 'Apports', 'E3E1D6'); box(s, 6.8, 2.1, 5.9, 3.45, H.lt1, 'Limites', 'E3E1D6');
  circ(s, 'check', 0.9, 2.35, 0.7, H.accent1, 'Apports'); t(s, 'Ce qu’il apporte', { x: 1.75, y: 2.4, w: 4.5, h: 0.6, fontSize: 20, bold: true, color: C.accent1, valign: 'middle', objectName: 'Titre apports' });
  circ(s, 'x', 7.1, 2.35, 0.7, H.accent5, 'Limites'); t(s, 'Ce qui lui manque, seul', { x: 7.95, y: 2.4, w: 4.5, h: 0.6, fontSize: 20, bold: true, color: C.accent5, valign: 'middle', objectName: 'Titre limites' });
  const bl = (arr) => arr.map((x, i) => ({ text: x, options: { bullet: true, breakLine: i < arr.length - 1 } }));
  t(s, bl(['Six canaux servis par une seule couche', 'Des opérations sûres, toujours confirmées', 'Une réponse en moins de trois secondes']), { x: 0.95, y: 3.25, w: 5.3, h: 2.1, fontSize: 18, color: C.text1, paraSpaceAfter: 12, valign: 'top', objectName: 'Liste apports' });
  t(s, bl(['Des traductions figées, qui vieillissent', 'Aucune garantie d’authenticité', 'Des langues encore absentes du numérique', 'Aucun ancrage dans les communautés']), { x: 7.15, y: 3.25, w: 5.3, h: 2.1, fontSize: 18, color: C.text1, paraSpaceAfter: 12, valign: 'top', objectName: 'Liste limites' });
  box(s, 0.6, 5.85, 12.1, 0.9, H.dk2, 'Bandeau middleware');
  t(s, 'Le middleware est la condition nécessaire ; le laboratoire en est la condition suffisante.', { x: 0.9, y: 5.85, w: 11.5, h: 0.9, fontSize: 19, bold: true, color: C.accent2, valign: 'middle', objectName: 'Message middleware' });
  s.addNotes("Le middleware seul fonctionne. Mais qui garantit que la phrase en ewondo est juste ? Qui écrira demain les langues qui n'ont jamais eu d'écran ? Sans communauté, un moteur finit par parler une langue qui n'est plus la sienne.");

  // 8. Laboratoire
  s = content('La plus-value : le laboratoire linguistique', 'Une langue ne se décrète pas : elle se cultive, phrase après phrase.', 'La plus-value');
  const cyc = [['pen', 'Proposer', "Un locuteur écrit la phrase ou la dit au micro."], ['eye', 'Vérifier', 'Un second locuteur la relit. Nul ne valide la sienne.'], ['bolt', 'Publier', 'Elle est servie aux clients sur-le-champ.'], ['coins', 'Rémunérer', 'Chaque contribution validée est payée en mobile money.']];
  cyc.forEach(([k, ti, d], i) => {
    const x = 0.6 + i * 3.1; box(s, x, 2.15, 2.8, 3.25, i === 3 ? H.dk2 : H.lt1, 'Étape ' + (i + 1), i === 3 ? H.dk2 : 'E3E1D6');
    circ(s, k, x + 0.3, 2.45, 0.95, i === 3 ? H.accent2 : H.accent1, ti);
    t(s, `${i + 1}. ${ti}`, { x: x + 0.3, y: 3.6, w: 2.3, h: 0.5, fontSize: 20, bold: true, color: i === 3 ? C.background1 : C.text1, objectName: ti });
    t(s, d, { x: x + 0.3, y: 4.15, w: 2.3, h: 1.1, fontSize: 14, color: i === 3 ? C.accent3 : C.accent4, objectName: ti + ' détail' });
    if (i < 3) t(s, '→', { x: x + 2.8, y: 3.3, w: 0.3, h: 0.6, fontSize: 24, bold: true, color: C.accent2, align: 'center', objectName: 'Flèche étape ' + (i + 1) });
  });
  box(s, 0.6, 5.75, 12.1, 0.95, H.accent3, 'Bandeau labo');
  t(s, 'Résultat : des langues authentiques, vivantes, et la garantie de deux regards sur chaque phrase servie.', { x: 0.9, y: 5.75, w: 11.5, h: 0.95, fontSize: 17, bold: true, color: C.text1, valign: 'middle', objectName: 'Message labo' });
  s.addNotes("Voici le cœur de notre proposition. Un locuteur propose, un autre vérifie, la phrase est publiée à l'instant, et chacun est rémunéré. Deux regards sur chaque phrase : c'est notre gage d'authenticité.");

  // 9. Emplois
  s = content('Le locuteur, un métier qui naît', "Chaque phrase validée est un revenu ; chaque voix enregistrée, un patrimoine.", 'La plus-value');
  const pay = [['25 FCFA', 'par traduction validée'], ['15 FCFA', 'par relecture'], ['50 FCFA', 'par voix enregistrée']];
  pay.forEach(([n, l], i) => {
    const y = 2.15 + i * 1.25; box(s, 0.6, y, 4.3, 1.05, H.lt1, 'Tarif ' + (i + 1), 'E3E1D6');
    t(s, n, { x: 0.85, y, w: 1.9, h: 1.05, fontSize: 26, bold: true, color: C.accent1, valign: 'middle', objectName: 'Tarif valeur ' + (i + 1) });
    t(s, l, { x: 2.75, y, w: 2.05, h: 1.05, fontSize: 15, color: C.text1, valign: 'middle', objectName: 'Tarif libellé ' + (i + 1) });
  });
  box(s, 5.2, 2.15, 3.6, 3.55, H.dk2, 'Projection emplois');
  t(s, '≈ 40', { x: 5.5, y: 2.4, w: 3.0, h: 1.0, fontSize: 54, bold: true, color: C.accent2, objectName: 'Emplois valeur' });
  t(s, 'revenus complémentaires de 50 000 FCFA par mois, en année 3', { x: 5.5, y: 3.45, w: 3.0, h: 1.2, fontSize: 16, color: C.background1, objectName: 'Emplois libellé' });
  t(s, 'Si 20 % du revenu de Shun&Co. leur est reversé (proposition).', { x: 5.5, y: 4.75, w: 3.0, h: 0.8, fontSize: 12, italic: true, color: C.accent3, objectName: 'Emplois hypothèse' });
  t(s, 'Qui sont-ils ?', { x: 9.1, y: 2.15, w: 3.6, h: 0.45, fontSize: 17, bold: true, color: C.text1, objectName: 'Profils titre' });
  [['grad', 'Étudiants'], ['book', 'Enseignants'], ['mic', 'Conteurs, animateurs radio'], ['seed', 'Retraités, gardiens de la langue']].forEach(([k, l], i) => {
    const y = 2.75 + i * 0.75; circ(s, k, 9.1, y, 0.55, H.accent1, l);
    t(s, l, { x: 9.8, y, w: 2.9, h: 0.55, fontSize: 14, color: C.text1, valign: 'middle', objectName: 'Profil ' + (i + 1) });
  });
  t(s, 'Une langue complète (144 phrases, dont 45 enregistrées) coûte 8 685 FCFA en rémunérations ; dix langues dès la phase pilote, 20 locuteurs chacune.', { x: 0.6, y: 6.0, w: 12.1, h: 0.6, fontSize: 13, italic: true, color: C.accent4, objectName: 'Note emplois' });
  s.addNotes("Le locuteur devient un métier. Étudiants, enseignants, conteurs, retraités : chacun peut gagner de l'argent en apprenant à la banque à parler sa langue. Si nous reversons 20 % de nos revenus, cela représente une quarantaine de revenus complémentaires de 50 000 FCFA par mois dès la troisième année. Ce sont des hypothèses, que nous validerons avec un premier partenaire.");

  // 10. Cercle vertueux
  s = content('Le cercle vertueux', 'Plus les langues vivent, plus les clients affluent ; plus ils affluent, plus les locuteurs gagnent.', 'La plus-value');
  const cx = 6.67, cy = 4.65, RX = 3.2, RY = 1.8, D = 0.75;
  const fly = [['users', 'Des locuteurs rémunérés'], ['brain', 'Des langues vérifiées'], ['user', 'Des clients enfin compris'], ['chart', 'Plus de transactions'], ['bank', 'Des revenus pour la banque'], ['hand', 'Une licence pour Shun&Co.']];
  const pts = fly.map((_, i) => { const a = -Math.PI / 2 + i * (Math.PI / 3); return [cx + RX * Math.cos(a), cy + RY * Math.sin(a)]; });
  pts.forEach(([x, y], i) => { const [nx, ny] = pts[(i + 1) % pts.length]; const dx = nx - x, dy = ny - y, L = Math.hypot(dx, dy), k = 0.6; arrow(s, x + dx / L * k, y + dy / L * k, nx - dx / L * k, ny - dy / L * k, H.accent6, 'Flèche cercle ' + (i + 1)); });
  s.addShape(pres.shapes.OVAL, { x: cx - 1.2, y: cy - 0.65, w: 2.4, h: 1.3, fill: { color: H.dk2 }, line: { color: H.dk2 }, objectName: 'Centre' });
  t(s, 'Inclusion et emplois', { x: cx - 1.1, y: cy - 0.55, w: 2.2, h: 1.1, fontSize: 16, bold: true, color: C.accent2, align: 'center', valign: 'middle', objectName: 'Centre texte' });
  pts.forEach(([x, y], i) => {
    circ(s, fly[i][0], x - D / 2, y - D / 2, D, i % 2 === 0 ? H.accent1 : H.dk2, fly[i][1]);
    const lab = { fontSize: 14, bold: true, color: C.text1, objectName: 'Cercle ' + (i + 1) };
    if (i === 0) t(s, fly[i][1], { ...lab, x: x - 1.6, y: y - D / 2 - 0.42, w: 3.2, h: 0.38, align: 'center' });
    else if (i === 3) t(s, fly[i][1], { ...lab, x: x - 1.6, y: y + D / 2 + 0.05, w: 3.2, h: 0.38, align: 'center' });
    else if (i < 3) t(s, fly[i][1], { ...lab, x: x + D / 2 + 0.15, y: y - 0.3, w: 2.5, h: 0.6, valign: 'middle' });
    else t(s, fly[i][1], { ...lab, x: x - D / 2 - 2.65, y: y - 0.3, w: 2.5, h: 0.6, align: 'right', valign: 'middle' });
  });
  s.addNotes("Voici la mécanique qui nous distingue : des locuteurs rémunérés font des langues vérifiées ; des clients enfin compris font plus de transactions ; la banque y gagne, nous percevons notre licence, et une part revient aux locuteurs. La boucle se referme, et elle s'accélère.");

  // 11. Docker
  pres.addSection({ title: 'Le produit' });
  s = content('Un produit, une seule commande', 'Toute la plateforme est livrée en conteneurs : ce qui fonctionne ici fonctionne partout.', 'Le produit');
  const stack = ['Moteur de conversation', 'Laboratoire linguistique', 'Service vocal', 'Mémoire des langues', 'Diffusion en direct'];
  box(s, 0.6, 2.1, 4.6, 4.5, H.dk2, 'Plateforme');
  t(s, 'NkapLingua, en conteneurs', { x: 0.85, y: 2.25, w: 4.1, h: 0.45, fontSize: 15, bold: true, color: C.accent2, objectName: 'Plateforme titre' });
  stack.forEach((l, i) => { box(s, 0.9, 2.85 + i * 0.7, 4.0, 0.55, i % 2 === 0 ? H.accent1 : '1F5A4E', 'Conteneur ' + (i + 1)); s.addImage({ data: I.box, x: 1.05, y: 2.95 + i * 0.7, w: 0.35, h: 0.35, objectName: 'Icône conteneur ' + (i + 1) }); t(s, l, { x: 1.55, y: 2.85 + i * 0.7, w: 3.2, h: 0.55, fontSize: 14, color: C.background1, valign: 'middle', objectName: 'Conteneur libellé ' + (i + 1) }); });
  const dk = [['copy', 'Reproductible', "Identique sur un portable, un cloud ou le centre de données d'une banque."], ['clock', 'Déployé en minutes', 'Une commande installe la plateforme complète.'], ['house', 'Souverain', 'Installable chez la banque : les données restent sur place.'], ['heart', 'Résilient', 'Chaque service est surveillé et redémarre seul.']];
  dk.forEach(([k, ti, d], i) => {
    const x = 5.55 + (i % 2) * 3.6, y = 2.1 + Math.floor(i / 2) * 2.3;
    box(s, x, y, 3.4, 2.1, H.lt1, ti, 'E3E1D6'); circ(s, k, x + 0.25, y + 0.25, 0.7, H.accent1, ti);
    t(s, ti, { x: x + 1.1, y: y + 0.25, w: 2.2, h: 0.7, fontSize: 17, bold: true, color: C.text1, valign: 'middle', objectName: ti });
    t(s, d, { x: x + 0.25, y: y + 1.05, w: 2.95, h: 0.95, fontSize: 13, color: C.accent4, objectName: ti + ' détail' });
  });
  s.addNotes("Pour une banque, la question n'est pas seulement : est-ce que ça marche ? mais : est-ce que ça marchera chez moi ? Toute notre plateforme est livrée en conteneurs. Ce qui fonctionne sur notre portable fonctionne à l'identique dans le centre de données d'une banque, installé en une commande, et les données restent chez elle.");

  // 12. Confiance
  s = content("La confiance, condition de l'adoption", 'Quatre garanties, sans lesquelles aucune banque ne nous ouvrirait sa porte.', 'Le produit');
  [['check', 'Accord explicite', "Rien n'est débité sans la confirmation du client."], ['eye', 'Jamais de devinette', 'Un doute ? Le service demande, il ne suppose pas.'], ['lock', 'Accès bancaire protégé', 'Nul ne peut détourner le service vers une fausse banque.'], ['users', 'Double relecture', "Aucune phrase n'atteint un client sans un second regard."]].forEach(([k, ti, d], i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 2.1 + Math.floor(i / 2) * 2.25;
    box(s, x, y, 5.95, 2.0, H.lt1, ti, 'E3E1D6'); circ(s, k, x + 0.35, y + 0.5, 0.95, i % 2 === 0 ? H.accent1 : H.dk2, ti);
    t(s, ti, { x: x + 1.55, y: y + 0.35, w: 4.2, h: 0.6, fontSize: 20, bold: true, color: C.text1, valign: 'middle', objectName: ti });
    t(s, d, { x: x + 1.55, y: y + 0.95, w: 4.2, h: 0.8, fontSize: 15, color: C.accent4, objectName: ti + ' détail' });
  });
  s.addNotes("La confiance ne se négocie pas : accord explicite, jamais de devinette, accès bancaire protégé, et double relecture de chaque phrase.");

  // 13. Business model
  pres.addSection({ title: 'Le modèle économique' });
  s = content('Nous apportons des clients ; la banque partage la valeur', 'Un partenariat gagnant-gagnant, dont les locuteurs sont pleinement parties prenantes.', 'Le modèle économique');
  const actors = [['users', 'Locuteurs', 0.6, H.accent1], ['hand', 'Shun&Co.', 5.37, H.dk2], ['bank', 'Banque, EMF, opérateur', 10.13, H.accent1]];
  actors.forEach(([ic, l, x, fill]) => { box(s, x, 2.15, 2.6, 1.7, fill, l); circ(s, ic, x + 0.2, 2.6, 0.8, H.accent2, l); t(s, l, { x: x + 1.1, y: 2.15, w: 1.4, h: 1.7, fontSize: 16, bold: true, color: C.background1, valign: 'middle', objectName: l + ' libellé' }); });
  const gaps = [[3.25, 5.32], [8.02, 10.08]];
  const fwd = ['des langues vérifiées', 'des clients compris, de nouvelles transactions'];
  const back = ['rémunération des contributions et 20 % du revenu (proposition)', 'abonnement et 2 FCFA par conversation'];
  gaps.forEach(([x1, x2], i) => {
    arrow(s, x1, 2.75, x2, 2.75, H.accent1, 'Flux aller ' + (i + 1));
    t(s, fwd[i], { x: x1 - 0.05, y: 1.95, w: x2 - x1 + 0.1, h: 0.72, fontSize: 12, italic: true, color: C.accent1, align: 'center', valign: 'bottom', objectName: 'Libellé aller ' + (i + 1) });
    arrow(s, x2, 3.3, x1, 3.3, 'D9A520', 'Flux retour ' + (i + 1));
    t(s, back[i], { x: x1 - 0.05, y: 3.4, w: x2 - x1 + 0.1, h: 0.75, fontSize: 12, bold: true, color: C.text1, align: 'center', valign: 'top', objectName: 'Libellé retour ' + (i + 1) });
  });
  [['500 000 FCFA', 'par mois et par établissement partenaire', H.accent1], ['2 FCFA', 'par conversation en langue locale ; le français reste gratuit', H.accent1], ['20 %', 'du revenu reversés aux locuteurs, en plus des contributions (proposition)', H.accent5]].forEach(([n, l, col], i) => {
    const x = 0.6 + i * 4.1; box(s, x, 4.55, 3.8, 2.0, H.lt1, 'Offre ' + (i + 1), 'E3E1D6');
    t(s, n, { x: x + 0.3, y: 4.75, w: 3.2, h: 0.75, fontSize: 32, bold: true, color: col, objectName: 'Offre valeur ' + (i + 1) });
    t(s, l, { x: x + 0.3, y: 5.5, w: 3.2, h: 0.9, fontSize: 15, color: C.accent4, objectName: 'Offre libellé ' + (i + 1) });
  });
  s.addNotes("Notre modèle est limpide : nous apportons à la banque des clients qu'elle ne savait pas servir, et elle partage avec nous une part de la valeur créée : un abonnement et deux francs par conversation en langue locale. Et nous proposons qu'une part revienne aux locuteurs, qui rendent tout cela possible.");

  // 14. Gains banque
  s = content('Ce que gagne une banque partenaire', 'Projection pour un établissement de 500 000 clients mobiles.', 'Le modèle économique');
  s.addChart(pres.charts.BAR, [{ name: 'Revenu net', labels: ['Année 1', 'Année 2', 'Année 3'], values: [95.6, 197.2, 298.8] }], {
    x: 0.6, y: 2.0, w: 7.6, h: 4.4, barDir: 'col', chartColors: [H.accent1], showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '0.0" M FCFA"',
    dataLabelFontSize: 14, dataLabelFontBold: true, dataLabelColor: H.dk1, dataLabelFontFace: '+mn-lt', catAxisLabelColor: H.accent4, catAxisLabelFontSize: 14, catAxisLabelFontFace: '+mn-lt',
    valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, objectName: 'Graphique banque' });
  [['851', 'clients actifs suffisent', "pour rembourser l'abonnement annuel"], ['× 25', 'la mise récupérée', 'en troisième année']].forEach(([n, l, d], i) => {
    const y = 2.1 + i * 2.15; box(s, 8.6, y, 4.1, 1.95, H.lt1, 'Repère ' + (i + 1), 'E3E1D6');
    t(s, n, { x: 8.9, y: y + 0.2, w: 3.6, h: 0.8, fontSize: 36, bold: true, color: C.accent1, objectName: 'Repère valeur ' + (i + 1) });
    t(s, l, { x: 8.9, y: y + 0.98, w: 3.6, h: 0.4, fontSize: 16, bold: true, color: C.text1, objectName: 'Repère libellé ' + (i + 1) });
    t(s, d, { x: 8.9, y: y + 1.38, w: 3.6, h: 0.4, fontSize: 13, color: C.accent4, objectName: 'Repère détail ' + (i + 1) });
  });
  t(s, 'Revenu net supplémentaire. 10 %, 20 % puis 30 % des clients freinés par la langue deviennent actifs. Hypothèses à valider avec un établissement pilote.', { x: 0.6, y: 6.5, w: 12.1, h: 0.4, fontSize: 11, italic: true, color: C.accent4, objectName: 'Hypothèses banque' });
  s.addNotes("Pour une banque de 500 000 clients mobiles, notre projection atteint près de 300 millions de francs de revenu net supplémentaire en troisième année. L'abonnement est remboursé dès 851 clients actifs.");

  // 15. Trajectoire
  s = content('Une croissance partagée', 'Le revenu de Shun&Co. grandit avec ses partenaires, et la part des locuteurs avec lui.', 'Le modèle économique');
  s.addChart(pres.charts.BAR, [
    { name: 'Revenu de Shun&Co.', labels: ['Année 1 · 2 banques', 'Année 2 · 5 banques', 'Année 3 · 10 banques'], values: [16.1, 50.7, 122.2] },
    { name: 'Part des locuteurs (20 %)', labels: ['Année 1 · 2 banques', 'Année 2 · 5 banques', 'Année 3 · 10 banques'], values: [3.2, 10.1, 24.4] },
  ], { x: 0.6, y: 2.0, w: 8.2, h: 4.5, barDir: 'col', barGrouping: 'clustered', chartColors: [H.dk2, H.accent2], showValue: true, dataLabelPosition: 'outEnd', dataLabelFormatCode: '0.0" M"',
    dataLabelFontSize: 13, dataLabelFontBold: true, dataLabelColor: H.dk1, dataLabelFontFace: '+mn-lt', catAxisLabelColor: H.accent4, catAxisLabelFontSize: 13, catAxisLabelFontFace: '+mn-lt',
    valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: true, legendPos: 'b', legendFontSize: 13, legendFontFace: '+mn-lt', legendColor: H.dk1, objectName: 'Graphique trajectoire' });
  box(s, 9.2, 2.1, 3.5, 4.3, H.dk2, 'Encadré trajectoire');
  t(s, [{ text: '122,2 M FCFA', options: { bold: true, fontSize: 26, color: H.accent2, breakLine: true } }, { text: 'de revenu en année 3', options: { fontSize: 15, color: H.lt1, breakLine: true } }, { text: ' ', options: { fontSize: 10, breakLine: true } }, { text: '24,4 M FCFA', options: { bold: true, fontSize: 26, color: H.accent2, breakLine: true } }, { text: 'reversés aux locuteurs (proposition)', options: { fontSize: 15, color: H.lt1 } }], { x: 9.45, y: 2.3, w: 3.0, h: 3.9, valign: 'middle', objectName: 'Encadré texte' });
  t(s, 'En millions de FCFA. Projections fondées sur des hypothèses à valider.', { x: 0.6, y: 6.55, w: 8, h: 0.35, fontSize: 11, italic: true, color: C.accent4, objectName: 'Note trajectoire' });
  s.addNotes("Notre revenu progresse avec nos partenaires : de 16 à 122 millions de francs en trois ans. Et à chaque palier, la part des locuteurs croît avec lui.");

  // 16. Feuille de route
  s = content('Feuille de route', 'Du démonstrateur au premier partenaire.', 'Le modèle économique');
  s.addShape(pres.shapes.LINE, { x: 1.05, y: 2.65, w: 11.2, h: 0, line: { color: H.accent6, width: 3 }, objectName: 'Ligne du temps' });
  [['flag', "Aujourd'hui", 'Plateforme prête sur les six canaux, déployable en une commande.'], ['users', 'Mois 1', 'Langue pilote : 20 locuteurs recrutés, formés et rémunérés.'], ['bank', 'Mois 3', 'Premier établissement partenaire ; le service comprend la voix.'], ['mic', 'Mois 6', 'Notre propre voix de synthèse, née des enregistrements des locuteurs.']].forEach(([k, ti, d], i) => {
    const x = 0.6 + i * 3.05; circ(s, k, x, 2.2, 0.9, i === 0 ? H.accent2 : H.accent1, ti);
    t(s, ti, { x, y: 3.3, w: 2.8, h: 0.5, fontSize: 21, bold: true, color: C.text1, objectName: ti });
    t(s, d, { x, y: 3.85, w: 2.75, h: 1.5, fontSize: 15, color: C.accent4, objectName: ti + ' détail' });
  });
  box(s, 0.6, 5.65, 12.1, 0.95, H.dk2, 'Appel');
  t(s, 'Nous recherchons un établissement pilote et nos vingt premiers locuteurs.', { x: 0.9, y: 5.65, w: 11.5, h: 0.95, fontSize: 19, bold: true, color: C.accent2, valign: 'middle', objectName: 'Appel texte' });
  s.addNotes("Notre demande est simple : un établissement pilote, et nos vingt premiers locuteurs.");

  // 17. Démonstration
  pres.addSection({ title: 'Clôture' });
  s = pres.addSlide({ masterName: 'Sombre', sectionTitle: 'Clôture' });
  s.addText('Démonstration', { placeholder: 'title' });
  s.addText([{ text: '1. Un dialogue USSD en langue nationale', options: { breakLine: true } }, { text: '2. Un locuteur propose, un second valide', options: { breakLine: true } }, { text: '3. La phrase est servie au client, en direct' }], { placeholder: 'body' });
  s.addText('Trois minutes pour voir la langue passer du locuteur au client.', { placeholder: 'foot' });
  s.addNotes("Place à la démonstration : un dialogue en langue nationale, puis une phrase proposée, validée et servie en direct.");

  // 18. Clôture
  s = pres.addSlide({ masterName: 'Sombre', sectionTitle: 'Clôture' });
  s.addText('Merci', { placeholder: 'title' });
  s.addText(SLOGAN, { placeholder: 'body' });
  s.addText('Shun&Co.  ·  Onguene Abraham, Jun Guck Ngapmou Bryan, Embolla Shane  ·  ENSPY', { placeholder: 'foot' });
  s.addNotes("L'inclusion financière ne se décrète pas : elle se traduit. Avec NkapLingua, chaque client est compris, et chaque locuteur devient acteur de l'économie. Tout le monde devrait pouvoir parler argent, dans sa propre langue. Merci.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('écrit', OUT);
})();
