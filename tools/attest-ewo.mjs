import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const glossaryPath = path.join(root, 'apps', 'extension', 'glossary', 'ewo.json');
const bulPath = path.join(root, 'apps', 'extension', 'glossary', 'bul.json');
const fubPath = path.join(root, 'apps', 'extension', 'glossary', 'fub.json');
const transcriptPath = path.join(root, 'tools', 'out', 'soreva-ewo.tsv');
const reportPath = path.join(root, 'tools', 'out', 'rapport-glossaire.md');
const citation = 'Leo Mendo Olame, "Soreva", 2025, CC-BY-4.0';

function foldWithoutTones(value) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  return foldWithoutTones(value).replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function containsForm(text, form) {
  const normalizedText = ` ${normalizeText(text)} `;
  const normalizedForm = normalizeText(form);
  return normalizedForm.length > 0 && normalizedText.includes(` ${normalizedForm} `);
}

function containsExactForm(text, form) {
  const escaped = form.normalize('NFC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'u')
    .test(text.normalize('NFC'));
}

function readTsv(file) {
  const [headerLine, ...lines] = fs.readFileSync(file, 'utf8').trimEnd().split(/\r?\n/);
  const headers = headerLine.split('\t');
  return lines.filter(Boolean).map((line) => {
    const values = line.split('\t');
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function listMissingKeys(reference, glossary) {
  return Object.keys(reference.entries).filter((key) => !(key in glossary.entries)).sort();
}

const ewo = JSON.parse(fs.readFileSync(glossaryPath, 'utf8'));
const bul = JSON.parse(fs.readFileSync(bulPath, 'utf8'));
const fub = JSON.parse(fs.readFileSync(fubPath, 'utf8'));
const transcripts = readTsv(transcriptPath);
const matched = [];
const notFound = [];

ewo.sources ??= [];
if (!ewo.sources.includes(citation)) ewo.sources.push(citation);

for (const [key, original] of Object.entries(ewo.entries)) {
  const form = typeof original === 'string' ? original : original.t;
  const hit = transcripts.find((sample) =>
    containsForm(sample.transcription, form) || containsForm(sample.raw_transcription, form),
  );
  if (!hit) {
    notFound.push({ key, form });
    continue;
  }

  const exact = containsExactForm(hit.transcription, form) || containsExactForm(hit.raw_transcription, form);
  const entry = typeof original === 'string' ? { t: original, s: ewo.default_status ?? 'propose' } : original;
  entry.src = `soreva (CC-BY-4.0) ${hit.id}`;
  if (exact && entry.s === 'propose') entry.s = 'attested';
  ewo.entries[key] = entry;
  matched.push({ key, form, id: hit.id, exact, status: entry.s });
}

fs.writeFileSync(glossaryPath, `${JSON.stringify(ewo, null, 2)}\n`);

const ewoMissing = listMissingKeys(fub, ewo);
const bulMissing = listMissingKeys(fub, bul);
const exactAttested = matched.filter(({ exact, status }) => exact && status === 'attested');
const foundButNotAttested = matched.filter(({ exact, status }) => !exact || status !== 'attested');
const report = [
  '# Rapport d’attestation des glossaires Ewondo et Bulu',
  '',
  `Source des formes : ${citation}. Le split test contient ${transcripts.length} transcriptions ewondo. Le dataset ne fournit aucune traduction française ; aucun alignement ni aucune phrase traduite n’a été créé.`,
  '',
  `## Ewondo — attestées à forme exacte (${exactAttested.length}/${Object.keys(ewo.entries).length})`,
  '',
  ...(exactAttested.length ? exactAttested.map(({ key, form, id }) => `- \`${key}\` — « ${form} » — ${id}`) : ['- Aucune.']),
  '',
  `## Ewondo — retrouvées mais non attestées (${foundButNotAttested.length})`,
  '',
  ...(foundButNotAttested.length ? foundButNotAttested.map(({ key, form, id, exact, status }) => `- \`${key}\` — « ${form} » — ${id} — ${exact ? `forme exacte, statut inchangé (${status})` : `trouvée après repli des tons seulement, statut inchangé (${status})`}`) : ['- Aucune.']),
  '',
  `## Ewondo — non retrouvées (${notFound.length})`,
  '',
  ...(notFound.length ? notFound.map(({ key, form }) => `- \`${key}\` — « ${form} »`) : ['- Aucune.']),
  '',
  `## Clés manquantes à enregistrer au Studio de l’extension`,
  '',
  `### Ewondo (${ewoMissing.length})`,
  '',
  ...(ewoMissing.length ? ewoMissing.map((key) => `- \`${key}\``) : ['- Aucune.']),
  '',
  `### Bulu (${bulMissing.length})`,
  '',
  ...(bulMissing.length ? bulMissing.map((key) => `- \`${key}\``) : ['- Aucune.']),
  '',
  'Enregistrements à collecter auprès de locuteurs ; une entrée ne peut être marquée `validated` qu’après validation par deux locuteurs distincts.',
  '',
  '## Blocage de génération',
  '',
  '`apps/extension/glossary/bundle.js` référence `tools/build-glossary.mjs`, absent du dépôt. Le bundle et `bundle.json` n’ont pas été régénérés ni modifiés.',
  '',
].join('\n');

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, report);
console.log(`Attestations retrouvées : ${matched.length}; non retrouvées : ${notFound.length}. Rapport : ${path.relative(root, reportPath)}`);
