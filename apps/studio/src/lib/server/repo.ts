import 'server-only';
import { ObjectId, type Collection } from 'mongodb';
import { z } from 'zod';
import { COLLECTIONS, REDIS, languageSchema, type CatalogEvent, type Language, type ReferenceDoc } from '@nkap/lingua-core';
import { blockingIssues, checkProposal } from '../checks';
import type { StudioUser } from './auth';
import { audioBucket, db, redis } from './db';
import { env } from './env';

const contributionSchema = z.object({
  _id: z.instanceof(ObjectId),
  key: z.string(),
  lang: languageSchema,
  text: z.string().nullable(),
  audioId: z.instanceof(ObjectId).nullable(),
  audioMime: z.string().nullable().optional(),
  authorId: z.string(),
  authorName: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']),
  createdAt: z.date(),
});
export type Contribution = z.infer<typeof contributionSchema>;

export interface ContributionView {
  readonly id: string;
  readonly key: string;
  readonly lang: Language;
  readonly text: string | null;
  readonly hasAudio: boolean;
  readonly authorName: string;
  readonly createdAt: string;
  readonly reference: { readonly fr: string; readonly context: string | null; readonly maxChars: number | null };
  readonly current: string | null;
}

async function collections(): Promise<{
  references: Collection<ReferenceDoc>;
  translations: Collection;
  contributions: Collection;
}> {
  const d = await db();
  return {
    references: d.collection<ReferenceDoc>(COLLECTIONS.references),
    translations: d.collection(COLLECTIONS.translations),
    contributions: d.collection(COLLECTIONS.contributions),
  };
}

export interface Coverage {
  readonly lang: Language;
  readonly validated: number;
  readonly pending: number;
  readonly total: number;
}

export async function coverage(languages: readonly Language[]): Promise<Coverage[]> {
  const { references, translations, contributions } = await collections();
  const total = await references.countDocuments({ fr: { $type: 'string' } });
  return Promise.all(
    languages.map(async (lang) => ({
      lang,
      total,
      validated: await translations.countDocuments({ lang }),
      pending: await contributions.countDocuments({ lang, status: 'pending' }),
    })),
  );
}

/** Prochaine phrase à traduire : sans traduction validée, et sans proposition en attente de moi. */
export async function nextReference(user: StudioUser, lang: Language, skip: readonly string[]): Promise<ReferenceDoc | null> {
  const { references, translations, contributions } = await collections();
  const done = await translations.distinct('key', { lang });
  const mine = await contributions.distinct('key', { lang, authorId: user.id, status: 'pending' });
  const excluded = [...new Set([...done, ...mine, ...skip])];
  return references.findOne({ _id: { $nin: excluded }, fr: { $type: 'string' } }, { sort: { _id: 1 } });
}

const submissionSchema = z.object({
  key: z.string().min(1).max(128),
  lang: languageSchema,
  text: z.string().max(600).transform((t) => t.trim()),
});

export type SubmitResult = { readonly ok: true } | { readonly ok: false; readonly errors: readonly string[] };

export async function submitContribution(user: StudioUser, raw: { key: unknown; lang: unknown; text: unknown }, audio: File | null): Promise<SubmitResult> {
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: ['Formulaire invalide'] };
  const { key, lang, text } = parsed.data;
  if (!user.languages.includes(lang)) return { ok: false, errors: ['Langue non autorisée pour ce compte'] };
  if (text === '' && audio === null) return { ok: false, errors: ['Un texte ou un enregistrement est nécessaire'] };
  if (audio !== null && (audio.size > 3_000_000 || !/^audio\//.test(audio.type))) return { ok: false, errors: ['Audio refusé (3 Mo, format audio)'] };

  const { references, contributions } = await collections();
  const reference = await references.findOne({ _id: key });
  if (reference === null) return { ok: false, errors: ['Phrase de référence inconnue'] };
  if (text !== '') {
    const issues = blockingIssues(checkProposal(reference.fr, text, lang, reference.maxChars));
    if (issues.length > 0) return { ok: false, errors: issues };
  }

  let audioId: ObjectId | null = null;
  if (audio !== null) {
    const bucket = await audioBucket();
    const upload = bucket.openUploadStream(`raw/${lang}/${key}/${Date.now()}`, { metadata: { contentType: audio.type, authorId: user.id } });
    upload.end(Buffer.from(await audio.arrayBuffer()));
    await new Promise<void>((resolve, reject) => upload.once('finish', () => resolve()).once('error', reject));
    audioId = upload.id;
  }

  await contributions.insertOne({
    key, lang, text: text === '' ? null : text, audioId, audioMime: audio?.type ?? null,
    authorId: user.id, authorName: user.displayName, status: 'pending', createdAt: new Date(),
  });
  return { ok: true };
}

/** File de relecture : jamais ses propres propositions (règle des quatre yeux). */
export async function reviewQueue(user: StudioUser, lang: Language, limit = 10): Promise<ContributionView[]> {
  const { references, translations, contributions } = await collections();
  const docs = await contributions.find({ lang, status: 'pending', authorId: { $ne: user.id } }, { sort: { createdAt: 1 }, limit }).toArray();
  const out: ContributionView[] = [];
  for (const raw of docs) {
    const c = contributionSchema.safeParse(raw);
    if (!c.success) continue;
    const ref = await references.findOne({ _id: c.data.key });
    const current = await translations.findOne({ key: c.data.key, lang });
    out.push({
      id: c.data._id.toHexString(), key: c.data.key, lang, text: c.data.text, hasAudio: c.data.audioId !== null,
      authorName: c.data.authorName, createdAt: c.data.createdAt.toISOString(),
      reference: { fr: ref?.fr ?? '(référence inconnue)', context: ref?.context ?? null, maxChars: ref?.maxChars ?? null },
      current: typeof current?.text === 'string' ? current.text : null,
    });
  }
  return out;
}

const decisionSchema = z.discriminatedUnion('decision', [
  z.object({ id: z.string().regex(/^[a-f0-9]{24}$/), decision: z.literal('approve'), transcript: z.string().max(600).optional() }),
  z.object({ id: z.string().regex(/^[a-f0-9]{24}$/), decision: z.literal('reject'), reason: z.string().min(3).max(300) }),
]);

export async function review(user: StudioUser, raw: unknown): Promise<SubmitResult> {
  if (!user.roles.includes('reviewer')) return { ok: false, errors: ['Rôle relecteur requis'] };
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: ['Décision invalide'] };
  const input = parsed.data;
  const { references, translations, contributions } = await collections();
  const filter = { _id: new ObjectId(input.id), status: 'pending', authorId: { $ne: user.id }, lang: { $in: [...user.languages] } };

  if (input.decision === 'reject') {
    const res = await contributions.updateOne(filter, { $set: { status: 'rejected', reason: input.reason, reviewerId: user.id, reviewerName: user.displayName, reviewedAt: new Date() } });
    return res.modifiedCount === 1 ? { ok: true } : { ok: false, errors: ['Déjà traitée, ou vous en êtes l’auteur'] };
  }

  const before = contributionSchema.safeParse(await contributions.findOne(filter));
  if (!before.success) return { ok: false, errors: ['Déjà traitée, ou vous en êtes l’auteur'] };
  const text = before.data.text ?? input.transcript?.trim() ?? '';
  if (text === '') return { ok: false, errors: ['Proposition audio seule : saisissez la transcription'] };
  const ref = await references.findOne({ _id: before.data.key });
  const issues = ref === null ? ['Référence inconnue'] : blockingIssues(checkProposal(ref.fr, text, before.data.lang, ref.maxChars));
  if (issues.length > 0) return { ok: false, errors: issues };

  // Passage atomique pending -> approved : deux relecteurs simultanés ne publient pas deux fois.
  const claimed = await contributions.findOneAndUpdate(filter, { $set: { status: 'approved', reviewerId: user.id, reviewerName: user.displayName, reviewedAt: new Date(), text } });
  if (claimed === null) return { ok: false, errors: ['Déjà traitée par un autre relecteur'] };

  const mp3Id = before.data.audioId === null ? null : await transcodeToMp3(before.data.audioId, before.data.lang, before.data.key);
  await translations.updateOne(
    { key: before.data.key, lang: before.data.lang },
    {
      $set: {
        text, audioId: mp3Id?.toHexString() ?? null, rawAudioId: before.data.audioId?.toHexString() ?? null,
        contributorId: before.data.authorId, reviewerId: user.id, contributionId: input.id, validatedAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { upsert: true },
  );
  await publish(before.data.lang, before.data.key, text, mp3Id?.toHexString() ?? null);
  return { ok: true };
}

/** Mongo est déjà écrit (vérité) ; Redis reçoit la valeur puis l'événement : chaque middleware se met à jour. */
async function publish(lang: Language, key: string, text: string, audioId: string | null): Promise<void> {
  const event: CatalogEvent = { kind: 'upsert', lang, key };
  await redis()
    .multi()
    .hset(REDIS.translations(lang), key, JSON.stringify({ t: text, a: audioId }))
    .sadd(REDIS.languages, lang)
    .incr(REDIS.version)
    .publish(REDIS.channel, JSON.stringify(event))
    .exec();
}

/** L'IVR n'accepte que m4a ou mp3 : le service audio transcode. Sans lui, l'audio reste en attente, non publié. */
async function transcodeToMp3(rawId: ObjectId, lang: Language, key: string): Promise<ObjectId | null> {
  const ttsUrl = env().TTS_URL;
  if (ttsUrl === undefined) return null;
  const bucket = await audioBucket();
  const chunks: Buffer[] = [];
  for await (const chunk of bucket.openDownloadStream(rawId)) if (Buffer.isBuffer(chunk)) chunks.push(chunk);
  try {
    const res = await fetch(new URL('/transcode', ttsUrl), { method: 'POST', body: Buffer.concat(chunks), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const upload = bucket.openUploadStream(`${lang}/${key}.mp3`, { metadata: { contentType: 'audio/mpeg' } });
    upload.end(Buffer.from(await res.arrayBuffer()));
    await new Promise<void>((resolve, reject) => upload.once('finish', () => resolve()).once('error', reject));
    return upload.id;
  } catch {
    return null;
  }
}

export async function readAudio(id: string): Promise<{ readonly data: Buffer; readonly type: string } | null> {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const bucket = await audioBucket();
  const file = await bucket.find({ _id: new ObjectId(id) }).next();
  if (file === null) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of bucket.openDownloadStream(file._id)) if (Buffer.isBuffer(chunk)) chunks.push(chunk);
  const type = z.object({ contentType: z.string() }).safeParse(file.metadata);
  return { data: Buffer.concat(chunks), type: type.success ? type.data.contentType : 'application/octet-stream' };
}

export async function audioIdOf(contributionId: string): Promise<string | null> {
  if (!/^[a-f0-9]{24}$/.test(contributionId)) return null;
  const { contributions } = await collections();
  const doc = contributionSchema.safeParse(await contributions.findOne({ _id: new ObjectId(contributionId) }));
  return doc.success ? (doc.data.audioId?.toHexString() ?? null) : null;
}
