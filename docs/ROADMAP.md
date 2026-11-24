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

## J1 — la passerelle et les canaux obligatoires

| P | Tâche | Livrable vérifiable |
|---|---|---|
| P0 | **Gateway NestJS** : `POST /v1/turns`, validation zod, CORS, health | `curl` → réponse + trace |
| P0 | **Canal USSD** : webhook `POST /channels/ussd` (format `sessionId, phoneNumber, text` → `CON …`/`END …`), menu de langue `*126#` | Simulateur USSD en navigateur qui l'appelle |
| P0 | **Flux des traces** : `GET /v1/traces` + SSE `GET /v1/traces/stream` | Le jury voit chaque tour en direct |
| P0 | **Adaptateur SAFINUM** dès réception de la doc (sinon : simulateur) | Même tests, autre backend |
| P1 | **Canal SMS** : webhook entrant + réponse ≤ 160 car. + alerte anti-arnaque | Démo « SOLDE » / « envoie 2000 a maman » |
| P1 | **Validation linguistique** : session avec les locuteurs, statuts mis à jour | Gabarits critiques en « validé » |

## J2 — les interfaces

| P | Tâche | Livrable vérifiable |
|---|---|---|
| P0 | **Web (Next.js + shadcn/ui)** : banque en ligne simulée + assistant intégré (texte + micro) | Parcours transfert complet en fulfulde |
| P0 | **Console jury** : traces en direct + **matrice de cohérence** (une requête → 6 canaux → comparaison) | §8 démontré en un clic |
| P0 | **Mobile (Expo / React Native)** : tableau de bord (solde, envoi, retrait, crédit, facture) + assistant, moteur embarqué hors ligne | APK de démo |
| P1 | **Bulle flottante Android** (module natif Kotlin : `SYSTEM_ALERT_WINDOW` + lecture d'écran à la demande) | Toucher la bulle sur une app tierce → fiche claire |
| P1 | **Extension navigateur** (présélection) branchée sur la gateway : panneau « demander » en plus de la superposition | Fonctionne sur les simulateurs web SAFINUM sans intégration |
| P2 | **Widget embarquable** `<script src=…/nkap-widget.js>` | Une institution l'ajoute en une ligne |

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
