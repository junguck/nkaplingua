/**
 * Amorce la base du studio à partir des catalogues du gateway.
 *
 *  - références : les phrases françaises du dialogue (`ussd.<clé>`) et des écrans connus (`ui.<clé>`) ;
 *  - traductions validées : le français (référence) et l'anglais, déjà servis par le gateway ;
 *  - propositions fulfulde EN ATTENTE : elles sont servies telles quelles aujourd'hui, le studio
 *    les fait relire par des locuteurs ;
 *  - comptes de démonstration (contributrice, relecteur, admin).
 *
 * Les références d'autres écrans arrivent seules : le gateway enregistre les textes source qu'il voit.
 */

import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { z } from 'zod';
import { COLLECTIONS, type ReferenceDoc } from '@nkap/lingua-core';
import { hashPassword } from '@nkap/lingua-core/server';
import { USSD_ENGLISH, USSD_REFERENCE, message, type MessageKey } from '../i18n.js';
import { UI_DICTIONARIES } from '../ui-dictionaries.js';

const uiSampleSchema = z.object({
  strings: z.record(z.object({ text: z.string(), context: z.string().nullable().optional(), max_chars: z.number().nullable().optional() })).default({}),
});
type UiSample = z.infer<typeof uiSampleSchema>;

function uiSample(): UiSample {
  try {
    const parsed = uiSampleSchema.safeParse(JSON.parse(readFileSync(new URL('../samples/ui-accueil-en.json', import.meta.url), 'utf8')));
    return parsed.success ? parsed.data : { strings: {} };
  } catch {
    return { strings: {} };
  }
}

export async function main(): Promise<number> {
  const client = await new MongoClient(process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 3_000 }).connect();
  const db = client.db(process.env.MONGO_DB ?? 'nkaplingua');
  const references = db.collection<ReferenceDoc>(COLLECTIONS.references);
  const translations = db.collection(COLLECTIONS.translations);
  const contributions = db.collection(COLLECTIONS.contributions);
  const users = db.collection(COLLECTIONS.users);
  const ours = /^(ussd|ui)\./;

  await translations.createIndex({ key: 1, lang: 1 }, { unique: true });
  await contributions.createIndex({ status: 1, lang: 1, createdAt: 1 });
  await users.createIndex({ username: 1 }, { unique: true });

  // Seules les clés du gateway (ussd.*, ui.*) ont un sens : le reste est retiré.
  await references.deleteMany({ _id: { $not: ours } });
  await translations.deleteMany({ key: { $not: ours } });
  await contributions.deleteMany({ key: { $not: ours } });

  const now = new Date();
  const keys = Object.keys(USSD_REFERENCE) as MessageKey[];
  const sample = uiSample().strings;
  const refs: ReferenceDoc[] = [
    ...keys.map((key) => ({ _id: `ussd.${key}`, fr: USSD_REFERENCE[key], context: 'Dialogue USSD, SMS et serveur vocal', maxChars: null, channels: ['ussd', 'sms', 'ivr'] })),
    ...Object.entries(sample).map(([key, s]) => ({ _id: `ui.${key}`, fr: s.text, context: s.context ?? null, maxChars: s.max_chars ?? null, channels: ['mobile', 'web', 'atm'] })),
  ];
  await references.bulkWrite(refs.map((doc) => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } })));

  const validated = { contributorId: 'seed', reviewerId: 'seed', contributionId: 'seed', audioId: null, validatedAt: now, version: 1 };
  const en = UI_DICTIONARIES.en ?? {};
  const rows = [
    ...keys.map((key) => ({ key: `ussd.${key}`, lang: 'fr', text: USSD_REFERENCE[key] })),
    ...keys.map((key) => ({ key: `ussd.${key}`, lang: 'en', text: USSD_ENGLISH[key] })),
    ...Object.entries(sample).map(([key, s]) => ({ key: `ui.${key}`, lang: 'fr', text: s.text })),
    ...Object.entries(en).map(([key, text]) => ({ key: `ui.${key}`, lang: 'en', text })),
  ];
  await translations.bulkWrite(rows.map((row) => ({ updateOne: { filter: { key: row.key, lang: row.lang }, update: { $set: { ...row, ...validated } }, upsert: true } })));

  const proposals = [
    ...keys.map((key) => [`ussd.${key}`, message('fub', key)] as const),
    ...Object.entries(UI_DICTIONARIES.fub ?? {}).map(([key, text]) => [`ui.${key}`, text] as const),
  ];
  for (const [key, text] of proposals) {
    await contributions.updateOne(
      { key, lang: 'fub', authorId: 'import-initial' },
      { $setOnInsert: { key, lang: 'fub', kind: 'text', text, audioId: null, authorId: 'import-initial', authorName: 'Import initial (non relu)', status: 'pending', createdAt: now } },
      { upsert: true },
    );
  }

  const password = process.env.SEED_PASSWORD ?? 'nkap-demo-2026';
  const demo = [
    { username: 'amina', displayName: 'Amina (contributrice)', roles: ['contributor'], languages: ['ewo', 'fub', 'dua'] },
    { username: 'joseph', displayName: 'Joseph (relecteur)', roles: ['contributor', 'reviewer'], languages: ['ewo', 'fub', 'dua'] },
    { username: 'admin', displayName: 'Admin', roles: ['contributor', 'reviewer', 'admin'], languages: ['ewo', 'fub', 'dua', 'bas', 'bbj', 'byv', 'hau', 'bum', 'wes', 'ybb'] },
  ];
  for (const user of demo) {
    await users.updateOne({ username: user.username }, { $set: user, $setOnInsert: { passwordHash: await hashPassword(password), createdAt: now } }, { upsert: true });
  }

  console.log(JSON.stringify({ references: refs.length, translations: rows.length, pendingFulfulde: proposals.length, users: demo.length }));
  await client.close();
  return 0;
}
