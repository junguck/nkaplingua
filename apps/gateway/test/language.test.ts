import { describe, expect, it } from 'vitest';
import { detectLanguage, resolveTurnLanguage } from '../src/index.js';

/**
 * Corpus de phrases réelles, relevées dans les échanges de test du jury et dans la vie
 * courante d'un client : ce sont des phrases entières, souvent **sans mot-clé** (`solde`,
 * `balance`, `ceede`). Un détecteur qui ne reconnaît que les mots-clés échoue ici.
 */
interface Phrase {
  readonly text: string;
  readonly language: 'fr' | 'en' | 'fub';
}

const CORPUS: readonly Phrase[] = [
  // ── Français ─────────────────────────────────────────────────────────────
  { text: 'Je voudrais envoyer un peu d’argent à ma sœur', language: 'fr' },
  { text: "C'est combien pour un envoi de dix mille francs ?", language: 'fr' },
  { text: "Bonjour, est-ce que vous pouvez m'aider ?", language: 'fr' },
  { text: 'Il me reste beaucoup sur le compte', language: 'fr' },
  { text: "Pouvez-vous me dire ce qu'il me reste ?", language: 'fr' },
  { text: 'Je ne sais pas comment faire', language: 'fr' },
  { text: 'Combien coûte un transfert vers Douala ?', language: 'fr' },
  { text: "J'ai besoin d'aide pour payer ma facture", language: 'fr' },
  { text: "Est-ce que l'opération a bien été enregistrée ?", language: 'fr' },
  { text: "Merci beaucoup, c'est tout pour moi", language: 'fr' },
  { text: 'Mon numéro de carte est le 677000001', language: 'fr' },
  { text: 'Je veux comprendre les frais de ce mois-ci', language: 'fr' },
  { text: "L'application me dit que le compte n'existe pas", language: 'fr' },

  // ── Anglais ──────────────────────────────────────────────────────────────
  { text: "I'd like to send some money to my sister", language: 'en' },
  { text: 'How much does it cost to send ten thousand?', language: 'en' },
  { text: 'Can you help me please?', language: 'en' },
  { text: 'There is not enough left on my account', language: 'en' },
  { text: 'What would you like to do today?', language: 'en' },
  { text: 'Please tell me my balance', language: 'en' },
  { text: 'I want to pay a bill for my mother', language: 'en' },
  { text: "Thanks, that's all for now", language: 'en' },
  { text: 'Do you know how long it takes?', language: 'en' },
  { text: 'My phone number is 677000001', language: 'en' },
  { text: 'I need to check the money I have left', language: 'en' },
  { text: 'The transfer did not go through', language: 'en' },

  // ── Fulfulde, écrit avec ses lettres ─────────────────────────────────────
  { text: 'Mi yiɗi anndude ceede am keddiiɗe', language: 'fub' },
  { text: 'No foti njoɓdi ndee?', language: 'fub' },
  { text: 'A waawi wallude lam?', language: 'fub' },
  { text: 'Mi yiɗi neldugol ceede seeɗa to banndiraawo am', language: 'fub' },
  { text: 'Ko woni e konte am jooni?', language: 'fub' },
  { text: 'Ceede ɗee ndokkaani', language: 'fub' },
  { text: 'Mi yiɗi tabbitinde golle ndee', language: 'fub' },
  { text: 'A jaɓɓaama, winndu limgal maa', language: 'fub' },

  // ── Fulfulde sans ɓ ɗ ŋ ƴ (clavier d'un téléphone ordinaire) ─────────────
  { text: 'Mi yidi anndude ceede am keddide', language: 'fub' },
  { text: 'No foti njobdi ndee', language: 'fub' },
  { text: 'A waawi wallude lam', language: 'fub' },
  { text: 'Ko woni e konte am', language: 'fub' },
  { text: 'Mi yidi neldugol ceede seeda', language: 'fub' },
];

describe('corpus réel fr / en / fub', () => {
  for (const phrase of CORPUS) {
    it(`reconnaît ${phrase.language} : « ${phrase.text} »`, () => {
      const guess = detectLanguage(phrase.text);
      expect(guess.language).toBe(phrase.language);
      expect(guess.confidence).toBeGreaterThanOrEqual(3);
      expect(guess.cues.length).toBeGreaterThan(0);
    });
  }
});

describe('garde-fous de la détection', () => {
  it('ne devine pas sur une saisie neutre', () => {
    expect(detectLanguage('2').confidence).toBe(0);
    expect(detectLanguage('').confidence).toBe(0);
    expect(detectLanguage('   ').confidence).toBe(0);
    expect(detectLanguage('5000').confidence).toBe(0);
  });

  it('ne devine pas les langues sans lexique fiable', () => {
    // duala, ewo, bassa, bamoun, bulu : aucune de ces langues n'est servie par le middleware.
    expect(detectLanguage('Mbolo, na banga njangi').confidence).toBe(0);
    expect(detectLanguage('Me tila nye anyi').confidence).toBe(0);
  });

  it('préfère la langue en cours quand deux langues se neutralisent', () => {
    const guess = detectLanguage('No', 'fr');
    expect(guess.language).toBe('fr');
    expect(guess.confidence).toBe(0);
  });

  it('une langue explicite ou choisie n’est jamais écrasée', () => {
    expect(resolveTurnLanguage({ requested: 'en', current: 'fr', source: 'user' }, 'Mi yiɗi ceede am')).toMatchObject({
      language: 'en',
      source: 'turn',
    });
    expect(resolveTurnLanguage({ current: 'fub', source: 'user' }, 'What is my balance?')).toMatchObject({
      language: 'fub',
      source: 'user',
    });
  });

  it('suit la langue en cours quand la saisie n’apporte aucun indice', () => {
    expect(resolveTurnLanguage({ current: 'en', source: 'detected' }, '3')).toMatchObject({
      language: 'en',
      confidence: 0,
    });
  });
});
