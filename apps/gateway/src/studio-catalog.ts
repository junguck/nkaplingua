/**
 * Traductions validées dans le studio (relues par un second locuteur), en mémoire.
 *
 * Elles l'emportent phrase par phrase sur les dictionnaires intégrés et les packs de fichiers.
 * Clés du catalogue : `ussd.<clé>` pour les phrases du dialogue, `ui.<clé>` pour les écrans.
 * Lues à chaque tour sans aller-retour réseau ; alimentées par `studio-sync.ts`.
 */

export interface StudioLanguage {
  readonly ussd: Readonly<Record<string, string>>;
  readonly ui: Readonly<Record<string, string>>;
}

const languages = new Map<string, { ussd: Record<string, string>; ui: Record<string, string> }>();
/** Voix validées : texte exact (normalisé) -> identifiant du mp3, par langue. */
const voices = new Map<string, Map<string, string>>();

const spoken = (text: string): string => text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

function bucket(language: string): { ussd: Record<string, string>; ui: Record<string, string> } {
  let entry = languages.get(language);
  if (entry === undefined) {
    entry = { ussd: {}, ui: {} };
    languages.set(language, entry);
  }
  return entry;
}

function split(key: string): { readonly kind: 'ussd' | 'ui'; readonly name: string } | null {
  if (key.startsWith('ussd.')) return { kind: 'ussd', name: key.slice(5) };
  if (key.startsWith('ui.')) return { kind: 'ui', name: key.slice(3) };
  return null;
}

export function setStudioTranslation(language: string, key: string, text: string, audioId: string | null = null): boolean {
  const target = split(key);
  if (target === null || text.trim() === '') return false;
  bucket(language)[target.kind][target.name] = text;
  if (audioId !== null) {
    const byText = voices.get(language) ?? new Map<string, string>();
    byText.set(spoken(text), audioId);
    voices.set(language, byText);
  }
  return true;
}

/** Enregistrement validé de cette phrase EXACTE dans cette langue, sinon `null` (jamais d'approximation). */
export function studioVoiceFor(language: string, text: string): string | null {
  return voices.get(language)?.get(spoken(text)) ?? null;
}

export function deleteStudioTranslation(language: string, key: string): void {
  const target = split(key);
  const entry = languages.get(language);
  if (target === null || entry === undefined) return;
  delete entry[target.kind][target.name];
}

/** Remplace une langue d'un bloc (rechargement complet). */
export function replaceStudioLanguage(language: string, entries: Iterable<readonly [key: string, text: string, audioId: string | null]>): void {
  languages.delete(language);
  voices.delete(language);
  for (const [key, text, audioId] of entries) setStudioTranslation(language, key, text, audioId);
}

export function studioUssd(language: string): Readonly<Record<string, string>> {
  return languages.get(language)?.ussd ?? {};
}

export function studioUi(language: string): Readonly<Record<string, string>> {
  return languages.get(language)?.ui ?? {};
}

export function studioLanguages(): string[] {
  return [...languages.keys()];
}

export function studioSize(): number {
  let total = 0;
  for (const entry of languages.values()) total += Object.keys(entry.ussd).length + Object.keys(entry.ui).length;
  return total;
}

/** Pour les tests : repart d'un catalogue vide. */
export function clearStudioCatalog(): void {
  languages.clear();
  voices.clear();
}
