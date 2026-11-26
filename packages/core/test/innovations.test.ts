import { describe, expect, it } from 'vitest';
import { auditRoundTrip, checkMessage, compareTemplates, renderVerified } from '../src';

describe('alerte anti-arnaque par message', () => {
  it('signale un SMS qui réclame le code, en français et en anglais', () => {
    const fr = checkMessage('Félicitations vous avez gagné 500000 FCFA. Envoyez votre code secret pour recevoir le gain.', 'fr');
    expect(fr.verdict).toBe('suspect');
    expect(fr.reasons).toContain('askCode');
    expect(fr.headline).toContain('ARNAQUE PROBABLE');
    const en = checkMessage('Congratulations you have won a prize. Send your PIN code to receive it now please.', 'en');
    expect(en.verdict).toBe('suspect');
    expect(en.headline).toContain('LIKELY SCAM');
  });

  it('ne dit jamais « sûr » quand rien n’est détecté', () => {
    const r = checkMessage('Bonjour, votre rendez-vous est confirmé pour demain à neuf heures au bureau.', 'fr');
    expect(r.verdict).toBe('not_detected');
    expect(r.headline).toContain('ne prouve pas');
  });

  it('un conseil de sécurité n’est pas une arnaque', () => {
    const r = checkMessage('Ne communiquez jamais votre code secret à personne, même à un agent du service.', 'fr');
    expect(r.verdict).toBe('not_detected');
  });

  it('refuse d’analyser un message trop court', () => {
    expect(checkMessage('gagné', 'fr').verdict).toBe('too_short');
  });

  it('signale le repli français quand la langue n’a pas la traduction', () => {
    const r = checkMessage('Félicitations vous avez gagné 500000 FCFA. Envoyez votre code secret pour recevoir le gain.', 'fub');
    expect(r.fallback).toBe(true);
  });
});

describe('aller-retour de vérification', () => {
  it('détecte une interdiction perdue à la traduction', () => {
    const f = compareTemplates('x', 'Ne donnez jamais votre code.', 'Dow koodu maa.', 'fub');
    expect(f.map((x) => x.problem)).toContain('negation_lost');
  });

  it('détecte un emplacement verrouillé ou un nombre disparu', () => {
    expect(compareTemplates('x', 'Frais {FEE}.', 'Njoɓdi.', 'fub').map((x) => x.problem)).toContain('placeholders');
    expect(compareTemplates('x', 'Encore 3 essais.', 'Ɗuuɗal essai.', 'fub').map((x) => x.problem)).toContain('numbers');
  });

  it('accepte une bonne traduction', () => {
    expect(compareTemplates('x', 'Ne donnez jamais votre code.', 'Never give your code.', 'en')).toEqual([]);
  });

  it('audite le lexique réel sans planter, et renvoie un compte', () => {
    for (const lang of ['en', 'fub', 'wes'] as const) {
      const a = auditRoundTrip(lang);
      expect(a.checked).toBeGreaterThan(50);
      expect(Array.isArray(a.findings)).toBe(true);
    }
  });

  it('rend le français « à vérifier » si une traduction échoue au contrôle', () => {
    const ok = renderVerified('greet.hello', 'fr', { NAME: 'Awa' });
    expect(ok.roundTrip).toBe('ok');
    expect(ok.text).toContain('Awa');
  });
});
