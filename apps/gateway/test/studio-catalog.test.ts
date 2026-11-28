import { afterEach, describe, expect, it } from 'vitest';
import { USSD_REFERENCE, message, resolveLanguage, servedLanguages } from '../src/i18n.js';
import { clearStudioCatalog, setStudioTranslation, studioVoiceFor } from '../src/studio-catalog.js';
import { translate } from '../src/ui.js';

afterEach(() => clearStudioCatalog());

describe('traductions validées dans le studio', () => {
  it("l'emportent phrase par phrase sur le catalogue intégré", () => {
    const before = message('fub', 'menu.balance');
    setStudioTranslation('fub', 'ussd.menu.balance', 'Ceede am');
    expect(message('fub', 'menu.balance')).toBe('Ceede am');
    expect(message('fub', 'menu.fees')).not.toBe(before);
  });

  it("une langue nouvelle n'est servie qu'une fois TOUTES ses phrases validées", () => {
    const keys = Object.keys(USSD_REFERENCE);
    for (const key of keys.slice(0, -1)) setStudioTranslation('bas', `ussd.${key}`, `bas ${key}`);
    expect(resolveLanguage('bas')).toBe('fr');
    setStudioTranslation('bas', `ussd.${keys.at(-1) ?? ''}`, 'dernière');
    expect(resolveLanguage('bas')).toBe('bas');
    expect(servedLanguages()).toContain('bas');
  });

  it("l'emportent aussi sur les écrans, emplacements compris", () => {
    setStudioTranslation('en', 'ui.nav.home', 'Start');
    const reply = translate({ 'nav.home': { text: 'Accueil', context: 'Onglet', max_chars: 12 } }, 'en');
    expect(reply.strings['nav.home']).toBe('Start');
  });

  it('voix validée : jouée seulement pour la phrase exacte', () => {
    setStudioTranslation('fub', 'ussd.menu.help', 'Wallu', '0123456789abcdef01234567');
    expect(studioVoiceFor('fub', ' wallu ')).toBe('0123456789abcdef01234567');
    expect(studioVoiceFor('fub', 'Wallu am')).toBeNull();
    expect(studioVoiceFor('dua', 'Wallu')).toBeNull();
  });

  it('ignore une clé qui ne désigne ni le dialogue ni un écran', () => {
    expect(setStudioTranslation('fub', 'autre.cle', 'x')).toBe(false);
  });
});
