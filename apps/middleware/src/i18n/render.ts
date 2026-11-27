/**
 * Un écran est décrit par des CLÉS, jamais par du texte : on peut le rejouer dans une autre
 * langue (changement de langue en plein parcours) et le compter avant de l'envoyer.
 *
 * Règle d'honnêteté : si une seule clé de l'écran manque dans la langue demandée, tout
 * l'écran part en français et `language` vaut `fr`. Jamais de phrase mi-duala mi-français
 * déclarée en duala.
 */

import { fill, foldToGsm7, type Language } from '@nkap/lingua-core';
import type { Catalog } from './catalog.ts';

export type Var = string | number;

export interface Line {
  readonly key: string;
  readonly vars?: Readonly<Record<string, Var>>;
}

export type OptionLabel = { readonly key: string } | { readonly literal: string };

export interface Option {
  readonly n: number;
  readonly label: OptionLabel;
}

export interface Screen {
  readonly lines: readonly Line[];
  readonly options: readonly Option[];
}

export interface Rendered {
  readonly text: string;
  readonly options: readonly string[];
  readonly language: Language;
  readonly keys: readonly string[];
}

export function screen(lines: readonly Line[], options: readonly Option[] = []): Screen {
  return { lines, options };
}

export function line(key: string, vars?: Readonly<Record<string, Var>>): Line {
  return vars === undefined ? { key } : { key, vars };
}

export function keyed(n: number, key: string): Option {
  return { n, label: { key } };
}

export function literal(n: number, text: string): Option {
  return { n, label: { literal: text } };
}

export function screenKeys(s: Screen): string[] {
  const keys = s.lines.map((l) => l.key);
  for (const option of s.options) if ('key' in option.label) keys.push(option.label.key);
  return keys;
}

export function render(catalog: Catalog, s: Screen, requested: Language, gsm7: boolean): Rendered {
  const keys = screenKeys(s);
  const language: Language = catalog.covers(requested, keys) ? requested : 'fr';
  const rules = catalog.rules(language);
  const value = (v: Var): string => (gsm7 && typeof v === 'string' ? foldToGsm7(v, rules) : String(v));
  const lookup = (key: string): string => catalog.text(language, key, gsm7) ?? catalog.text('fr', key, gsm7) ?? key;

  const lines = s.lines.map((l) => {
    const vars: Record<string, string> = {};
    for (const [name, v] of Object.entries(l.vars ?? {})) vars[name] = value(v);
    return fill(lookup(l.key), vars);
  });
  const options = s.options.map((o) => ('key' in o.label ? lookup(o.label.key) : value(o.label.literal)));
  const numbered = s.options.map((o, index) => `${o.n}. ${options[index] ?? ''}`);
  const text = [...lines, ...numbered].join('\n');
  return { text, options, language, keys };
}

/** 5000 -> "5 000 FCFA" (espace simple : GSM-7). */
export function money(amount: number): string {
  const rounded = Math.round(amount);
  return `${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;
}
