// Brouillon fulfulde -> graphie « lisible » pour une voix FRANÇAISE (approximation, pour tests seulement).
// La voix française ne connaît pas ɓ ɗ ƴ ŋ ni les voyelles longues : on les rapproche des sons français.
// Résultat compréhensible à peu près, jamais authentique : toujours étiqueté « brouillon / voix approximative ».
const MAP = [
  [/ɓ/g, 'b'], [/ɗ/g, 'd'], [/ƴ/g, 'y'], [/ŋ/g, 'ng'], [/ñ/g, 'gn'], [/['’ʼ]/g, ''],
  [/nj/g, 'ndj'], [/mb/g, 'mb'],
  [/sh/g, '§'], [/c/g, '¤'], [/j/g, 'dj'],
  [/g(?=[ei])/g, 'gu'],
  [/uu/g, 'ou'], [/u/g, 'ou'], [/ee/g, 'é'], [/e(?!́)/g, 'é'], [/oo/g, 'o'], [/ii/g, 'i'], [/aa/g, 'a'],
  [/w(?=[aeiouéo])/g, 'ou'],
  [/h/g, ''], [/§/g, 'ch'], [/¤/g, 'tch'],
];
export function fulfuldeForFrenchVoice(text) {
  return text.split(/(\{\w+\}|\*|#)/).map((seg) => {
    if (seg === '*') return 'étoile';
    if (seg === '#') return 'dièse';
    if (/^\{\w+\}$/.test(seg)) return seg;   // valeurs verrouillées : remplacées plus tard par le français
    let s = seg.toLowerCase();
    for (const [re, to] of MAP) s = s.replace(re, to);
    return s;
  }).join('');
}
