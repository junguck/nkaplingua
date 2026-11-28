/**
 * Deux niveaux de normalisation :
 * - `normalize` garde les lettres des langues nationales (ɓ ɗ ŋ ƴ) : pour l'affichage et les traces ;
 * - `fold` les replie sur l'ASCII : pour comparer ce qu'un utilisateur tape sur un clavier
 *   de téléphone basique (« njobdi ») avec la forme du lexique (« njoɓdi »).
 */
const APOSTROPHES = /[’‘`´ʼ]/g;
const PUNCTUATION = /[.,;:!?¡¿"«»“”()[\]…•·|/\\–—_*#>+=]/g;

const NATIONAL_LETTERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ɓ/g, 'b'],
  [/ɗ/g, 'd'],
  [/ŋ/g, 'ng'],
  [/ƴ/g, 'y'],
  [/ñ/g, 'ny'],
  [/ɛ/g, 'e'],
  [/ɔ/g, 'o'],
  [/ǝ|ə/g, 'e'],
];

export function normalize(input: string): string {
  return input
    .normalize('NFC')
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fold(input: string): string {
  let out = normalize(input);
  for (const [pattern, replacement] of NATIONAL_LETTERS) out = out.replace(pattern, replacement);
  return out
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/'/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(folded: string): string[] {
  return folded.split(' ').filter((t) => t.length > 0);
}

/**
 * Cherche une expression du lexique dans un texte replié, sur frontières de mots.
 * Un `*` final autorise un suffixe : `envo*` couvre envoie, envoyer, envoyez.
 */
export function containsCue(foldedText: string, cue: string): boolean {
  const foldedCue = fold(cue.replace(/\*$/, ''));
  if (foldedCue.length === 0) return false;
  const stem = cue.endsWith('*');
  const escaped = foldedCue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  const pattern = new RegExp(`(?:^|\\s)${escaped}${stem ? '\\S*' : ''}(?=\\s|$)`, 'u');
  return pattern.test(foldedText);
}

/** Vrai si le texte commence par l'expression (pour « oui », « non », « eey », « ala »). */
export function startsWithCue(foldedText: string, cue: string): boolean {
  const foldedCue = fold(cue);
  return foldedText === foldedCue || foldedText.startsWith(`${foldedCue} `);
}
