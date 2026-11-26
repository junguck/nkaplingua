# Brancher SAFINUM — mode d'emploi du middleware

> `apps/gateway` · 43 tests dédiés · une seule URL pour `ussd`, `mobile` et `web`.<br>
> Contrat et règles d'évaluation : [`SANDBOX-SAFINUM.md`](SANDBOX-SAFINUM.md).

## 1. Ce qui existe

```
passerelle SAFINUM ──POST──► apps/gateway ──X-Team-Key + X-Trace-Id──► API bancaire
                               │
                               ├─ ussd          menus, solde, transfert, frais, historique,
                               │                crédit, facture, aide, langue + texte libre
                               │                compris par @nkap/core (même moteur que web/mobile)
                               ├─ mobile / web  ui_translation (en, fub, repli fr déclaré)
                               └─ demo/         banque fictive aux mêmes routes, sans clé
```

| Fichier | Rôle |
| --- | --- |
| `src/bank.ts` | `SafinumBank` : en-têtes du tour sur chaque appel, délai 2,2 s, erreurs traduites |
| `src/ussd.ts` | dialogue à états : création `pending`, puis `confirm` **au tour suivant** ; statut de sortie conforme au §8 |
| `src/free-text.ts` | phrase libre → interprétation du moteur (`@nkap/core`) → point d'entrée du dialogue USSD |
| `src/language.ts` | détection du moteur + prudence du middleware (langues servies, écart net) |
| `src/ui.ts` | écrans : emplacements intacts, `max_chars` par clé, repli complet en `fr` |
| `src/demo/` | banque de démonstration (comptes, frais, `pending → confirm`) |
| `@nkap/safinum` | protocole, 13 intentions officielles, langues, grille de frais (seule copie), statuts |
| `@nkap/core` (GSM-7) | translittération ɓ ɗ ŋ ƴ ɛ ɔ ə, septets, troncature à 182 |

## 2. Local, sans clé

```bash
cd nkaplingua
pnpm --filter @nkap/gateway build                     # bundle esbuild : paquets du monorepo inclus

# terminal 1 : banque fictive
node apps/gateway/dist/demo/server.js                 # http://127.0.0.1:8788/api/v1

# terminal 2 : middleware
SAFINUM_TEAM_KEY=sbx_demo_local \
SAFINUM_BANK_URL=http://127.0.0.1:8788/api/v1 \
node apps/gateway/dist/server.js                      # http://127.0.0.1:8080

curl http://127.0.0.1:8080/health
```

Console de test : <http://127.0.0.1:8080/console> — pavé USSD, onglets mobile/web, choix de langue,
JSON de réponse, compteur de septets et scénario de transfert en quatre tours. Elle appelle le
middleware sur la même origine : pratique pour montrer la chaîne sans passer par la sandbox.

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

État au 26/11 : la sandbox répond, mais la clé enregistrée pour l'équipe est refusée
(`401 Clé d'API absente ou invalide`) sur toutes les routes bancaires, et `team_id: nkaplingua` donne
`422 Équipe inconnue` sur `/channel/*`. Il faut une clé `sbx_…` et un `team_id` confirmés par l'organisation.

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

**C'est la racine du middleware qu'on tunele** : `http://127.0.0.1:8080`, pas un sous-chemin. Le
middleware accepte `POST /` et `POST /middleware/{ussd|mobile|web}` avec le même contrat ; `/console`
reste servi pour la démonstration. Gardez `HOST=127.0.0.1` et `PORT=8080` : le tunnel s'occupe du reste.
L'URL gratuite change à chaque redémarrage du tunnel — il faut alors redéclarer les trois canaux.

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

## 4. Texte libre sur USSD

Le menu numéroté reste la voie principale. Toute autre saisie est confiée au moteur partagé :

| Saisie | Réponse |
| --- | --- |
| `Neldu ujineere jowi ka Aicha` | recherche du bénéficiaire, création `pending`, récapitulatif en fulfulde ; `1` au tour suivant confirme |
| `What is my balance?` | solde en anglais (`BALANCE_INQUIRY`) |
| `Envoie 3000` | demande du bénéficiaire (`CLARIFICATION_NEEDED`, `amount: 3000` visible du jury), aucun appel `POST` |
| `blabla` | message d'erreur + menu, jamais une intention inventée |

## 5. Détection de langue (`language: null`)

La passerelle peut envoyer `language: null` : c'est à nous de trancher. Ordre de priorité :

1. `language` explicite dans le tour (jamais contredit) ;
2. langue choisie par l'utilisateur au menu 8 (épinglée pour la session) ;
3. détection sur la saisie par le **détecteur du moteur** (`@nkap/core`), retenue seulement si la langue
   est servie en entier sur USSD (`fr`, `en`, `fub`) et avec un écart net sur la deuxième (≥ 2) ;
4. sinon la langue en cours, par défaut `fr`.

`dua`, `ewo`, `bas`, `bbj`, `byv` n'ont pas de catalogue USSD complet : on ne les sert pas à moitié, on
répond en français et `interpretation.language` vaut `fr`. Mieux vaut un repli déclaré qu'une fausse
détection. L'ewondo a des libellés proposés dans le moteur, mais il lui manque un catalogue de menus relu.

## 6. Règles à ne pas casser

1. `X-Trace-Id` recopié sur **chaque** appel bancaire, sinon `NO_BANK_CALL` (travail invisible).
2. Confirmation dans un tour **séparé**, avec un autre `trace_id`.
3. Intentions officielles uniquement, casse exacte, sinon `INVALID_RESPONSE`.
4. Aucune devinette : ambiguïté → `CLARIFICATION_NEEDED`.
5. USSD : 182 septets GSM-7 (translittérer, ne pas laisser passer ɛ ɔ ŋ ə).
6. Langue déclarée honnête : repli complet en `fr`, jamais un écran moitié traduit.
7. Jamais de code d'erreur bancaire brut à l'utilisateur.

Statut de transaction : par défaut, seulement `none` et `pending` (SANDBOX-SAFINUM §8). Une opération
confirmée renvoie `pending` avec l'identifiant de la transaction, une annulation renvoie `none` avec cet
identifiant. `SAFINUM_STATUS=lifecycle` renvoie le cycle brut (`confirmed`, `cancelled`, `failed`) : à
n'activer qu'après l'avoir vu accepté par la sandbox.

## 7. Dépannage

| Symptôme | Cause | Geste |
| --- | --- | --- |
| `422 Équipe inconnue` | `team_id` inconnu / pas de clé | vérifier `SAFINUM_TEAM_ID` et `.env` |
| `401 UNAUTHORIZED` (journaux) | clé refusée | recoller `SAFINUM_TEAM_KEY` |
| `UNSAFE_ENDPOINT` | URL non publique | relancer le tunnel et redéclarer |
| `CONFIG_LOCKED` | évaluation en cours | déclarer l'URL définitive avant le passage |
| `TIMEOUT` | banque lente | budget 3 s, coupure à 2,2 s |
| `INVALID_RESPONSE` | intention/statut hors contrat | `pnpm test` |
| Menu « Service momentanement indisponible » | banque injoignable : mode hors-ligne | relancer la banque ; sonde toutes les 15 s |
| `MISSING_STRINGS` / `UNTRANSLATED` | dictionnaire incomplet | compléter `src/ui-dictionaries.ts` |

## 8. Ce qui a été vérifié

- `pnpm test` : 139 tests (43 pour le gateway, dont 6 pour le mode hors-ligne et 8 pour le second regard), chaîne réelle middleware → HTTP → banque.
- `pnpm typecheck` : 9 projets verts.
- Bundle `dist/server.js` + banque de démo en HTTP : kit officiel (menu, solde, écran web), transfert en
  texte libre fulfulde créé au tour A puis confirmé au tour B, options dans la langue de l'écran.
- En-têtes `X-Team-Key` et `X-Trace-Id` observés côté banque, `trace_id` différent entre
  l'initiation et la confirmation.
- **Sandbox en direct : non testée** — la sandbox répond, mais refuse la clé d'équipe fournie (401, 26/11).

## 9. Mode hors-ligne (zones blanches)

Le middleware garde ses traductions en local (`TranslationCache`, garni au démarrage). Si la banque ne répond
pas, il répond depuis ce cache sans rien attendre.

- **Détection** : un `UNREACHABLE` de la banque passe en hors-ligne ; elle n'est ensuite sondée que toutes
  les 15 s (`Connectivity`).
- **USSD hors-ligne** : message d'indisponibilité + menu complet dans la langue du tour, GSM-7, 182 septets
  maximum, session ouverte. Un dialogue en cours repart du menu.
- **Corrections** : `gateway.correct(langue, clé, texte, max_chars, charset)` refuse une chaîne qui viole
  `max_chars`, le charset ou les emplacements `{x}` ; sinon elle vaut immédiatement (mobile/web comme USSD)
  et est mise en file. `gateway.sync()` rejoue la file au retour du réseau.
- **Options** (`new Gateway({ ..., offline: { cacheFile, sender, queue, connectivity } })`) : `cacheFile` =
  instantané relu au démarrage ; `sender(changes) => Promise<boolean>` = envoi réel. **Sans `sender`, la file
  attend** : SAFINUM ne documente aucun point de terminaison de synchronisation.

Essai local : arrêter la banque de démo (`pkill -f dist/demo/server.js`), envoyer `1` en USSD → menu de secours ;
relancer la banque → la réponse normale revient au plus tard 15 s après. Décision : [ADR 0005](adr/0005-mode-hors-ligne-ussd.md).
