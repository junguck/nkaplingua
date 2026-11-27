/**
 * Préparation de la synthèse vocale.
 *
 *   pnpm --filter @nkap/gateway tts            → écrit audio/_jobs.json puis lance Python
 *   pnpm --filter @nkap/gateway tts catalogue  → écrit seulement le catalogue (inspection)
 *
 * Règle : on ne synthétise **jamais** une phrase à trous. Un message qui contient `{amount}`,
 * `{recipient}`… dépend du tour ; un clip figé dirait un faux montant. Ces messages restent
 * donc sans audio (l'IVR les affiche/lit par le texte), et la liste des ignorés est affichée.
 */

import fs from 'node:fs';
import path from 'node:path';
import { USSD_ENGLISH, USSD_REFERENCE, message, type GatewayLanguage } from '../i18n.js';
import { VOICE_MODELS, audioDir } from '../voice.js';

export interface TtsJob {
  readonly lang: string;
  readonly key: string;
  readonly text: string;
  readonly model: string;
}

export interface TtsCatalogue {
  readonly jobs: readonly TtsJob[];
  readonly skipped: readonly { readonly lang: string; readonly key: string; readonly reason: string }[];
  readonly file: string;
}

/** Langues à synthétiser : celles qui ont un modèle publié (voir `VOICE_MODELS`). */
export function ttsLanguages(): string[] {
  return Object.keys(VOICE_MODELS).sort();
}

function textFor(lang: string, key: string): string | null {
  if (lang === 'fr') return USSD_REFERENCE[key as keyof typeof USSD_REFERENCE] ?? null;
  if (lang === 'en') return USSD_ENGLISH[key as keyof typeof USSD_ENGLISH] ?? null;
  return VOICE_MODELS[lang] === undefined ? null : message(lang as GatewayLanguage, key as never);
}

export function buildCatalogue(languages: readonly string[] = ttsLanguages()): Omit<TtsCatalogue, 'file'> {
  const keys = Object.keys(USSD_REFERENCE).sort();
  const jobs: TtsJob[] = [];
  const skipped: { lang: string; key: string; reason: string }[] = [];

  for (const lang of languages) {
    const model = VOICE_MODELS[lang];
    if (model === undefined) {
      skipped.push({ lang, key: '*', reason: 'aucun modèle MMS-TTS publié pour cette langue' });
      continue;
    }
    for (const key of keys) {
      const text = textFor(lang, key);
      if (text === null || text.trim() === '') {
        skipped.push({ lang, key, reason: 'phrase absente de ce catalogue' });
        continue;
      }
      if (/\{[a-z_]+\}/i.test(text)) {
        skipped.push({ lang, key, reason: 'phrase à emplacement : elle dépend du tour' });
        continue;
      }
      jobs.push({ lang, key, text, model });
    }
  }
  return { jobs, skipped };
}

export function writeCatalogue(dir: string = audioDir()): TtsCatalogue {
  const { jobs, skipped } = buildCatalogue();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, '_jobs.json');
  fs.writeFileSync(file, `${JSON.stringify(jobs, null, 2)}\n`);
  return { jobs, skipped, file };
}

export function main(args: readonly string[]): number {
  const { jobs, skipped, file } = writeCatalogue();
  const parLangue = new Map<string, number>();
  for (const job of jobs) parLangue.set(job.lang, (parLangue.get(job.lang) ?? 0) + 1);
  console.log(`Catalogue : ${file}`);
  console.log(
    `  ${jobs.length} phrase(s) à synthétiser — ` +
      [...parLangue.entries()].map(([lang, count]) => `${lang} ${count}`).join(', '),
  );
  const parRaison = new Map<string, number>();
  for (const entry of skipped) parRaison.set(entry.reason, (parRaison.get(entry.reason) ?? 0) + 1);
  for (const [reason, count] of parRaison) console.log(`  ${count} ignorée(s) : ${reason}`);
  if (args[0] === 'catalogue') return 0;
  console.log('\nLancez maintenant : python scripts/tts_mms.py audio/_jobs.json audio');
  return 0;
}
