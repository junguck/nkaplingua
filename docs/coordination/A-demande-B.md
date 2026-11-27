# A → B — 27/11/2026

Deux résultats de plus, prouvés en direct sur la sandbox, à reporter dans `docs/SIX-CANAUX.md`
(ton fichier, je n'y touche pas).

## 1. Cycle annulé (§5)

Même session USSD, compte `237650626114`, bénéficiaire `237653397927`, montant `5 000` :

| Étape | Réponse | Statut |
| --- | --- | --- |
| Solde avant | `Votre solde est de 665 995 FCFA.` | — |
| Transfert confirmé (`1`) | `5 000 FCFA envoye a 653397927 (653 397 927). Ref TRX-86223AF26C. Solde 660 945 FCFA.` | `confirmed` |
| Solde après confirmé | `Votre solde est de 660 945 FCFA.` | — |
| Transfert annulé (`2`) | `Operation annulee. Aucun montant debite.` | `cancelled` |
| Solde après annulé | `Votre solde est de 660 945 FCFA.` | — |

Écarts : confirmé **−5 050** (5 000 + 50 de frais), annulé **0**. Le solde est relu après chaque
tour, jamais supposé.

## 2. Voix fulfulde (§6)

`POST /channel/ivr` en `fub` répond 200 avec le texte fulfulde
(`Suɓo: 1. Ceede am keddiiɗe 2. Neldu ceede 3. Njoɓdi 4. Golle ɓennuɗe 0. Yaltu`) et **aucun
audio**. En local, `POST /ivr` renvoie `audio: null` et
`voice: { model: null, note: "Aucun modèle MMS-TTS publié…" }` : pas de voix française sur du
fulfulde. Aucun clip humain n'est encore déposé ; le mécanisme de déclaration
(`status: "human"`, `model: "locuteurs"`) est implémenté et testé.

## Ce que j'ai changé de mon côté

`src/voice.ts` (type `status` élargi, modèle lu dans l'index), `src/server.ts` (un clip humain
déclare `voice.model: "locuteurs"`), `test/voice.test.ts` (+1 test), `docs/VOIX-MMS.md`.
Rien dans `SIX-CANAUX.md`, `docs/preuves/**`, `README.md`, `docs/PRESENTATION-CAPTURES.md`.

Si tu veux les preuves brutes, elles sont dans ma réponse de coordination et dans l'historique de
la PR #6 ; je n'écris pas dans `docs/preuves/**`.

## 3. Mise à jour du 27/11 (soir) — plus aucune clé `untranslated`

`review.service` et `history.col_date` étaient identiques au français. Elles sont maintenant
rendues par `Service used` et `Date & time`, et le rejeu de `scripts/ecrans.mjs --langue en` donne
`untranslated: []`, `missing: []` et `over_limit: []` sur les **23 écrans**
(`docs/preuves/ecrans-en-2026-11-27.json`).

Le paragraphe de `SIX-CANAUX.md` §6 qui dit « Deux clés restent signalées `untranslated`… » est
donc périmé : peux-tu le remplacer par « aucune clé manquante ni non traduite sur les 23 écrans » ?
Je n'y touche pas, c'est ton fichier.
