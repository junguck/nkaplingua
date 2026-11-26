import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACK_LOAD, USSD_REFERENCE } from '../src/i18n.js';
import { auditPack, loadPacks } from '../src/packs.js';
import { UI_DICTIONARIES } from '../src/ui-dictionaries.js';

const UI_REFERENCE = UI_DICTIONARIES.en ?? {};

function tempDir(files: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'packs-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), typeof body === 'string' ? body : JSON.stringify(body));
  return dir;
}

describe('packs de langue (translations/<code>.json)', () => {
  it('charge un pack valide, ignore les modèles « _ », refuse les fichiers incohérents', () => {
    const dir = tempDir({
      'dua.json': { language: 'dua', status: 'proposed', sources: ['test'], ui: { 'nav.home': 'X', 'vide': '' }, ussd: {} },
      '_modele.json': { language: 'xxx' },
      'ewo.json': { language: 'dua', status: 'proposed', ui: {}, ussd: {} },
      'bas.json': '{ pas du json',
      'pcm.json': { language: 'pcm', status: 'proposed', ui: {}, ussd: {} },
    });
    const load = loadPacks(dir);
    expect([...load.packs.keys()]).toEqual(['dua']);
    expect(load.packs.get('dua')?.ui).toEqual({ 'nav.home': 'X' }); // valeur vide = non traduite
    expect(load.rejected.map((r) => r.file).sort()).toEqual(['bas.json', 'ewo.json', 'pcm.json']);
  });

  it('signale les emplacements cassés, les clés inconnues et les phrases USSD trop longues', () => {
    const pack = {
      language: 'dua' as const,
      status: 'proposed' as const,
      sources: [],
      ui: { 'shell.greeting': 'Bonjour {nom}', 'cle.inconnue': 'x' },
      ussd: { balance: 'Solde {balance}.', 'menu.header': 'x'.repeat(200) },
    };
    const report = auditPack(pack, { ui: UI_REFERENCE, ussd: USSD_REFERENCE });
    expect(report.problems.join('\n')).toMatch(/shell\.greeting : emplacements nom ≠ name/);
    expect(report.problems.join('\n')).toMatch(/cle\.inconnue : clé inconnue/);
    expect(report.problems.join('\n')).toMatch(/menu\.header : plus de 182 septets/);
    expect(report.ussd.complete).toBe(false);
  });

  it('les packs livrés dans le dépôt sont tous valides (garde-fou du jour J)', () => {
    expect(PACK_LOAD.rejected).toEqual([]);
    for (const pack of PACK_LOAD.packs.values()) {
      expect(auditPack(pack, { ui: UI_REFERENCE, ussd: USSD_REFERENCE }).problems).toEqual([]);
    }
  });
});
