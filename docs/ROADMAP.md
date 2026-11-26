# Roadmap — finale SAFINUM (3 jours)

**Règle d'or** : chaque soir, ce qui est sur `main` doit être démontrable. On coupe des fonctionnalités,
jamais la stabilité. **Gel des fonctionnalités : J3 à 14 h.**

Priorités : **P0** = sans ça on est éliminé · **P1** = ce qui fait gagner · **P2** = bonus si tout le reste est vert.

## J0 — soir (fait)

- [x] Brainstorm, recadrage, décisions d'architecture (`docs/BRAINSTORM.md`, `docs/adr/`)
- [x] Monorepo pnpm, TypeScript strict, Vitest
- [x] `@nkap/contracts` : intentions, paramètres, tours, traces jury, port financier, schémas zod
- [x] `@nkap/core` : normalisation, montants (FR/EN/pidgin/fulfulde), langue, intentions, dialogue à états, rendu multilingue verrouillé, formatage par canal
- [x] `@nkap/banking-sim` : comptes, contacts, grilles de frais, plafonds, idempotence, historique
- [x] **53 tests** dont les 10 scénarios du §7 joués de bout en bout

## J1 — le middleware SAFINUM (fait)

> La passerelle SAFINUM appelle NOTRE middleware pour `ussd`, `mobile` et `web` : c'est le chemin évalué.
> Détail et écarts : [`SANDBOX-SAFINUM.md`](SANDBOX-SAFINUM.md) ; mode d'emploi : [`GUIDE-SAFINUM.md`](GUIDE-SAFINUM.md).

| P | Tâche | Livrable vérifiable |
|---|---|---|
| ✅ P0 | **Port financier v2** : `initiate / update / confirm / cancel`, contexte de tour avec `X-Trace-Id` | `apps/gateway/src/bank.ts`, testé contre la banque de démonstration |
| ✅ P0 | **Adaptateur `SafinumBank`** (`X-Team-Key`, `X-Trace-Id`, `GET /fees`, `GET /beneficiaries`, erreurs → messages) | En-têtes vérifiés côté banque dans les tests |
| ✅ P0 | **Middleware** `POST /middleware/:channel` : contrat reçu → dialogue → réponse au format SAFINUM | 18 tests, dont la chaîne HTTP réelle |
| ✅ P0 | **Correspondance des intentions** + `CLARIFICATION_NEEDED` / `CORRECTION` | Aucune intention hors liste (vérifié par test) |
| ✅ P0 | **Sortie GSM-7** sur USSD (translittération ɓ ɗ ŋ ƴ ɛ ɔ ə, ponctuation, septets) | 182 septets vérifiés, options comprises |
| ✅ P0 | Grille de frais officielle dans `banking-sim` | 25 000 → 25 150 |
| ✅ P1 | **Mode hors-ligne USSD** : cache de traductions (max_chars, GSM-7/utf8), détection de panne, menu de secours, file de synchronisation | `apps/gateway/src/offline.ts`, 6 tests ; [ADR 0005](adr/0005-mode-hors-ligne-ussd.md). `sender` de synchro non branché |
| ⏳ P0 | Tunnel public + `POST /sandbox/endpoint` pour les 3 canaux | Outil prêt (`scripts/safinum.mjs`) ; **bloqué : aucune clé `sbx_…`** |
| P1 | Flux des traces en direct (console jury locale) | SSE |
| P1 | Validation linguistique fulfulde (+ duala ou ewondo) avec des locuteurs | Gabarits critiques « validé » |

## J2 — les interfaces

| P | Tâche | Livrable vérifiable |
|---|---|---|
| ✅ P0 | **Web (Next.js + shadcn/ui)** : banque en ligne simulée + assistant intégré (texte + micro) | Parcours transfert complet en fulfulde — vérifié (Playwright, bureau + téléphone) |
| P0 | **Console jury** : traces en direct + **matrice de cohérence** (une requête → 6 canaux → comparaison) | §8 démontré en un clic |
| ✅ P0 | **Mobile (Expo / React Native)** : tableau de bord (solde, envoi, retrait, crédit, facture) + assistant, moteur embarqué hors ligne | Bundle Hermes Android produit ; **APK à construire sur une machine avec SDK Android** |
| ✅ P2 | **Bulle flottante Android** (module natif Kotlin, lecture d'écran à la demande ; non évaluée par la sandbox) | Kotlin compilé contre Android 15 (`pnpm check:bubble`) ; **à valider sur appareil** |
| P1 | **Extension navigateur** (présélection) branchée sur la gateway : panneau « demander » en plus de la superposition | Fonctionne sur les simulateurs web SAFINUM sans intégration |
| P2 | **Widget embarquable** `<script src=…/nkap-widget.js>` | Une institution l'ajoute en une ligne |

Décisions J2 : [ADR 0004](adr/0004-clients-embarques-et-bulle-rendue-en-typescript.md). Reste à brancher
web et mobile sur la gateway dès qu'elle existe (un `NkapClient` HTTP, aucun écran ne change), et à
relever sur l'appareil les identifiants réels des applis MoMo / Orange Money pour la liste blanche.

## J3 — voix, finitions, démonstration

| P | Tâche | Heure limite |
|---|---|---|
| P1 | **SVI** : répondeur de la présélection branché sur le moteur (DTMF + synthèse), menus en fulfulde | 11 h |
| P2 | **GAB simulé** : retrait avec le code obtenu sur mobile | 12 h |
| P2 | Entrée vocale pidgin (STT `en-NG`) dans web + mobile | 13 h |
| — | **Gel des fonctionnalités** | **14 h** |
| P0 | Documentation finale (architecture, API OpenAPI, intégration, scalabilité) | 16 h |
| P0 | Répétition chronométrée ×3 avec scénarios **tirés au hasard** (le jury le fera) | 18 h |
| P0 | Vidéo de secours + build de secours hors ligne | 19 h |

## Correspondance livrables (§11) → fichiers

| Livrable attendu | Où |
|---|---|
| Prototype fonctionnel | `apps/*`, `packages/*` |
| Interopérabilité ≥ 3 canaux | mobile + web + USSD (+ SMS, SVI, GAB) |
| Architecture technique | `docs/ARCHITECTURE.md` |
| Technologie linguistique | `docs/ARCHITECTURE.md` §3 + `packages/core/src/lexicon` |
| Opération financière complète | test `jury-scenarios` n°2, démo transfert |
| Mécanisme d'intégration | `docs/ARCHITECTURE.md` §4 |
| Spécifications API | `docs/API.md` (J1, généré depuis zod) |
| Scalabilité et déploiement | `docs/ARCHITECTURE.md` §6 |

## Ce qu'on ne fera PAS (et on le dira)

- Agréger de vrais comptes MTN/Orange/banques (agrément, accès API).
- Lire l'écran en continu sur Android (sécurité, politique Play Store).
- Prétendre à une reconnaissance vocale fulfulde : Android, iOS et Chrome n'en fournissent pas (à revérifier J1 ; piste : modèles MMS / Omnilingual ASR de Meta côté serveur).

## Pistes d'innovation

Quatre idées non planifiées sont décrites dans [`INNOVATIONS.md`](INNOVATIONS.md) : corrections communautaires, alerte anti-arnaque par message, second regard, aller-retour de vérification.
