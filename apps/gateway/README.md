# `@nkap/gateway` — middleware SAFINUM

Reçoit un tour de la passerelle SAFINUM, parle à l'API bancaire avec `X-Team-Key` et `X-Trace-Id`,
et répond au format du contrat. Une seule URL sert les **six** canaux ouverts par la sandbox.

| Canal | Route (sandbox → ici) | Contenu |
| --- | --- | --- |
| `ussd` | `POST /channel/ussd` → `POST /` | menus numérotés, solde, transfert, frais, historique, crédit, facture, aide, langue |
| `mobile`, `web` | `POST /channel/{mobile,web}` → `POST /` | `ui_translation` : 89 clés d'écran en `en` et `fub`, repli `fr` déclaré |
| `sms` | `POST /channel/sms` → `POST /` | même dialogue que l'USSD, réponse découpée GSM-7 / UCS-2 (160/70 puis 153/67) |
| `atm` | `POST /channel/atm` → `POST /` | traduction des 11 écrans (`atm_welcome`…`atm_end`, 47 clés `atm.*`) |
| `ivr` | `POST /channel/ivr` → `POST /` | texte à prononcer, et audio seulement si un clip correspond exactement |

`POST /` dispatche sur `channel` : c'est l'URL à tunneler. `POST /middleware/<canal>` est l'alias
explicite du même contrat. `POST /ivr` et
`POST /atm` restent des **vues locales de démonstration** (dialogue DTMF, retrait simulé), servies
seulement si `ENABLE_V2_CHANNELS=1` ; elles ne remplacent pas les canaux `ivr`/`atm` du contrat, qui
répondent sur la même URL que les quatre autres.

## Démarrer

```bash
pnpm --filter @nkap/gateway build

node dist/demo/server.js        # banque fictive, 127.0.0.1:8788
node dist/server.js             # middleware, 127.0.0.1:8080

# avec les canaux locaux
ENABLE_V2_CHANNELS=1 SAFINUM_BANK_URL=http://127.0.0.1:8788/api/v1 \
SAFINUM_TEAM_KEY=sbx_demo_local node dist/server.js
```

- Console de test : <http://127.0.0.1:8080/console> — cinq onglets (USSD, mobile, web, IVR, ATM) ; le SMS passe par le même menu, sans onglet dédié (langue de réponse, statut du pack et repli affichés)
- Base de mots dans le navigateur : <http://127.0.0.1:8080/langues-admin> (ajout de langue, de mot, poids, export, essai) — **locale uniquement**, `403` hors boucle locale
- Santé : `GET /health` · catalogue des langues : `GET /langues` · état de la base : `GET /api/langues`

## Tests

```bash
npx vitest run apps/gateway   # 141 tests : détection, six canaux, écrans ATM, base de mots, HTTP réel
pnpm --filter @nkap/gateway typecheck
```

Dernier contrôle daté (27/11/2026) : **141 tests** pour la passerelle, **242** pour tout le dépôt,
**9** projets typecheckés.

## Langues et mots — la base `data/langues.json`

Une langue ou un mot s'ajoutent **sans toucher au code** :

```bash
pnpm --filter @nkap/gateway lang liste                  # langues, mots reconnus, pack, repli
pnpm --filter @nkap/gateway lang ajouter bas --nom Basaa --alias bassa
pnpm --filter @nkap/gateway lang mot bas CHECK_BALANCE "ndap" 3
pnpm --filter @nkap/gateway lang tester "parle-moi en bassa"
pnpm --filter @nkap/gateway lang verifier                # code 1 si un problème
```

Le lexique TypeScript reste la référence ; la base s'y ajoute. `lang exporter <code>` fait venir la langue
entièrement du fichier (seul moyen de supprimer un mot intégré). Une base invalide est refusée en entier et
signalée dans `/health` et `/langues`.

La même chose existe dans le navigateur, pour un linguiste qui ne veut pas de terminal :
`/langues-admin` (ajouter une langue, corriger un alias, changer un poids, exporter, essayer une phrase).
Chaque écriture est validée en bloc puis appliquée immédiatement au moteur.

### Fiche de relecture pour deux locuteurs

```bash
pnpm --filter @nkap/gateway i18n fiche fub   # → docs/relecture/fub.md (phrases + mots + signatures)
```

La fiche liste ce que le middleware affiche réellement, avec deux colonnes de verdict et une case de
correction : c'est le support de la séance de relecture, pas une traduction inventée.

## Preuves

```bash
# dix scénarios du règlement, par le vrai serveur HTTP
node apps/gateway/scripts/scenarios.mjs --out docs/preuves/jour-j.json

# un parcours sur chaque canal : ussd, mobile, web, ivr, atm
node apps/gateway/scripts/canaux.mjs --out docs/preuves/canaux.json

# sandbox réelle (PASS dans l'environnement, jamais sur disque)
SAFINUM_SIMULATOR_PASS=… node scripts/six-canaux.mjs             # six canaux + cycle
SAFINUM_SIMULATOR_PASS=… node scripts/six-canaux.mjs --parcours  # 11 parcours par fonctionnalité
SAFINUM_SIMULATOR_PASS=… node scripts/ecrans.mjs --langue en     # 23 écrans, missing: []
```

Les réponses brutes sont dans `docs/preuves/six-canaux-2026-11-27.json`,
`docs/preuves/parcours-2026-11-27.json` et `docs/preuves/ecrans-en-2026-11-27.json` ; la synthèse est
dans [`docs/PRESENTATION-CAPTURES.md`](../../docs/PRESENTATION-CAPTURES.md).

## Tunnel

```bash
pnpm tunnel                    # quick tunnel (répétitions) : URL qui change
pnpm tunnel:named              # tunnel nommé (jour J) : URL figée, voir docs/TUNNEL-NOMME.md
```

## Documentation

- [`docs/GUIDE-ACTIONS-JOUR-J.md`](../../docs/GUIDE-ACTIONS-JOUR-J.md) : les dix actions humaines du jour J,
  commande par commande (build, démo, preuves, tunnel, simulateurs, tests, locuteurs, console, vidéo, répétition).
- [`docs/GUIDE-SAFINUM.md`](../../docs/GUIDE-SAFINUM.md) : clé, tunnel, déclaration, détection de
  langue, canaux locaux, correspondance avec le kit officiel.
- [`docs/SIX-CANAUX.md`](../../docs/SIX-CANAUX.md) : les six canaux et les onze parcours prouvés en
  direct, avec la marche à suivre du tunnel nommé.
- [`docs/GUIDE-STUDIO-ENREGISTREMENT.md`](../../docs/GUIDE-STUDIO-ENREGISTREMENT.md) : enregistrer les
  voix des langues sans modèle TTS (aucune voix inventée).
- [`docs/SANDBOX-SAFINUM.md`](../../docs/SANDBOX-SAFINUM.md) : contrat et règles d'évaluation.
- `vendor/safinum-starter-node/` : kit officiel conservé tel quel, pour référence.
