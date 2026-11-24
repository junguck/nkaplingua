// Enregistrements de locuteurs natifs (IndexedDB). Partagé app / studio / offscreen.
// Un enregistrement est « validé » quand >= 2 locuteurs distincts (celui qui enregistre + au moins un autre).
const DB = 'nkaplingua-audio', ST = 'rec';
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(ST, mode); const out = fn(t.objectStore(ST)); t.oncomplete = () => res(out.result); t.onerror = () => rej(t.error); }); };
export const recId = (lang, key) => `${lang}|${key}`;
export const speakersOf = (r) => new Set([r.by, ...(r.validations ?? [])].filter(Boolean));
export const isValidated = (r) => !!r && speakersOf(r).size >= 2;
export const getRec = (lang, key) => tx('readonly', (s) => s.get(recId(lang, key)));
export const allRecs = () => tx('readonly', (s) => s.getAll());
export const putRec = (r) => tx('readwrite', (s) => s.put(r));
export const delRec = (lang, key) => tx('readwrite', (s) => s.delete(recId(lang, key)));
export async function saveRecording(lang, key, blob, by) {
  await putRec({ id: recId(lang, key), lang, key, blob, mime: blob.type, by, validations: [], createdAt: Date.now() });
}
export async function validate(lang, key, who) {
  const r = await getRec(lang, key);
  if (!r) throw new Error('aucun enregistrement');
  if (!who || who === r.by) throw new Error('la validation doit venir d\'un AUTRE locuteur');
  r.validations = [...new Set([...(r.validations ?? []), who])];
  await putRec(r);
}
