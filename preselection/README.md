# NkapLingua — la finance dans nos langues

**Livrables — SAFINUM Innovate Challenge 2026 (CNEF · Salon de la Finance Numérique, Yaoundé)**

Ce dossier contient les cinq livrables demandés par le règlement. Tout est reproductible sur un
ordinateur ordinaire, sans compte, sans serveur, sans clé d'API.

| # | Livrable attendu | Fichier / dossier |
|---|---|---|
| 1 | Description succincte de la solution et du problème résolu | [`01-description-solution.md`](01-description-solution.md) · PDF dans `PDF/` |
| 2 | Prototype fonctionnel / démonstration technique reproductible | [`02-prototype/`](02-prototype/) — `nkaplingua-extension-v1.1.0.zip` + `INSTALLATION-ET-DEMO.md` |
| 3 | Vidéo de démonstration (≤ 3 min) | [`03-video/`](03-video/) — `nkaplingua-demo.mp4` (**sonorisé, 2:19**) + `nkaplingua-demo.webm` (muet) + `script-voix-off.md` |
| 4 | Note technique : architecture, intégration, dépendances, limites | [`04-note-technique/NOTE-TECHNIQUE.md`](04-note-technique/NOTE-TECHNIQUE.md) · PDF dans `PDF/` |
| 5 | Langues prises en charge et méthode de validation linguistique | [`05-langues-et-validation.md`](05-langues-et-validation.md) · PDF dans `PDF/` |

**Versions PDF prêtes à déposer** : dossier [`PDF/`](PDF/)

- **`NkapLingua-dossier-complet.pdf`** — le dossier de présentation complet (**16 pages**) : problème, solution,
  fonctionnalités, parcours réel, architecture, chaîne de traitement, intégrité et sécurité, langues et validation,
  preuves, installation, vidéo, limites, feuille de route, livrables. C'est le document à lire en premier.
- Les cinq documents séparés (index, description, prototype, script vidéo, note technique, langues),
inspirés de la même charte, générés par `tools/build-pdfs.py` + `tools/render-pdfs.mjs`.

## En une phrase

NkapLingua est une extension de navigateur qui **lit n'importe quelle interface financière telle qu'elle
s'affiche** — mobile money, banque, microfinance, message d'alerte — et **superpose une explication en
langue camerounaise**, sans modifier le service, sans envoyer une seule donnée, et **sans jamais altérer un
montant, un nom, un numéro ou un avertissement**.

## Preuves mesurées (dernière exécution, 13 novembre 2026)

```
npm test                     19/19 tests moteur OK
node tests/ui-check.mjs      40/40 vérifications OK · 0 problème console/réseau
site réel https://safinum.cm/hackathon-test
                             HTTP 200 · notes superposées · parcours Frais → Bénéficiaire →
                             Récapitulatif (25 000 + 375 = 25 375 FCFA) → Transfert effectué
                             250 000 FCFA affiché à l'identique · aucune erreur console
vidéo                        H.264 + AAC, 1280×720, 2:18.7, voix française neuronale
```

## Ce qu'il faut savoir avant de présenter

- Les traductions marquées **◌ proposé** doivent être validées par deux locuteurs natifs (Studio
  linguistique) avant toute démonstration officielle — voir livrable 5.
- La **voix fulfulde** n'existe qu'à partir des enregistrements faits dans le Studio : aucune synthèse
  vocale fulfulde n'existe dans les navigateurs. Les montants, eux, sont toujours dits correctement en
  français (voir livrable 4, §7).
- La vidéo est **sonorisée en français** (voix neuronale `fr-FR-DeniseNeural`). La voix off du répondeur
  et des notes reste, elle, dépendante de la langue : français facile tant que les locuteurs n'ont pas
  enregistré.

## Arborescence

```
livrables/
├── 00-LISEZ-MOI.md
├── 01-description-solution.md
├── 02-prototype/   INSTALLATION-ET-DEMO.md · nkaplingua-extension-v1.1.0.zip
├── 03-video/       nkaplingua-demo.mp4 · nkaplingua-demo.webm · plateau.html
│                   script-voix-off.md · audio/ · assets/ (17 captures réelles)
├── 04-note-technique/NOTE-TECHNIQUE.md
├── 05-langues-et-validation.md
└── PDF/            6 documents prêts à déposer
```
