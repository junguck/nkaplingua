/**
 * Voix du canal téléphonique — modèles `facebook/mms-tts` (VITS).
 *
 * Ce que la voix peut faire, et ce qu'elle ne peut pas, est écrit ici une fois pour toutes :
 *
 *   fr  → `facebook/mms-tts-fra`   (publié)
 *   en  → `facebook/mms-tts-eng`   (publié)
 *   fub → **aucun modèle publié** (fub/fuv/fuf/ffm répondent 401 sur Hugging Face)
 *
 * On ne fait donc jamais lire du fulfulde par une voix française : une langue sans modèle
 * reste sans audio, et l'IVR le dit (`voice.model === null`). Les clips sont produits hors
 * ligne par `pnpm --filter @nkap/gateway tts` (Python + torch), puis servis en statique.
 *
 * Les fichiers vivent dans `apps/gateway/audio/<langue>/<cle>.wav`, décrits par
 * `audio/index.json` (texte exact, durée, modèle, licence). `NKAP_AUDIO_DIR` pointe un autre
 * dossier (tests, livraison à part).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Modèles réellement publiés pour nos langues servies. */
export const VOICE_MODELS: Readonly<Record<string, string>> = {
  fr: 'facebook/mms-tts-fra',
  en: 'facebook/mms-tts-eng',
};

/** Langues pour lesquelles on a cherché un modèle sans en trouver : la voix humaine reste la seule option. */
export const NO_VOICE_MODEL: readonly string[] = ['fub', 'dua', 'ewo', 'bas', 'bbj', 'byv', 'wes'];

export interface AudioClip {
  readonly lang: string;
  readonly key: string;
  readonly text: string;
  readonly file: string;
  readonly duration_ms: number;
  readonly bytes: number;
  readonly model: string;
  readonly engine: string;
  readonly status: 'generated';
}

export interface AudioIndex {
  readonly engine: string;
  readonly generated_at: string;
  readonly elapsed_s?: number;
  readonly sampling_rate?: number;
  readonly models?: readonly string[];
  readonly clips: readonly AudioClip[];
  readonly failures?: readonly { lang: string; key: string; error: string }[];
  readonly licence?: string;
}

export function audioDir(): string {
  return process.env.NKAP_AUDIO_DIR ?? fileURLToPath(new URL('../audio', import.meta.url));
}

export function voiceModel(lang: string): string | null {
  return VOICE_MODELS[lang] ?? null;
}

/** Index des clips, ou `null` si la synthèse n'a pas encore été lancée. */
export function loadAudioIndex(dir: string = audioDir()): AudioIndex | null {
  const file = path.join(dir, 'index.json');
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as AudioIndex;
    if (!Array.isArray(raw.clips)) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Le texte d'un message USSD est stable : c'est la clé de correspondance avec le clip. */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Clip correspondant EXACTEMENT à ce que dit l'IVR. Les messages composés (récapitulatif +
 * question) n'ont pas de clip : on préfère pas d'audio à un audio qui ne dit pas tout.
 */
export function clipForText(lang: string, text: string, dir: string = audioDir()): AudioClip | null {
  const index = loadAudioIndex(dir);
  if (index === null) return null;
  const wanted = normalize(text);
  return index.clips.find((clip) => clip.lang === lang && normalize(clip.text) === wanted) ?? null;
}

export function audioUrl(clip: AudioClip): string {
  return `/audio/${clip.lang}/${clip.key}.wav`;
}

export interface VoiceSummary {
  readonly engine: string;
  readonly available: boolean;
  readonly generated_at: string | null;
  readonly languages: readonly { readonly lang: string; readonly model: string; readonly clips: number }[];
  /** Langues sans modèle publié : la voix humaine (enregistrement) est la seule voie honnête. */
  readonly withoutModel: readonly string[];
  readonly licence: string;
}

export function voiceSummary(dir: string = audioDir()): VoiceSummary {
  const index = loadAudioIndex(dir);
  const counts = new Map<string, number>();
  for (const clip of index?.clips ?? []) counts.set(clip.lang, (counts.get(clip.lang) ?? 0) + 1);
  return {
    engine: index?.engine ?? 'facebook/mms-tts',
    available: index !== null && index.clips.length > 0,
    generated_at: index?.generated_at ?? null,
    languages: [...counts.entries()]
      .map(([lang, clips]) => ({ lang, model: VOICE_MODELS[lang] ?? 'inconnu', clips }))
      .sort((a, b) => a.lang.localeCompare(b.lang)),
    withoutModel: [...NO_VOICE_MODEL],
    licence: index?.licence ?? 'facebook/mms-tts — CC-BY-NC 4.0',
  };
}
