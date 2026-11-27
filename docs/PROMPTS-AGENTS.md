# Deux agents, deux périmètres — prompts prêts à coller

Deux agents qui travaillent **en parallèle sur le même dépôt** se marchent dessus pour trois
raisons : les mêmes fichiers, la même branche, la même doc. Ce document fixe les trois.

État de départ (27/11/2026) : les **six canaux** sont déclarés et répondent 200 en direct
([SIX-CANAUX](SIX-CANAUX.md)), 240 tests passent, le typecheck est vert sur 9 projets.

## Le contrat commun (à rappeler aux deux)

| Règle | Pourquoi |
| --- | --- |
| Un fichier = un seul propriétaire (tableaux ci-dessous) | deux écritures concurrentes = conflit à chaque commit |
| Une branche par agent, PR vers `main`, **jamais** de push direct sur `main` | l'autre peut relire et fusionner sans casser son travail |
| Si le dépôt utilise `noshane-main` comme branche d'intégration, remplacer `main` partout ci-dessous | une seule base par équipe |
| Rebase (`git pull --rebase origin main`) avant chaque push, jamais de `--force` | l'historique reste linéaire et partagé |
| Un besoin hors périmètre se **demande par écrit** dans `docs/coordination/` | pas d'édition croisée « vite fait » |
| Avant de pousser : `pnpm -r typecheck`, `pnpm test`, `pnpm --filter @nkap/gateway build` | la PR doit être verte, pas « presque » |
| La doc se met à jour **dans la même PR** que le code, puis on pousse | une PR sans doc est refusée |
| Jamais `.env`, jamais une clé, jamais le PASS du simulateur, jamais un jeton `X-Sandbox-Access` dans un fichier versionné | le dépôt peut être lu par le jury |

Fichiers partagés, et leur propriétaire :

| Fichier | Propriétaire | L'autre fait quoi |
| --- | --- | --- |
| `apps/gateway/src/server.ts`, `src/sms.ts`, `src/voice.ts`, `src/ivr.ts`, `src/atm.ts` | **A** | demande par note dans `docs/coordination/A-demande-B.md` |
| `README.md`, `apps/gateway/README.md`, `docs/PRESENTATION-CAPTURES.md`, `docs/presentation/**` | **B** | A demande l'ajout d'une ligne par note |
| `apps/gateway/data/langues.json`, `apps/gateway/translations/**` | **B** | A ne touche jamais une traduction |
| `apps/gateway/audio/**`, `docs/VOIX-MMS.md`, `docs/IVR-VOIX.md`, `docs/GUIDE-STUDIO-ENREGISTREMENT.md` | **A** | B cite, ne réécrit pas |
| `docs/SIX-CANAUX.md`, `docs/preuves/**` | **B** | A fournit la sortie brute, B la met en forme |
| `apps/gateway/scripts/six-canaux.mjs`, `scripts/canaux.mjs`, `scripts/scenarios.mjs` | **B** | A signale un canal cassé, B le scripte |

---

## Prompt 1 — Agent A : « Canaux, voix & contrats »

```
Tu travailles dans le dépôt nkaplingua (branche de départ : main, à jour).
Un second agent travaille en parallèle sur les langues, la présentation et les preuves :
tu ne touches JAMAIS à ses fichiers (voir périmètre). Si tu as besoin d'une modification
chez lui, écris la demande dans docs/coordination/A-demande-B.md et continue sans l'attendre.

CONTEXTE VÉRIFIÉ (27/11/2026, ne le re-découvre pas)
- Les six canaux sandbox (ussd, mobile, web, sms, atm, ivr) sont déclarés et répondent 200 :
  cf. docs/SIX-CANAUX.md et docs/preuves/six-canaux-2026-11-27.json.
- `POST /channel/*` exige le PASS : POST /api/v1/simulator/unlock {team_id: 10, pass} → {token},
  puis en-tête X-Sandbox-Access. team_id est un ENTIER. mobile/web/atm exigent `screen`.
- La banque réelle ne renvoie pas de solde après `confirm` : le middleware relit /accounts et
  n'annonce rien s'il ne peut pas lire (déjà corrigé, testé). Ne réintroduis pas `?? 0`.
- Les 23 écrans mobile/web/ATM répondent 200 avec `missing: []` en `en`, et les 47 clés `atm.*`
  sont dans `ui-dictionaries.ts` : cf. docs/preuves/ecrans-en-2026-11-27.json. Sur ATM, la sandbox
  envoie `strings` et attend une traduction d'écran (pas notre dialogue `POST /atm`).

MISSION
1. Vérifier le cycle transactionnel complet sur la sandbox : transfert confirmé, transfert annulé
   (`2` au récapitulatif), et solde relu correctement dans les deux cas.
2. Voix : garder la règle « jamais de voix française sur du fulfulde ». Si des clips humains sont
   déposés dans `audio/fub/`, les déclarer dans `audio/index.json` (engine: "human",
   model: "locuteurs") et vérifier qu'ils sortent dans POST /ivr.

PÉRIMÈTRE — tu peux modifier UNIQUEMENT :
  apps/gateway/src/server.ts        (routes /voix, /audio/*, /ivr, /atm, /health, dispatch des 6 canaux)
  apps/gateway/src/sms.ts  apps/gateway/src/ivr.ts  apps/gateway/src/atm.ts  apps/gateway/src/voice.ts
  apps/gateway/src/ui-dictionaries.ts (clés atm.* uniquement)
  apps/gateway/src/tools/tts-cli.ts  apps/gateway/scripts/tts.mjs  apps/gateway/scripts/tts_mms.py
  apps/gateway/audio/**              apps/gateway/test/voice.test.ts  apps/gateway/test/local-channels.test.ts
  apps/gateway/package.json          (uniquement la ligne "tts" dans scripts)
  docs/VOIX-MMS.md  docs/IVR-VOIX.md  docs/GUIDE-STUDIO-ENREGISTREMENT.md  docs/coordination/A-demande-B.md

INTERDIT : public/console.html, public/voix.html, docs/PRESENTATION-CAPTURES.md, docs/presentation/**,
docs/SIX-CANAUX.md, docs/preuves/**, data/langues.json, translations/**, scripts/six-canaux.mjs, README.md.

MÉTHODE
1. `pnpm --filter @nkap/gateway build` puis, pour tester sans tunnel :
   PORT=8080 HOST=127.0.0.1 ENABLE_V2_CHANNELS=1 SAFINUM_BANK_URL=https://safinum.cm/api/v1 node dist/server.js
2. Preuve en direct : SAFINUM_SIMULATOR_PASS=… node scripts/six-canaux.mjs (le PASS ne s'écrit jamais
   dans un fichier). Un canal cassé = 422/403 : regarde le champ `brut` de la preuve avant de deviner.
3. `pnpm -r typecheck && pnpm test && pnpm --filter @nkap/gateway build` : tout doit être vert.
4. METTRE À JOUR LA DOC dans la même PR : docs/VOIX-MMS.md (ce qui est réellement synthétisé),
   docs/IVR-VOIX.md (audio + montant), docs/GUIDE-STUDIO-ENREGISTREMENT.md (procédure réelle),
   et une ligne dans docs/SIX-CANAUX.md §6 si une limite tombe — par note à B si le fichier lui appartient.
5. COMMIT + PUSH :
   git switch -c feat/canaux-voix
   git add -A && git commit -m "Six canaux: cycle confirme/annule, voix sans invention"
   git pull --rebase origin main
   git push -u origin feat/canaux-voix
   puis ouvre la PR vers main (titre, corps : ce qui marche, ce qui manque, tests exécutés).

FINI QUAND : le cycle confirmé/annulé est prouvé sur la sandbox, les tests passent, la doc est à
jour, la branche est poussée et la PR ouverte avec son lien dans ta réponse finale.
```

---

## Prompt 2 — Agent B : « Langues, preuves & présentation »

```
Tu travailles dans le dépôt nkaplingua (branche de départ : main, à jour).
Un second agent travaille en parallèle sur les canaux, la voix et l'IVR : tu ne touches JAMAIS
à ses fichiers. Si tu as besoin d'un changement chez lui, écris docs/coordination/B-demande-A.md.

CONTEXTE VÉRIFIÉ (27/11/2026)
- Six canaux déclarés, 6/6 réponses 200 : docs/SIX-CANAUX.md, docs/preuves/six-canaux-2026-11-27.json.
- Les gabarits de packs joints (dua, ewo, bas, bbj, byv) sont VIDES : ce ne sont pas des packs.
- Aucun modèle MMS-TTS publié pour fub/dua/ewo/bas/bbj/byv (401) : ces langues n'ont pas de voix
  de synthèse. Google Translate ne les couvre pas non plus. On ne remplit donc PAS un pack par
  génération automatique : on prépare la séance de locuteurs (docs/GUIDE-STUDIO-ENREGISTREMENT.md).
- data/langues.json : 212 indices, 11 langues (fub 47, ewo 9, dua 5, bbj 4, bas 0, byv 0).

MISSION
1. Compléter docs/PRESENTATION-CAPTURES.md : une capture par canal (les six) et une par
   fonctionnalité, avec pour chacune « ce qu'on voit / ce qu'on raconte / ce que ça prouve ».
   Les captures des canaux USSD/SMS/IVR/ATM sont les réponses HTTP réelles (copiées depuis
   docs/preuves/six-canaux-*.json), pas des maquettes ; mobile/web/ATM peuvent être des captures
   d'écran du simulateur.
2. Ajouter un tableau « fonctionnalité → route → test → preuve » qui permette au jury de vérifier
   chaque promesse sans te croire.
3. Langues : prendre les 5 gabarits, les ranger dans docs/relecture/gabarits/ et documenter, pour
   chacun, ce qui manque (source écrite, locuteurs, volume). Ne remplir AUCUNE valeur inventée.
   Mettre à jour docs/LANGUES.md avec l'état réel (0/89 écrans pour les 5 langues).
4. README + apps/gateway/README.md : compteurs datés (240 tests, 9 typechecks, 6 canaux), liens
   vers SIX-CANAUX.md et GUIDE-STUDIO-ENREGISTREMENT.md. Aucun chiffre périmé.

PÉRIMÈTRE — tu peux modifier UNIQUEMENT :
  apps/gateway/public/console.html   apps/gateway/scripts/canaux.mjs   apps/gateway/scripts/scenarios.mjs
  apps/gateway/scripts/six-canaux.mjs   docs/PRESENTATION-CAPTURES.md   docs/presentation/**
  docs/preuves/**   docs/SIX-CANAUX.md   docs/LANGUES.md   docs/relecture/gabarits/**
  README.md   apps/gateway/README.md   docs/coordination/B-demande-A.md

INTERDIT : src/**, test/**, audio/**, data/langues.json (sauf ajout de mots validés par un locuteur),
docs/VOIX-MMS.md, docs/IVR-VOIX.md, docs/GUIDE-STUDIO-ENREGISTREMENT.md.

MÉTHODE
1. Démarrer le middleware (banque réelle) et refaire les parcours : une capture = une action réelle.
2. `SAFINUM_SIMULATOR_PASS=… node apps/gateway/scripts/six-canaux.mjs` doit sortir en code 0 ;
   coller sa sortie datée dans la section « vérifications ».
3. Vérifier que chaque JSON affiché correspond au tour (intention, langue, statut, septets,
   `report.missing` pour les écrans) — pas de copie d'une ancienne preuve.
4. METTRE À JOUR LA DOC dans la même PR, puis COMMIT + PUSH :
   git switch -c feat/presentation-six-canaux
   git add -A && git commit -m "Presentation: six canaux prouves, langues et langues sans source"
   git pull --rebase origin main
   git push -u origin feat/presentation-six-canaux
   puis ouvre la PR vers main.

FINI QUAND : chaque canal et chaque fonctionnalité a sa capture et sa ligne dans le tableau, aucun
chiffre de test n'est périmé, les 5 gabarits sont rangés et documentés, la doc est à jour, la
branche est poussée et la PR ouverte avec son lien.
```

---

## Comment ils coopèrent sans se bloquer

1. **Au démarrage** : chacun lit ce fichier et vérifie qu'il est sur `main` à jour.
2. **En cours** : s'il faut toucher un fichier de l'autre, note écrite dans `docs/coordination/`,
   puis on continue. La note dit : fichier, ligne, changement exact, raison, test à lancer.
3. **Avant le push** : rebase sur `main`. Un conflit dans un fichier de l'autre = on ne résout pas
   à la main, on applique la règle du propriétaire.
4. **Fusion** : l'humain fusionne A puis B (ou l'inverse) ; les périmètres disjoints rendent l'ordre
   indifférent — sauf `server.ts`, qui n'appartient qu'à A.
5. **Après fusion** : celui qui fusionne en dernier relance `pnpm test` sur `main` et B met les
   compteurs à jour dans `README.md`.
