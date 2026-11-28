/**
 * Catalogue L1 : instantané en mémoire, lu en O(1) sans aucun aller-retour réseau.
 *
 * Redis n'est PAS lu à chaque tour : il sert à amorcer le L1 au démarrage et à propager
 * les validations du studio (pub/sub). Les variantes GSM-7 (tons pliés) sont calculées
 * une fois, à l'écriture, jamais pendant un tour.
 */

import { foldToGsm7, LATIN_RULES, NATIONAL_RULES, type FoldRules, type Language } from '@nkap/lingua-core';

export interface TranslationRecord {
  readonly key: string;
  readonly lang: Language;
  readonly text: string;
  readonly audioUrl?: string | null;
}

export function defaultRules(lang: Language): FoldRules {
  return lang === 'fr' || lang === 'en' ? LATIN_RULES : NATIONAL_RULES;
}

export class Catalog {
  readonly #texts = new Map<Language, Map<string, string>>();
  readonly #gsm7 = new Map<Language, Map<string, string>>();
  readonly #audio = new Map<Language, Map<string, string>>();
  readonly #rules = new Map<Language, FoldRules>();
  #version = 0;

  static from(records: Iterable<TranslationRecord>, rules: ReadonlyMap<Language, FoldRules> = new Map()): Catalog {
    const catalog = new Catalog();
    for (const [lang, rule] of rules) catalog.#rules.set(lang, rule);
    for (const record of records) catalog.set(record);
    return catalog;
  }

  get version(): number {
    return this.#version;
  }

  rules(lang: Language): FoldRules {
    return this.#rules.get(lang) ?? defaultRules(lang);
  }

  set(record: TranslationRecord): void {
    const text = record.text.trim();
    if (text === '') return;
    bucket(this.#texts, record.lang).set(record.key, text);
    bucket(this.#gsm7, record.lang).set(record.key, foldToGsm7(text, this.rules(record.lang)));
    if (record.audioUrl) bucket(this.#audio, record.lang).set(record.key, record.audioUrl);
    this.#version += 1;
  }

  delete(lang: Language, key: string): void {
    this.#texts.get(lang)?.delete(key);
    this.#gsm7.get(lang)?.delete(key);
    this.#audio.get(lang)?.delete(key);
    this.#version += 1;
  }

  text(lang: Language, key: string, gsm7: boolean): string | undefined {
    return (gsm7 ? this.#gsm7 : this.#texts).get(lang)?.get(key);
  }

  audio(lang: Language, key: string): string | undefined {
    return this.#audio.get(lang)?.get(key);
  }

  covers(lang: Language, keys: Iterable<string>): boolean {
    const texts = this.#texts.get(lang);
    if (texts === undefined) return false;
    for (const key of keys) if (!texts.has(key)) return false;
    return true;
  }

  coverage(): ReadonlyMap<Language, number> {
    const out = new Map<Language, number>();
    for (const [lang, texts] of this.#texts) out.set(lang, texts.size);
    return out;
  }

  /** Remplace le contenu d'une langue d'un bloc (rechargement complet depuis Redis). */
  replaceLanguage(lang: Language, records: Iterable<TranslationRecord>): void {
    this.#texts.delete(lang);
    this.#gsm7.delete(lang);
    this.#audio.delete(lang);
    for (const record of records) this.set(record);
  }

  setRules(lang: Language, rules: FoldRules): void {
    this.#rules.set(lang, rules);
    const texts = this.#texts.get(lang);
    if (texts === undefined) return;
    const folded = bucket(this.#gsm7, lang);
    for (const [key, text] of texts) folded.set(key, foldToGsm7(text, rules));
    this.#version += 1;
  }
}

function bucket(map: Map<Language, Map<string, string>>, lang: Language): Map<string, string> {
  let inner = map.get(lang);
  if (inner === undefined) {
    inner = new Map();
    map.set(lang, inner);
  }
  return inner;
}
