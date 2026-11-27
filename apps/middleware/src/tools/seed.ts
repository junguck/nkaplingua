/**
 * Amorce Mongo : références (USSD + écrans), traductions fr/en validées, lexique, comptes démo.
 *
 * Les propositions fulfulde de la v2 (« à valider par un locuteur ») ne sont PAS publiées :
 * elles entrent comme contributions EN ATTENTE, que le studio fera relire par un tiers.
 *
 *   node src/tools/seed.ts
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { z } from 'zod';
import { COLLECTIONS, isLanguage, type LexiconDoc, type LexiconIntent, type ReferenceDoc } from '@nkap/lingua-core';
import { hashPassword } from '@nkap/lingua-core/server';
import { EN, REFERENCES } from '../i18n/messages.ts';

const root = (path: string): string => fileURLToPath(new URL(`../../../../${path}`, import.meta.url));

const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017';
const MONGO_DB = process.env.MONGO_DB ?? 'nkaplingua';

const uiSampleSchema = z.object({
  strings: z.record(z.object({ text: z.string(), context: z.string().nullable(), max_chars: z.number().nullable() })),
});
const dictionarySchema = z.record(z.string());
const legacySchema = z.object({ langues: z.record(z.object({ mots: z.record(z.array(z.tuple([z.string(), z.number()]))).optional() }).passthrough()) });
const readJson = (path: string): unknown => JSON.parse(readFileSync(root(path), 'utf8'));

const LEGACY_INTENTS: Readonly<Record<string, LexiconIntent>> = {
  CHECK_BALANCE: 'BALANCE_INQUIRY',
  TRANSFER: 'TRANSFER',
  CHECK_FEES: 'FEE_INQUIRY',
  TX_HISTORY: 'TRANSACTION_HISTORY',
  BUY_AIRTIME: 'AIRTIME_PURCHASE',
  PAY_BILL: 'BILL_PAYMENT',
  EXPLAIN_TERM: 'TERM_EXPLANATION',
};

function legacyLexicon(): LexiconDoc[] {
  const raw = legacySchema.parse(readJson('apps/gateway/data/langues.json'));
  const out: LexiconDoc[] = [];
  for (const [code, language] of Object.entries(raw.langues)) {
    const lang = code === 'bul' ? 'bum' : code;
    if (!isLanguage(lang)) continue;
    for (const [legacy, terms] of Object.entries(language.mots ?? {})) {
      const intent = LEGACY_INTENTS[legacy];
      if (intent === undefined) continue;
      for (const [term, weight] of terms) out.push({ lang, intent, term, weight });
    }
  }
  return out;
}

/** Bloc `const FUB: Dictionary = { ... }` du gateway v2 : propositions non relues. */
function legacyFulfulde(): [string, string][] {
  const source = readFileSync(root('apps/gateway/src/ui-dictionaries.ts'), 'utf8');
  const start = source.indexOf('const FUB');
  const end = source.indexOf('\n};', start);
  const block = source.slice(start, end);
  const pairs: [string, string][] = [];
  for (const match of block.matchAll(/^\s*'([a-zA-Z0-9_.]+)':\s*'((?:[^'\\]|\\.)*)',?$/gm)) {
    if (match[1] !== undefined && match[2] !== undefined) pairs.push([match[1], match[2].replace(/\\'/g, "'")]);
  }
  return pairs;
}

async function main(): Promise<void> {
  const client = await new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 3_000 }).connect();
  const db = client.db(MONGO_DB);

  const references = db.collection<ReferenceDoc>(COLLECTIONS.references);
  const translations = db.collection(COLLECTIONS.translations);
  const contributions = db.collection(COLLECTIONS.contributions);
  const users = db.collection(COLLECTIONS.users);
  const lexicon = db.collection<LexiconDoc>(COLLECTIONS.lexicon);

  await translations.createIndex({ key: 1, lang: 1 }, { unique: true });
  await contributions.createIndex({ status: 1, lang: 1, createdAt: 1 });
  await contributions.createIndex({ key: 1, lang: 1, authorId: 1 });
  await users.createIndex({ username: 1 }, { unique: true });
  await lexicon.createIndex({ lang: 1, intent: 1, term: 1 }, { unique: true });

  const now = new Date();
  const sample = uiSampleSchema.parse(readJson('apps/gateway/vendor/safinum-starter-node/samples/ui-accueil-en.json'));
  const kitEn = dictionarySchema.parse(readJson('apps/gateway/vendor/safinum-starter-node/translations/en.json'));

  const refOps = [
    ...REFERENCES.map((ref) => ({ _id: ref.key, fr: ref.fr, context: ref.context, maxChars: null, channels: [...ref.channels] })),
    ...Object.entries(sample.strings).map(([key, s]) => ({ _id: `ui.${key}`, fr: s.text, context: s.context, maxChars: s.max_chars, channels: ['mobile', 'web', 'atm'] })),
  ].map((doc) => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } }));
  await references.bulkWrite(refOps);

  const system = { contributorId: 'seed', reviewerId: 'seed', contributionId: 'seed', audioId: null, audioUrl: null, validatedAt: now, version: 1 };
  const trOps = [
    ...REFERENCES.map((ref) => ({ key: ref.key, lang: 'fr', text: ref.fr })),
    ...Object.entries(sample.strings).map(([key, s]) => ({ key: `ui.${key}`, lang: 'fr', text: s.text })),
    ...Object.entries(EN).map(([key, text]) => ({ key, lang: 'en', text })),
    ...Object.entries(kitEn).map(([key, text]) => ({ key: `ui.${key}`, lang: 'en', text })),
  ].map((doc) => ({ updateOne: { filter: { key: doc.key, lang: doc.lang }, update: { $set: { ...doc, ...system } }, upsert: true } }));
  await translations.bulkWrite(trOps);

  const lex = legacyLexicon();
  if (lex.length > 0) {
    await lexicon.bulkWrite(lex.map((doc) => ({ updateOne: { filter: { lang: doc.lang, intent: doc.intent, term: doc.term }, update: { $set: doc }, upsert: true } })));
  }

  const demo = [
    { username: 'amina', displayName: 'Amina (contributrice)', roles: ['contributor'], languages: ['ewo', 'fub', 'dua'] },
    { username: 'joseph', displayName: 'Joseph (relecteur)', roles: ['contributor', 'reviewer'], languages: ['ewo', 'fub', 'dua'] },
    { username: 'admin', displayName: 'Admin', roles: ['contributor', 'reviewer', 'admin'], languages: ['ewo', 'fub', 'dua', 'bas', 'bbj', 'byv', 'hau', 'bum', 'wes', 'ybb'] },
  ];
  const password = process.env.SEED_PASSWORD ?? 'nkap-demo-2026';
  for (const user of demo) {
    await users.updateOne(
      { username: user.username },
      { $set: { ...user }, $setOnInsert: { passwordHash: await hashPassword(password), createdAt: now } },
      { upsert: true },
    );
  }

  const fub = legacyFulfulde();
  for (const [key, text] of fub) {
    await contributions.updateOne(
      { key: `ui.${key}`, lang: 'fub', authorId: 'legacy-v2' },
      { $setOnInsert: { key: `ui.${key}`, lang: 'fub', kind: 'text', text, audioId: null, authorId: 'legacy-v2', authorName: 'Gateway v2 (non relu)', status: 'pending', createdAt: now } },
      { upsert: true },
    );
  }

  console.log(JSON.stringify({ references: refOps.length, translations: trOps.length, lexicon: lex.length, users: demo.length, pendingFulfulde: fub.length }));
  await client.close();
}

await main();
