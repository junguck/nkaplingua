# Roadmap — ce qui reste à faire

**État au 26/11/2026** : `work/hausa` intègre maintenant le middleware SAFINUM et les correctifs de conformité de la branche `upstream/ccr-1ced25dd-1kjima`, tout en conservant les ajouts locaux. Les tâches ci-dessous restent des critères à démontrer, pas des fonctionnalités présumées validées en sandbox.

**Règle d'or** : ce qui est sur `main` doit être démontrable à tout moment. On coupe des fonctionnalités,
jamais la stabilité. **Gel des fonctionnalités : J3 à 14 h.**

Priorités : **P0** = sans ça on est éliminé · **P1** = ce qui fait gagner · **P2** = bonus si tout le reste est vert.
Ce qui est livré est décrit dans le [README](../README.md) et les [ADR](adr/) ; cette page ne liste que le restant.

## P0 — bloquant pour l'évaluation

| Tâche | Bloqué par | Fait quand |
|---|---|---|
| **Clé d'équipe `sbx_…` et `team_id` valides** | Organisation SAFINUM : la clé fournie le 26/11 est refusée (`401`), `team_id: nkaplingua` est inconnu (`422`) | `node apps/gateway/scripts/safinum.mjs status` répond `200` |
| **Test en direct sur la sandbox** (3 canaux) | clé ci-dessus | Simulateurs USSD, mobile et web sans `INVALID_RESPONSE`, `NO_BANK_CALL` ni `TIMEOUT` ; `X-Trace-Id` visible dans le journal du jury |
| **Valider le statut de transaction** renvoyé après confirmation et annulation | clé ci-dessus | La sandbox accepte le cycle du kit officiel (`confirmed`, `cancelled`, défaut) ; sinon `SAFINUM_STATUS=contract` |
| **Tunnel public + `POST /sandbox/endpoint`** pour `ussd`, `mobile`, `web` | clé ci-dessus | `GET /sandbox/endpoint` renvoie nos URL — **avant** le passage (`CONFIG_LOCKED` pendant l'évaluation) |
| **Packs de langue relus par deux locuteurs** : écrans (89 clés) puis USSD (56 phrases) pour **dua, ewo, bas, bbj, byv** ; relecture des formes fulfulde critiques | Locuteurs à recruter ; aucune source écrite accessible pour bas et byv ([LANGUES](LANGUES.md)) | `pnpm --filter @nkap/gateway i18n verifier` vert ; la langue tirée par le jury est servie ou repliée en `fr` déclaré |
| **Préparer le jour J** : tunnel nommé, machine de secours, vidéo de secours, rôles | — | Déroulé [JOUR-J](JOUR-J.md) répété une fois |
| **Spécification API** (`docs/API.md`, générée depuis zod) et documentation finale | — | Livrable §11 « Spécifications API » |
| **Répétition chronométrée ×3** avec les dix scénarios de la sandbox ([SANDBOX §10](SANDBOX-SAFINUM.md)) et une langue tirée au sort | clé ci-dessus | Trois passages sans incident dans le panneau Diagnostics |

## P1 — ce qui fait gagner

| Tâche | Détail |
|---|---|
| **Unifier le dialogue USSD et le `DialogueManager` du moteur** | Port financier v2 dans `@nkap/contracts` (`initiate / update / confirm / cancel` + contexte `X-Trace-Id`), le moteur l'utilise, le middleware délègue son dialogue au moteur ([ADR 0006](adr/0006-middleware-sur-le-moteur-partage.md)) |
| **Console jury locale** : traces en direct (SSE) + matrice de cohérence (une requête → 6 canaux) | Démonstration du §8 ; le tableau de bord évalué reste celui de SAFINUM |
| **Brancher web et mobile sur le middleware** | Endpoint `POST /v1/turns` côté gateway + `NkapClient` HTTP ; aucun écran ne change (ADR 0004) |
| **Étendre la compréhension** (mots-clés) en duala, ewondo, ghomala, basaa, medumba | Sources imprimées à consulter (Njock, Domche-Téko, Tsala…) ou locuteurs ; conversion de la police du dictionnaire ghomala ([LANGUES](LANGUES.md)) |
| **SVI** : répondeur de la présélection branché sur le moteur (DTMF + synthèse), menus en fulfulde | |
| **Extension navigateur** branchée sur la gateway : panneau « demander » sur les simulateurs web SAFINUM | |
| **Synchronisation hors-ligne** : brancher le `sender` de `SyncQueue` | Aucun point de terminaison documenté par SAFINUM à ce jour ([ADR 0005](adr/0005-mode-hors-ligne-ussd.md)) |
| **Second regard** : envoi réel des SMS au proche (`Notifier`), saisie du proche et du seuil par l'utilisateur, balayage périodique `sweep()` | Implémenté et testé, désactivé par défaut ([INNOVATIONS](INNOVATIONS.md) §3) |
| **Alerte anti-arnaque par message** : écran web et entrée SMS, textes fulfulde et pidgin | `checkMessage` existe dans le moteur ; repli français signalé en attendant ([INNOVATIONS](INNOVATIONS.md) §2) |
| **Boîte à corrections communautaire** | À arbitrer ([INNOVATIONS](INNOVATIONS.md) §1) |

## P2 — bonus

| Tâche | Détail |
|---|---|
| APK de démonstration + validation de la bulle sur un appareil Android 14+ | Nécessite une machine avec SDK Android (`pnpm android`) |
| Liste blanche de la bulle : identifiants réels des applis MoMo / Orange Money | Relevés sur l'appareil (`adb shell pm list packages`), jamais devinés |
| GAB simulé : retrait avec le code obtenu sur mobile | |
| Entrée vocale pidgin (STT `en-NG`) dans web et mobile | |
| Widget embarquable `<script src=…/nkap-widget.js>` | |
| Glossaire haoussa : relecture + phrases `ph.*` | 65 entrées « proposées » issues d'audio transcrit |

## Correspondance livrables (§11) → état

| Livrable attendu | Où | Reste |
|---|---|---|
| Prototype fonctionnel | `apps/*`, `packages/*` | test en direct sur la sandbox |
| Interopérabilité ≥ 3 canaux | middleware `ussd` + `mobile` + `web` | déclaration des 3 URL |
| Architecture technique | `docs/ARCHITECTURE.md`, `docs/adr/` | — |
| Technologie linguistique | `docs/ARCHITECTURE.md` §3, `packages/core/src/lexicon` | validation par des locuteurs |
| Opération financière complète | test `jury-scenarios` n°2, transfert en texte libre du middleware | rejouer sur la sandbox |
| Mécanisme d'intégration | `docs/ARCHITECTURE.md` §4, `docs/GUIDE-SAFINUM.md` | — |
| Spécifications API | `docs/API.md` | **à écrire** |
| Scalabilité et déploiement | `docs/ARCHITECTURE.md` §6 | — |

## Ce qu'on ne fera PAS (et on le dira)

- Agréger de vrais comptes MTN/Orange/banques (agrément, accès API).
- Lire l'écran en continu sur Android (sécurité, politique Play Store).
- Prétendre à une reconnaissance vocale fulfulde : Android, iOS et Chrome n'en fournissent pas (piste : modèles MMS / Omnilingual ASR de Meta côté serveur).
- Servir un écran USSD à moitié traduit : sans catalogue complet et relu, le middleware répond en français et le déclare (les écrans mobile/web suivent la règle clé par clé du kit, avec un seuil de 75 %).
