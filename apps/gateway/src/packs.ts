/**
 * Packs de langue : la porte d'entrée des traductions livrées par les locuteurs, SANS toucher au code.
 *
 * Un fichier `apps/gateway/translations/<code>.json` par langue de la sandbox (dua, ewo, bas, bbj, byv…) :
 *
 *   {
 *     "language": "dua",
 *     "status": "proposed",             // proposed | validated (deux locuteurs) | draft
 *     "sources": ["Session de relecture du 27/11, 2 locuteurs (Douala, Bonabéri)"],
 *     "ui":   { "nav.home": "…", … },   // écrans mobile/web, mêmes clés que la sandbox (89)
 *     "ussd": { "menu.header": "…", … } // phrases USSD, mêmes clés et emplacements que le français
 *   }
 *
 * Règles d'honnêteté appliquées par le middleware :
 *   - écrans : clé par clé ; un écran à plus de 25 % de français repasse entièrement en `fr` ;
 *   - USSD : une langue n'est SERVIE que si le pack couvre TOUTES les phrases. Sinon le tour reste en
 *     français déclaré `fr` (jamais un écran USSD moitié traduit). La compréhension, elle, ne dépend
 *     pas du pack : elle vient du lexique du moteur.
 * `pnpm --filter @nkap/gateway i18n` vérifie les packs et produit le modèle à remplir.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gsm7Length, toGsm7 } from '@nkap/core';
import { isSafinumLanguage, type SafinumLanguage } from '@nkap/safinum';

export const PACK_STATUSES = ['proposed', 'validated', 'draft'] as const;
export type PackStatus = (typeof PACK_STATUSES)[number];

export interface LanguagePack {
  readonly language: SafinumLanguage;
  readonly status: PackStatus;
  readonly sources: readonly string[];
  readonly ui: Readonly<Record<string, string>>;
  readonly ussd: Readonly<Record<string, string>>;
}

export interface PackLoad {
  readonly packs: ReadonlyMap<SafinumLanguage, LanguagePack>;
  /** Fichiers refusés et pourquoi : jamais servis, signalés par `pnpm … i18n`. */
  readonly rejected: ReadonlyArray<{ readonly file: string; readonly reason: string }>;
}

/** `NKAP_TRANSLATIONS_DIR` permet de pointer un autre dossier (tests, livraison du jour J à part). */
function defaultPackDir(): string {
  const packaged = fileURLToPath(new URL('./translations/', import.meta.url));
  if (fs.existsSync(packaged)) return packaged;
  return fileURLToPath(new URL('../translations/', import.meta.url));
}

export const DEFAULT_PACK_DIR = process.env.NKAP_TRANSLATIONS_DIR ?? defaultPackDir();

/** Lit `translations/*.json` (les fichiers commençant par `_` sont des modèles, ignorés). */
export function loadPacks(dir: string = DEFAULT_PACK_DIR): PackLoad {
  const packs = new Map<SafinumLanguage, LanguagePack>();
  const rejected: Array<{ file: string; reason: string }> = [];
  if (!fs.existsSync(dir)) return { packs, rejected };

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()) {
    const parsed = parsePack(path.join(dir, file));
    if (typeof parsed === 'string') rejected.push({ file, reason: parsed });
    else if (path.basename(file, '.json') !== parsed.language) rejected.push({ file, reason: `le fichier doit s'appeler ${parsed.language}.json` });
    else packs.set(parsed.language, parsed);
  }
  return { packs, rejected };
}

function parsePack(file: string): LanguagePack | string {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return `JSON illisible : ${error instanceof Error ? error.message : String(error)}`;
  }
  if (typeof raw !== 'object' || raw === null) return 'objet JSON attendu';
  const record = raw as Record<string, unknown>;
  const language = record.language;
  if (!isSafinumLanguage(language) || language === 'fr') return `langue inconnue de la sandbox : ${String(language)}`;
  const status = record.status;
  if (!(PACK_STATUSES as readonly unknown[]).includes(status)) return `statut invalide : ${String(status)}`;
  const ui = stringMap(record.ui);
  const ussd = stringMap(record.ussd);
  if (ui === null || ussd === null) return '« ui » et « ussd » doivent être des objets de chaînes';
  const sources = Array.isArray(record.sources) ? record.sources.filter((s): s is string => typeof s === 'string') : [];
  return { language, status: status as PackStatus, sources, ui, ussd };
}

/** Garde les seules valeurs non vides : une chaîne vide = « pas encore traduit ». */
function stringMap(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, text] of Object.entries(value as Record<string, unknown>)) {
    if (typeof text === 'string' && text.trim() !== '') out[key] = text;
  }
  return out;
}

const PLACEHOLDER = /\{([a-z_]+)\}/gi;

export function placeholderSet(text: string): string {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => (m[1] ?? '').toLowerCase()))].sort().join(',');
}

export interface PackReport {
  readonly language: SafinumLanguage;
  readonly status: PackStatus;
  readonly ui: { readonly translated: number; readonly total: number };
  readonly ussd: { readonly translated: number; readonly total: number; readonly complete: boolean };
  readonly problems: readonly string[];
}

/**
 * Vérifie un pack contre les références : emplacements identiques à la source, clés connues,
 * phrases USSD tenant seules dans 182 septets après translittération GSM-7.
 */
export function auditPack(
  pack: LanguagePack,
  references: { readonly ui: Readonly<Record<string, string>>; readonly ussd: Readonly<Record<string, string>> },
): PackReport {
  const problems: string[] = [];
  for (const [key, text] of Object.entries(pack.ui)) {
    const ref = references.ui[key];
    if (ref === undefined) problems.push(`ui.${key} : clé inconnue des écrans de la sandbox`);
    else if (placeholderSet(ref) !== placeholderSet(text)) problems.push(`ui.${key} : emplacements ${placeholderSet(text) || 'aucun'} ≠ ${placeholderSet(ref) || 'aucun'}`);
  }
  for (const [key, text] of Object.entries(pack.ussd)) {
    const ref = references.ussd[key];
    if (ref === undefined) problems.push(`ussd.${key} : clé inconnue`);
    else if (placeholderSet(ref) !== placeholderSet(text)) problems.push(`ussd.${key} : emplacements ${placeholderSet(text) || 'aucun'} ≠ ${placeholderSet(ref) || 'aucun'}`);
    else if (gsm7Length(toGsm7(text)) > 182) problems.push(`ussd.${key} : plus de 182 septets après translittération`);
  }
  const ussdTotal = Object.keys(references.ussd).length;
  const ussdTranslated = Object.keys(pack.ussd).filter((k) => k in references.ussd).length;
  return {
    language: pack.language,
    status: pack.status,
    ui: { translated: Object.keys(pack.ui).filter((k) => k in references.ui).length, total: Object.keys(references.ui).length },
    ussd: { translated: ussdTranslated, total: ussdTotal, complete: ussdTranslated === ussdTotal },
    problems,
  };
}
