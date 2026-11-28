const path = require('path');
const pptxgen = require('pptxgenjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const fa = require('react-icons/fa6');
const { applyTheme } = require('/root/.claude/skills/synced/0c18747b-9a86-48c0-ab2b-5a5882dabe71_9326434d-928d-4cf3-a4f5-c010074862a1/pptx/scripts/apply_theme.js');

const OUT = '/home/user/nkaplingua/docs/presentation/NkapLingua-ShunCo.pptx';
const SLOGAN = '« Tout le monde devrait pouvoir parler argent, dans sa propre langue. »';

const THEME = {
  name: 'NkapLingua',
  headFontFace: 'Cambria',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '13251D', lt1: 'FFFFFF', dk2: '0B3D2E', lt2: 'EEF6F1',
    accent1: '0E7C57', accent2: 'E8A800', accent3: 'C8553D', accent4: '2F6E9E', accent5: '7FB59A', accent6: '5B6B63',
    hlink: '0E7C57', folHlink: '0B3D2E',
  },
};
const HEX = THEME.colors;

async function icon(name, color) {
  const svg = renderToStaticMarkup(React.createElement(fa[name], { color: '#' + color, size: 256 }));
  const png = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
  return 'image/png;base64,' + png.toString('base64');
}

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5
  pres.title = 'NkapLingua';
  pres.author = 'Shun&Co.';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  pres.defineSlideMaster({
    title: 'Titre sombre',
    background: { color: HEX.dk2 },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.8, y: 2.0, w: 11.7, h: 1.4, fontSize: 60, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.8, y: 3.6, w: 11.0, h: 1.3, fontSize: 26, italic: true, color: C.accent2, valign: 'top', align: 'left', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'team', type: 'body', x: 0.8, y: 6.0, w: 11.0, h: 0.6, fontSize: 16, color: C.background2, align: 'left', margin: 0 }, text: '' } },
    ],
  });
  pres.defineSlideMaster({
    title: 'Contenu',
    background: { color: HEX.lt1 },
    margin: [0.5, 0.6, 0.7, 0.6],
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.35, w: 12.1, h: 0.95, fontSize: 36, bold: true, color: C.text2, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
      { text: { text: 'NkapLingua · Shun&Co.', options: { x: 0.6, y: 7.0, w: 6, h: 0.3, fontSize: 10, color: C.accent6, margin: 0 } } },
    ],
    slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: C.accent6, align: 'right' },
  });

  const I = {};
  for (const [k, n, c] of [
    ['phone', 'FaMobileRetro', 'FFFFFF'], ['sms', 'FaCommentSms', 'FFFFFF'], ['call', 'FaPhoneVolume', 'FFFFFF'],
    ['app', 'FaMobileScreenButton', 'FFFFFF'], ['web', 'FaGlobe', 'FFFFFF'], ['atm', 'FaMoneyBillWave', 'FFFFFF'],
    ['pen', 'FaPenToSquare', 'FFFFFF'], ['eye', 'FaUserCheck', 'FFFFFF'], ['bolt', 'FaBolt', 'FFFFFF'],
    ['check', 'FaCircleCheck', 'FFFFFF'], ['shield', 'FaShieldHalved', 'FFFFFF'], ['lock', 'FaLock', 'FFFFFF'], ['users', 'FaUserGroup', 'FFFFFF'],
    ['bank', 'FaBuildingColumns', 'FFFFFF'], ['coins', 'FaCoins', 'FFFFFF'], ['lang', 'FaLanguage', 'FFFFFF'],
    ['seed', 'FaSeedling', 'FFFFFF'], ['rocket', 'FaRocket', 'FFFFFF'], ['flag', 'FaFlagCheckered', 'FFFFFF'], ['mic', 'FaMicrophone', 'FFFFFF'],
  ]) I[k] = await icon(n, c);

  const circleIcon = (slide, key, x, y, d, fill, name) => {
    slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill }, objectName: name + ' cercle' });
    const p = d * 0.26;
    slide.addImage({ data: I[key], x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, objectName: name + ' icône' });
  };
  const card = (slide, x, y, w, h, fill, name) =>
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: fill }, objectName: name });
  const txt = (slide, text, o) => slide.addText(text, { isTextBox: true, margin: 0, ...o });

  // 1. Couverture
  pres.addSection({ title: 'Ouverture' });
  let s = pres.addSlide({ masterName: 'Titre sombre', sectionTitle: 'Ouverture' });
  s.addText('NkapLingua', { placeholder: 'title' });
  s.addText(SLOGAN, { placeholder: 'body' });
  s.addText('Shun&Co. · SAFINUM Innovate Challenge 2026 · Yaoundé', { placeholder: 'team' });
  s.addNotes("NkapLingua, c'est le service financier qui parle la langue de chacun. Nkap veut dire argent, Lingua veut dire langue.");

  // 2. Le problème
  pres.addSection({ title: 'Le produit' });
  s = pres.addSlide({ masterName: 'Contenu', sectionTitle: 'Le produit' });
  s.addText("L'argent mobile progresse, mais il parle français", { placeholder: 'title' });
  const stats = [
    ['30,9 M', 'comptes mobile money au Cameroun', 'fin 2024 (BEAC)', C.accent1],
    ['2,73 Md', "opérations par an", 'en 2024 (BEAC)', C.accent1],
    ['28,8 %', 'ne lisent ni le français ni l’anglais', '12 ans et plus, recensement 2005', C.accent3],
  ];
  stats.forEach(([n, l, src, col], i) => {
    const x = 0.6 + i * 4.1;
    card(s, x, 1.7, 3.8, 3.4, HEX.lt2, 'Chiffre ' + (i + 1));
    txt(s, n, { x: x + 0.3, y: 2.0, w: 3.2, h: 1.2, fontSize: 54, bold: true, color: col, fontFace: THEME.headFontFace, objectName: 'Valeur ' + (i + 1) });
    txt(s, l, { x: x + 0.3, y: 3.3, w: 3.2, h: 0.9, fontSize: 18, color: C.text1, objectName: 'Libellé ' + (i + 1) });
    txt(s, src, { x: x + 0.3, y: 4.45, w: 3.2, h: 0.4, fontSize: 12, color: C.accent6, objectName: 'Source ' + (i + 1) });
  });
  txt(s, "Des millions de personnes ont un compte, mais un menu en français les laisse au bord du chemin : elles hésitent, se trompent ou renoncent.", { x: 0.6, y: 5.5, w: 12.1, h: 0.9, fontSize: 18, color: C.text2, objectName: 'Message' });
  s.addNotes("Le marché est là : 30,9 millions de comptes. Mais près de 3 personnes sur 10 ne lisent ni le français ni l'anglais (dernier recensement disponible, 2005).");

  // 3. La solution
  s = pres.addSlide({ masterName: 'Contenu', sectionTitle: 'Le produit' });
  s.addText('NkapLingua fait parler la banque dans votre langue', { placeholder: 'title' });
  txt(s, 'Sur tous les supports, avec le même service', { x: 0.6, y: 1.45, w: 7.4, h: 0.5, fontSize: 18, bold: true, color: C.accent1, objectName: 'Sous-titre supports' });
  const ch = [['phone', 'Téléphone simple', 'menu *123#'], ['sms', 'SMS', 'une question, une réponse'], ['call', 'Appel vocal', 'on écoute, on répond'],
    ['app', 'Application', 'écrans traduits'], ['web', 'Site web', 'écrans traduits'], ['atm', 'Guichet automatique', 'écrans traduits']];
  ch.forEach(([k, t, d], i) => {
    const x = 0.6 + (i % 3) * 2.5, y = 2.15 + Math.floor(i / 3) * 2.15;
    circleIcon(s, k, x, y, 0.9, HEX.accent1, t);
    txt(s, t, { x, y: y + 1.0, w: 2.35, h: 0.4, fontSize: 16, bold: true, color: C.text1, objectName: t });
    txt(s, d, { x, y: y + 1.38, w: 2.35, h: 0.4, fontSize: 13, color: C.accent6, objectName: t + ' détail' });
  });
  card(s, 8.3, 1.45, 4.4, 5.2, HEX.dk2, 'Carte langues');
  circleIcon(s, 'lang', 8.65, 1.8, 0.8, HEX.accent2, 'Langues');
  txt(s, '12 langues', { x: 8.65, y: 2.75, w: 3.8, h: 0.6, fontSize: 28, bold: true, color: C.background1, fontFace: THEME.headFontFace, objectName: 'Titre langues' });
  txt(s, 'Duala, ewondo, basaa, ghomala, medumba, fulfulde, haoussa, bulu, pidgin, yemba, français, anglais', { x: 8.65, y: 3.4, w: 3.75, h: 1.5, fontSize: 16, color: C.background2, objectName: 'Liste langues' });
  txt(s, "Une langue est proposée aux clients seulement quand toutes ses phrases ont été vérifiées.", { x: 8.65, y: 5.0, w: 3.75, h: 1.3, fontSize: 14, italic: true, color: C.accent2, objectName: 'Règle langues' });
  s.addNotes("Un seul service, six supports. Même un téléphone à touches sans internet fonctionne.");

  // 4. Une conversation
  s = pres.addSlide({ masterName: 'Contenu', sectionTitle: 'Le produit' });
  s.addText('On parle comme à un proche, la banque comprend', { placeholder: 'title' });
  card(s, 0.9, 1.45, 4.6, 5.35, HEX.text1 === undefined ? HEX.dk1 : HEX.dk1, 'Téléphone');
  card(s, 1.1, 1.75, 4.2, 4.75, HEX.lt2, 'Écran');
  const bubble = (t, y, h, me, n) => {
    const x = me ? 2.35 : 1.3, w = 2.8;
    card(s, x, y, w, h, me ? HEX.accent2 : HEX.lt1, 'Bulle ' + n);
    txt(s, t, { x: x + 0.15, y: y + 0.08, w: w - 0.3, h: h - 0.16, fontSize: 13, color: C.text1, valign: 'middle', objectName: 'Texte bulle ' + n });
  };
  bubble('Envoie 5000 à Paul', 1.95, 0.5, true, 1);
  bubble('Envoi de 5 000 FCFA à Paul Mbarga. Frais 50 FCFA. Total 5 050 FCFA. 1. Confirmer  0. Annuler', 2.6, 1.35, false, 2);
  bubble('1', 4.1, 0.5, true, 3);
  bubble('5 000 FCFA envoyés à Paul Mbarga. Merci.', 4.75, 0.85, false, 4);
  const pts = [
    ['check', 'Il comprend une phrase libre', "Pas besoin de connaître les menus par cœur."],
    ['eye', 'Il relit avant de débiter', "Montant, frais et total s'affichent, puis le client confirme."],
    ['lang', 'Il change de langue en route', "Sans perdre l'opération en cours."],
  ];
  pts.forEach(([k, t, d], i) => {
    const y = 1.7 + i * 1.65;
    circleIcon(s, k, 6.3, y, 0.85, HEX.accent1, t);
    txt(s, t, { x: 7.4, y, w: 5.3, h: 0.45, fontSize: 20, bold: true, color: C.text2, objectName: t });
    txt(s, d, { x: 7.4, y: y + 0.5, w: 5.3, h: 0.7, fontSize: 16, color: C.text1, objectName: t + ' détail' });
  });
  s.addNotes("Exemple réel : le client écrit librement, le service relit le montant et les frais, et rien ne part sans le « 1 » du client.");

  // 5. Les locuteurs
  s = pres.addSlide({ masterName: 'Contenu', sectionTitle: 'Le produit' });
  s.addText('Les locuteurs construisent les langues, et sont payés', { placeholder: 'title' });
  const steps = [
    ['pen', '1. Un locuteur propose', "Il écrit la phrase, ou la dit au micro, depuis un simple site web."],
    ['eye', '2. Un autre locuteur vérifie', "Personne ne valide sa propre phrase. Un refus est toujours expliqué."],
    ['bolt', '3. La phrase est en ligne', "Les clients la reçoivent aussitôt, à l'écrit comme à la voix."],
  ];
  steps.forEach(([k, t, d], i) => {
    const x = 0.6 + i * 4.15;
    card(s, x, 1.6, 3.85, 3.3, HEX.lt2, 'Étape ' + (i + 1));
    circleIcon(s, k, x + 0.3, 1.9, 0.9, HEX.accent1, 'Étape ' + (i + 1));
    txt(s, t, { x: x + 0.3, y: 2.95, w: 3.3, h: 0.5, fontSize: 20, bold: true, color: C.text2, objectName: t });
    txt(s, d, { x: x + 0.3, y: 3.5, w: 3.3, h: 1.2, fontSize: 16, color: C.text1, objectName: t + ' détail' });
    if (i < 2) txt(s, '→', { x: x + 3.85, y: 2.9, w: 0.3, h: 0.5, fontSize: 24, bold: true, color: C.accent2, align: 'center', objectName: 'Flèche ' + (i + 1) });
  });
  card(s, 0.6, 5.25, 12.1, 1.35, HEX.dk2, 'Bandeau rémunération');
  circleIcon(s, 'coins', 0.9, 5.47, 0.9, HEX.accent2, 'Rémunération');
  txt(s, 'Chaque contribution validée est payée en mobile money', { x: 2.05, y: 5.4, w: 10.4, h: 0.5, fontSize: 20, bold: true, color: C.background1, objectName: 'Rémunération titre' });
  txt(s, '25 FCFA par traduction, 15 FCFA par vérification, 50 FCFA par enregistrement vocal', { x: 2.05, y: 5.92, w: 10.4, h: 0.5, fontSize: 16, color: C.accent2, objectName: 'Rémunération tarifs' });
  s.addNotes("Le slogan devient littéral : en apprenant à la banque à parler leur langue, les locuteurs gagnent eux-mêmes de l'argent.");

  // 6. Confiance
  s = pres.addSlide({ masterName: 'Contenu', sectionTitle: 'Le produit' });
  s.addText("La confiance d'abord", { placeholder: 'title' });
  const trust = [
    ['check', 'Rien sans votre accord', "Une opération est toujours relue, puis confirmée par le client."],
    ['eye', 'Jamais de devinette', "Deux Paul dans les contacts ? Le service demande lequel."],
    ['lock', 'Les accès de la banque restent protégés', "Personne ne peut détourner le service vers une fausse banque."],
    ['users', 'Deux personnes par phrase', "Aucune traduction n'atteint un client sans une seconde relecture."],
  ];
  trust.forEach(([k, t, d], i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 1.55 + Math.floor(i / 2) * 2.6;
    card(s, x, y, 5.95, 2.35, HEX.lt2, 'Garantie ' + (i + 1));
    circleIcon(s, k, x + 0.35, y + 0.35, 0.95, i % 2 === 0 ? HEX.accent1 : HEX.dk2, t);
    txt(s, t, { x: x + 1.55, y: y + 0.35, w: 4.2, h: 0.85, fontSize: 20, bold: true, color: C.text2, valign: 'middle', objectName: t });
    txt(s, d, { x: x + 1.55, y: y + 1.25, w: 4.2, h: 0.9, fontSize: 16, color: C.text1, objectName: t + ' détail' });
  });
  s.addNotes("La sécurité est une fonctionnalité, pas une option : pas d'argent qui part sans confirmation, pas de choix fait à la place du client.");

  // 7. Modèle économique
  pres.addSection({ title: 'Le modèle économique' });
  s = pres.addSlide({ masterName: 'Contenu', sectionTitle: 'Le modèle économique' });
  s.addText('Un abonnement, et un petit prix par conversation', { placeholder: 'title' });
  const offer = [
    ['bank', '500 000 FCFA', 'par mois et par établissement', "Mise en place, hébergement et accès à l'atelier des locuteurs.", HEX.dk2],
    ['coins', '2 FCFA', 'par conversation en langue locale', 'Les conversations en français restent gratuites. Plus de clients servis, plus de revenus pour tous.', HEX.accent1],
  ];
  offer.forEach(([k, big, sub, d, fill], i) => {
    const x = 0.6 + i * 4.25;
    card(s, x, 1.55, 4.0, 4.95, fill, 'Offre ' + (i + 1));
    circleIcon(s, k, x + 0.35, 1.9, 0.9, HEX.accent2, 'Offre ' + (i + 1));
    txt(s, big, { x: x + 0.35, y: 3.0, w: 3.4, h: 0.9, fontSize: 40, bold: true, color: C.background1, fontFace: THEME.headFontFace, objectName: 'Prix ' + (i + 1) });
    txt(s, sub, { x: x + 0.35, y: 3.9, w: 3.4, h: 0.75, fontSize: 18, color: C.accent2, objectName: 'Unité ' + (i + 1) });
    txt(s, d, { x: x + 0.35, y: 4.75, w: 3.4, h: 1.5, fontSize: 15, color: C.background2, objectName: 'Détail offre ' + (i + 1) });
  });
  card(s, 9.1, 1.55, 3.6, 4.95, HEX.lt2, 'Coût langue');
  circleIcon(s, 'seed', 9.45, 1.9, 0.9, HEX.accent1, 'Coût langue');
  txt(s, '13 €', { x: 9.45, y: 3.0, w: 3.0, h: 0.9, fontSize: 40, bold: true, color: C.accent1, fontFace: THEME.headFontFace, objectName: 'Coût langue valeur' });
  txt(s, 'pour construire une langue complète', { x: 9.45, y: 3.9, w: 3.0, h: 0.75, fontSize: 18, color: C.text2, objectName: 'Coût langue libellé' });
  txt(s, '8 685 FCFA versés aux locuteurs pour 144 phrases, dont 45 enregistrées.', { x: 9.45, y: 4.75, w: 3.0, h: 1.5, fontSize: 15, color: C.text1, objectName: 'Coût langue détail' });
  s.addNotes("Notre revenu grandit exactement quand la banque gagne de nouveaux clients actifs. Tarifs à valider avec un premier partenaire.");

  // 8. Ce que gagne une banque
  s = pres.addSlide({ masterName: 'Contenu', sectionTitle: 'Le modèle économique' });
  s.addText('Ce que gagne une banque partenaire', { placeholder: 'title' });
  s.addChart(pres.charts.BAR, [{ name: 'Revenu net (M FCFA)', labels: ['Année 1', 'Année 2', 'Année 3'], values: [95.6, 197.2, 298.8] }], {
    x: 0.6, y: 1.5, w: 7.4, h: 4.8, barDir: 'col', chartColors: [HEX.accent1], showValue: true, dataLabelPosition: 'outEnd',
    dataLabelFormatCode: '0.0" M"', dataLabelFontSize: 16, dataLabelFontBold: true, dataLabelColor: HEX.dk2, dataLabelFontFace: '+mn-lt',
    showTitle: true, title: 'Revenu net supplémentaire, en millions de FCFA', titleFontSize: 16, titleColor: HEX.dk2, titleFontFace: '+mn-lt',
    catAxisLabelColor: HEX.accent6, catAxisLabelFontSize: 14, catAxisLabelFontFace: '+mn-lt', valAxisHidden: true,
    valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, objectName: 'Graphique revenu banque',
  });
  const bank = [['851', 'clients actifs suffisent', "pour rembourser l'abonnement de l'année", HEX.accent1], ['25 fois', 'la mise récupérée', 'en troisième année', HEX.accent2]];
  bank.forEach(([n, l, d, col], i) => {
    const y = 1.6 + i * 2.15;
    card(s, 8.4, y, 4.3, 1.95, HEX.lt2, 'Repère ' + (i + 1));
    txt(s, n, { x: 8.7, y: y + 0.2, w: 3.8, h: 0.8, fontSize: 36, bold: true, color: i === 0 ? C.accent1 : C.text2, fontFace: THEME.headFontFace, objectName: 'Repère valeur ' + (i + 1) });
    txt(s, l, { x: 8.7, y: y + 0.95, w: 3.8, h: 0.4, fontSize: 16, bold: true, color: C.text1, objectName: 'Repère libellé ' + (i + 1) });
    txt(s, d, { x: 8.7, y: y + 1.35, w: 3.8, h: 0.4, fontSize: 14, color: C.accent6, objectName: 'Repère détail ' + (i + 1) });
  });
  txt(s, "Banque de 500 000 clients mobiles. 10 %, 20 % puis 30 % des clients freinés par la langue deviennent actifs, 4 transferts par mois. Projections à valider avec un premier partenaire.", { x: 0.6, y: 6.35, w: 12.1, h: 0.55, fontSize: 11, italic: true, color: C.accent6, objectName: 'Hypothèses banque' });
  s.addNotes("Un client actif rapporte 7 200 FCFA de frais par an à la banque et lui coûte 144 FCFA. Sans compter les dépôts et les nouveaux produits.");

  // 9. Ce que gagne Shun&Co.
  s = pres.addSlide({ masterName: 'Contenu', sectionTitle: 'Le modèle économique' });
  s.addText('Ce que gagne Shun&Co.', { placeholder: 'title' });
  s.addChart(pres.charts.BAR, [{ name: 'Revenu (M FCFA)', labels: ['Année 1 · 2 banques', 'Année 2 · 5 banques', 'Année 3 · 10 banques'], values: [16.1, 50.7, 122.2] }], {
    x: 0.6, y: 1.5, w: 7.4, h: 4.8, barDir: 'col', chartColors: [HEX.dk2], showValue: true, dataLabelPosition: 'outEnd',
    dataLabelFormatCode: '0.0" M"', dataLabelFontSize: 16, dataLabelFontBold: true, dataLabelColor: HEX.dk2, dataLabelFontFace: '+mn-lt',
    showTitle: true, title: 'Revenu annuel, en millions de FCFA', titleFontSize: 16, titleColor: HEX.dk2, titleFontFace: '+mn-lt',
    catAxisLabelColor: HEX.accent6, catAxisLabelFontSize: 14, catAxisLabelFontFace: '+mn-lt', valAxisHidden: true,
    valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, showLegend: false, objectName: 'Graphique revenu Shun&Co.',
  });
  const us = [['186 000 €', 'de revenu en année 3', HEX.accent1], ['132 €', 'pour construire les dix langues nationales', HEX.accent2]];
  us.forEach(([n, l, col], i) => {
    const y = 1.6 + i * 2.15;
    card(s, 8.4, y, 4.3, 1.95, HEX.lt2, 'Repère Shun ' + (i + 1));
    txt(s, n, { x: 8.7, y: y + 0.25, w: 3.8, h: 0.8, fontSize: 36, bold: true, color: i === 0 ? C.accent1 : C.text2, fontFace: THEME.headFontFace, objectName: 'Repère Shun valeur ' + (i + 1) });
    txt(s, l, { x: 8.7, y: y + 1.1, w: 3.8, h: 0.7, fontSize: 16, color: C.text1, objectName: 'Repère Shun libellé ' + (i + 1) });
  });
  txt(s, "Plus tard : la base de phrases et de voix vérifiées pourra être proposée à des opérateurs et des universités, avec l'accord des locuteurs.", { x: 0.6, y: 6.35, w: 12.1, h: 0.55, fontSize: 13, italic: true, color: C.accent6, objectName: 'Perspective' });
  s.addNotes("Le coût de fabrication d'une langue reste marginal : le modèle est porté par la valeur créée chez la banque, et partagé avec les locuteurs.");

  // 10. Prochaines étapes
  s = pres.addSlide({ masterName: 'Contenu', sectionTitle: 'Le modèle économique' });
  s.addText('Prochaines étapes', { placeholder: 'title' });
  const road = [
    ['flag', "Aujourd'hui", 'Le service est prêt à être branché sur les six supports.'],
    ['users', 'Mois 1', 'Une langue pilote vérifiée par 20 locuteurs, payés en mobile money.'],
    ['bank', 'Mois 3', 'Un premier établissement partenaire ; le service comprend la voix.'],
    ['mic', 'Mois 6', 'Notre propre voix de synthèse, née des enregistrements des locuteurs.'],
  ];
  s.addShape(pres.shapes.LINE, { x: 1.05, y: 2.3, w: 11.2, h: 0, line: { color: HEX.accent5, width: 3 }, objectName: 'Ligne du temps' });
  road.forEach(([k, t, d], i) => {
    const x = 0.6 + i * 3.05;
    circleIcon(s, k, x, 1.85, 0.9, i === 0 ? HEX.accent2 : HEX.accent1, t);
    txt(s, t, { x, y: 3.0, w: 2.8, h: 0.5, fontSize: 22, bold: true, color: C.text2, objectName: t });
    txt(s, d, { x, y: 3.55, w: 2.75, h: 1.6, fontSize: 16, color: C.text1, objectName: t + ' détail' });
  });
  card(s, 0.6, 5.45, 12.1, 1.1, HEX.lt2, 'Appel');
  txt(s, 'Nous cherchons un premier établissement partenaire pour lancer la langue pilote.', { x: 0.9, y: 5.6, w: 11.5, h: 0.8, fontSize: 20, bold: true, color: C.accent1, valign: 'middle', objectName: 'Appel texte' });
  s.addNotes("Demande claire au jury et aux banques présentes : un partenaire pilote.");

  // 11. Clôture
  pres.addSection({ title: 'Clôture' });
  s = pres.addSlide({ masterName: 'Titre sombre', sectionTitle: 'Clôture' });
  s.addText('Merci', { placeholder: 'title' });
  s.addText(SLOGAN, { placeholder: 'body' });
  s.addText('Shun&Co. · NkapLingua', { placeholder: 'team' });
  s.addNotes("Tout le monde devrait pouvoir parler argent, dans sa propre langue. Merci.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('écrit', OUT);
})();
