# `@nkap/gateway` — middleware SAFINUM

Reçoit un tour de la passerelle SAFINUM, parle à l'API bancaire avec `X-Team-Key` et `X-Trace-Id`,
et répond au format du contrat. Une seule URL sert les trois canaux évalués.

| Canal | Route | Contenu |
| --- | --- | --- |
| `ussd` | `POST /middleware/ussd` | menus numérotés, solde, transfert, frais, historique, crédit, facture, aide, langue |
| `mobile`, `web` | `POST /middleware/mobile`, `POST /middleware/web` | `ui_translation` : écrans traduits en `en` et `fub`, repli `fr` déclaré |
| `ivr` | `POST /ivr` | **local**, hors contrat : DTMF (menu, solde, transfert, frais) |
| `atm` | `POST /atm` | **local**, hors contrat : carte, code, retrait multiple de 5 000 |

`POST /` accepte les mêmes tours que `/middleware/ussd` : c'est l'URL à tunneler. Les canaux locaux
ne sont servis que si `ENABLE_V2_CHANNELS=1`, sur des routes séparées, et ne sont jamais déclarés à la
sandbox.

## Démarrer

```bash
pnpm --filter @nkap/gateway build

node dist/demo/server.js        # banque fictive, 127.0.0.1:8788
node dist/server.js             # middleware, 127.0.0.1:8080

# avec les canaux locaux
ENABLE_V2_CHANNELS=1 SAFINUM_BANK_URL=http://127.0.0.1:8788/api/v1 \
SAFINUM_TEAM_KEY=sbx_demo_local node dist/server.js
```

- Console de test : <http://127.0.0.1:8080/console> — onglets USSD, mobile, web, IVR et ATM (langue de réponse, statut du pack et repli affichés)
- Base de mots dans le navigateur : <http://127.0.0.1:8080/langues-admin> (ajout de langue, de mot, poids, export, essai) — **locale uniquement**, `403` hors boucle locale
- Santé : `GET /health` · catalogue des langues : `GET /langues` · état de la base : `GET /api/langues`

## Tests

```bash
npx vitest run apps/gateway   # 128 tests : détection, IVR, ATM, base de mots, HTTP réel
pnpm --filter @nkap/gateway typecheck
```

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
```

## Tunnel

```bash
pnpm tunnel                    # quick tunnel (répétitions) : URL qui change
pnpm tunnel:named              # tunnel nommé (jour J) : URL figée, voir docs/TUNNEL-NOMME.md
```

Rejoue les dix scénarios du règlement sur la banque simulée et écrit, par tour : entrée, canal, intention,
paramètres, statut, langue de réponse, trace et durée.

## Documentation

- [`docs/GUIDE-ACTIONS-JOUR-J.md`](../../docs/GUIDE-ACTIONS-JOUR-J.md) : les dix actions humaines du jour J,
  commande par commande (build, démo, preuves, tunnel, simulateurs, tests, locuteurs, console, vidéo, répétition).
- [`docs/GUIDE-SAFINUM.md`](../../docs/GUIDE-SAFINUM.md) : clé, tunnel, déclaration, détection de
  langue, canaux locaux, correspondance avec le kit officiel.
- [`docs/SANDBOX-SAFINUM.md`](../../docs/SANDBOX-SAFINUM.md) : contrat et règles d'évaluation.
- `vendor/safinum-starter-node/` : kit officiel conservé tel quel, pour référence.
