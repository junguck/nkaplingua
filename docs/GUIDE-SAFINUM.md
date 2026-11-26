# Brancher SAFINUM — mode d'emploi du middleware

> `apps/gateway` · 18 tests dédiés · une seule URL pour `ussd`, `mobile` et `web`.<br>
> Contrat et règles d'évaluation : [`SANDBOX-SAFINUM.md`](SANDBOX-SAFINUM.md).

## 1. Ce qui existe

```
passerelle SAFINUM ──POST──► apps/gateway ──X-Team-Key + X-Trace-Id──► API bancaire
                               │
                               ├─ ussd          menus, solde, transfert, frais, historique,
                               │                crédit, facture, aide, langue
                               ├─ mobile / web  ui_translation (en, fub, repli fr déclaré)
                               └─ demo/         banque fictive aux mêmes routes, sans clé
```

| Fichier | Rôle |
| --- | --- |
| `src/bank.ts` | `SafinumBank` : en-têtes du tour sur chaque appel, délai 2,2 s, erreurs traduites |
| `src/ussd.ts` | dialogue à états : création `pending`, puis `confirm` **au tour suivant** |
| `src/ui.ts` | écrans : emplacements intacts, `max_chars` par clé, repli complet en `fr` |
| `src/intents.ts` | nos intentions → les 13 intentions officielles |
| `src/fees.ts` | grille officielle (repli si `GET /fees` échoue) |
| `src/gsm7.ts` | translittération ɓ ɗ ŋ ƴ ɛ ɔ ə, septets, troncature à 182 |
| `src/demo/` | banque de démonstration (comptes, frais, `pending → confirm`) |

## 2. Local, sans clé

```bash
cd nkaplingua
pnpm --filter @nkap/gateway build

# terminal 1 : banque fictive
node apps/gateway/dist/demo/server.js                 # http://127.0.0.1:8788/api/v1

# terminal 2 : middleware
SAFINUM_TEAM_KEY=sbx_demo_local \
SAFINUM_BANK_URL=http://127.0.0.1:8788/api/v1 \
node apps/gateway/dist/server.js                      # http://127.0.0.1:8080

curl http://127.0.0.1:8080/health
```

Payloads du kit officiel (adaptés au compte de démo `237699000003`) :

```bash
curl -s -X POST http://127.0.0.1:8080/middleware/ussd -H "Content-Type: application/json" -d @apps/gateway/samples/ussd-1-menu.json
curl -s -X POST http://127.0.0.1:8080/middleware/ussd -H "Content-Type: application/json" -d @apps/gateway/samples/ussd-2-solde.json
curl -s -X POST http://127.0.0.1:8080/middleware/web  -H "Content-Type: application/json" -d @apps/gateway/samples/ui-accueil-en.json
```

Comptes fictifs : `237699000003` Fadimatou (250 000) · `237690000002` Aicha (80 000) ·
`237677000001` Paul (12 000) · `237655000004` Démo (100 000).

## 3. Brancher la sandbox

### 3.1 La clé (seul prérequis manquant aujourd'hui)

```bash
cp apps/gateway/.env.example apps/gateway/.env
# SAFINUM_TEAM_KEY=sbx_...        ← remise par l'organisation, jamais commitée
# SAFINUM_BANK_URL=https://safinum.cm/api/v1
```

Sans clé, la sandbox répond `422 Équipe inconnue` (constaté le 26/11 : `teams: []`).

### 3.2 Une URL publique

`localhost` est refusé (`UNSAFE_ENDPOINT`).

```bash
cloudflared tunnel --url http://localhost:8080   # ou : ngrok http 8080
```

### 3.3 Déclarer les trois canaux

```bash
SAFINUM_TEAM_KEY=sbx_... SAFINUM_TEAM_ID=nkaplingua \
  node apps/gateway/scripts/safinum.mjs declare https://mon-tunnel.example

SAFINUM_TEAM_KEY=sbx_... node apps/gateway/scripts/safinum.mjs status
```

Une seule URL sert les trois canaux : le middleware aiguille sur `type: "ui_translation"`.

### 3.4 Tester

- Simulateurs : <https://safinum.cm/sandbox/ussd>, `/sandbox/channel/mobile`, `/sandbox/channel/web`.
- En ligne de commande :

```bash
node apps/gateway/scripts/safinum.mjs turn ussd ""        # menu
node apps/gateway/scripts/safinum.mjs turn ussd "1"       # solde
node apps/gateway/scripts/safinum.mjs ui web              # écran (fub par défaut)
```

## 4. Règles à ne pas casser

1. `X-Trace-Id` recopié sur **chaque** appel bancaire, sinon `NO_BANK_CALL` (travail invisible).
2. Confirmation dans un tour **séparé**, avec un autre `trace_id`.
3. Intentions officielles uniquement, casse exacte, sinon `INVALID_RESPONSE`.
4. Aucune devinette : ambiguïté → `CLARIFICATION_NEEDED`.
5. USSD : 182 septets GSM-7 (translittérer, ne pas laisser passer ɛ ɔ ŋ ə).
6. Langue déclarée honnête : repli complet en `fr`, jamais un écran moitié traduit.
7. Jamais de code d'erreur bancaire brut à l'utilisateur.

`SAFINUM_STATUS_STRICT=1` n'émet que les statuts déjà observés (`none`, `pending`).

## 5. Dépannage

| Symptôme | Cause | Geste |
| --- | --- | --- |
| `422 Équipe inconnue` | `team_id` inconnu / pas de clé | vérifier `SAFINUM_TEAM_ID` et `.env` |
| `401 UNAUTHORIZED` (journaux) | clé refusée | recoller `SAFINUM_TEAM_KEY` |
| `UNSAFE_ENDPOINT` | URL non publique | relancer le tunnel et redéclarer |
| `CONFIG_LOCKED` | évaluation en cours | déclarer l'URL définitive avant le passage |
| `TIMEOUT` | banque lente | budget 3 s, coupure à 2,2 s |
| `INVALID_RESPONSE` | intention/statut hors contrat | `pnpm test` |
| `MISSING_STRINGS` / `UNTRANSLATED` | dictionnaire incomplet | compléter `src/ui-dictionaries.ts` |

## 6. Ce qui a été vérifié

- `pnpm test` : 91 tests (18 pour le gateway), chaîne réelle middleware → HTTP → banque.
- `pnpm typecheck` : 8 projets verts.
- En-têtes `X-Team-Key` et `X-Trace-Id` observés côté banque, `trace_id` différent entre
  l'initiation et la confirmation.
- **Sandbox en direct : non testée**, aucune clé d'équipe disponible.
