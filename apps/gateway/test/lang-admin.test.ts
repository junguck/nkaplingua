import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_TEAM_KEY, adminAction, adminState, createMiddlewareServer } from '../src/index.js';
import { applyWordDb } from '../src/word-base.js';

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nkap-admin-')), 'langues.json');

function write(body: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
}

describe('administration de la base de mots', () => {
  beforeEach(() => {
    process.env.NKAP_WORD_DB = file;
    write({ langues: {} });
    applyWordDb();
  });

  it('ajoute une langue du contrat sans aucun mot', () => {
    const result = adminAction('langue', { code: 'bas', nom: 'Ɓasaá', alias: ['bassa'], sources: ['Test'] });
    expect(result.status).toBe(200);
    const entry = JSON.parse(fs.readFileSync(file, 'utf8')).langues.bas;
    expect(entry).toMatchObject({ nom: 'Ɓasaá', alias: ['bassa'], remplace: false });
  });

  it('refuse un code hors contrat et n’écrit rien', () => {
    const before = fs.readFileSync(file, 'utf8');
    const result = adminAction('langue', { code: 'xyz', nom: 'Inconnue' });
    expect(result.status).toBe(400);
    expect(String(result.body.problems)).toContain('langue inconnue');
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('ajoute un mot puis met à jour son poids sans le dupliquer', () => {
    adminAction('langue', { code: 'bas', nom: 'Ɓasaá' });
    expect(adminAction('mot', { code: 'bas', intention: 'CHECK_BALANCE', texte: 'ndap', poids: 2 }).status).toBe(200);
    expect(adminAction('mot', { code: 'bas', intention: 'CHECK_BALANCE', texte: 'ndap', poids: 4 }).status).toBe(200);
    const entry = JSON.parse(fs.readFileSync(file, 'utf8')).langues.bas;
    expect(entry.mots.CHECK_BALANCE).toEqual([['ndap', 4]]);
  });

  it('refuse un poids hors bornes et une intention inconnue', () => {
    adminAction('langue', { code: 'bas', nom: 'Ɓasaá' });
    expect(adminAction('mot', { code: 'bas', intention: 'CHECK_BALANCE', texte: 'ndap', poids: 9 }).status).toBe(400);
    expect(adminAction('mot', { code: 'bas', intention: 'SOLD', texte: 'ndap', poids: 3 }).status).toBe(400);
  });

  it('supprime un mot et signale un mot absent', () => {
    adminAction('langue', { code: 'bas', nom: 'Ɓasaá' });
    adminAction('mot', { code: 'bas', intention: 'TRANSFER', texte: 'loma', poids: 3 });
    expect(adminAction('supprimer', { code: 'bas', texte: 'loma' }).status).toBe(200);
    expect(adminAction('supprimer', { code: 'bas', texte: 'loma' }).status).toBe(404);
  });

  it('exporte le lexique intégré d’une langue et la fait venir de la base', () => {
    const result = adminAction('exporter', { code: 'dua' });
    expect(result.status).toBe(200);
    const entry = JSON.parse(fs.readFileSync(file, 'utf8')).langues.dua;
    expect(entry.remplace).toBe(true);
    expect(entry.mots.TRANSFER.length).toBeGreaterThan(0);
  });

  it('refuse d’exporter une langue sans aucun mot connu', () => {
    adminAction('langue', { code: 'byv', nom: 'Mə̀dûmbà' });
    expect(adminAction('exporter', { code: 'byv' }).status).toBe(400);
  });

  it('expose l’état complet attendu par la page', () => {
    adminAction('langue', { code: 'bas', nom: 'Ɓasaá', alias: ['bassa'] });
    const state = adminState();
    expect(state.languages.map((language) => language.code)).toContain('bas');
    expect(state.disponibles.map((language) => language.code)).not.toContain('bas');
    expect(state.weights).toEqual({ min: 1, max: 5 });
  });
});

describe('API d’administration sur HTTP', () => {
  let server: ReturnType<typeof createMiddlewareServer>;
  let base: string;

  beforeAll(async () => {
    process.env.NKAP_WORD_DB = file;
    write({ langues: {} });
    server = createMiddlewareServer({ teamKey: DEMO_TEAM_KEY, bankUrl: 'http://127.0.0.1:1', log: () => undefined });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('sert la page et l’état de la base', async () => {
    expect((await fetch(`${base}/langues-admin`)).status).toBe(200);
    const state = await fetch(`${base}/api/langues`).then((response) => response.json());
    expect(state).toHaveProperty('languages');
  });

  it('écrit une langue depuis la page et la rend active tout de suite', async () => {
    const response = await fetch(`${base}/api/langues/langue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'bas', nom: 'Ɓasaá', alias: ['bassa'] }),
    });
    expect(response.status).toBe(200);
    const tested = (await fetch(`${base}/api/langues/tester`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phrase: 'parle-moi en bassa' }),
    }).then((result) => result.json())) as { intention: string; parametres: { targetLanguage?: string } };
    expect(tested.intention).toBe('CHANGE_LANGUAGE');
    expect(tested.parametres.targetLanguage).toBe('bas');
  });

  it('refuse une action inconnue', async () => {
    const response = await fetch(`${base}/api/langues/nimportequoi`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(404);
  });
});

// Nettoyage en dernier : les deux blocs partagent le même fichier temporaire.
afterAll(() => {
  delete process.env.NKAP_WORD_DB;
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
});
