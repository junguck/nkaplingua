# Les six canaux, prouvés en direct (27/11/2026)

Ce document ne décrit pas ce qui *devrait* marcher : il recopie ce que la sandbox SAFINUM a
réellement renvoyé le 27/11/2026, entre 16 h 30 et 18 h, avec le middleware branché sur la
**vraie API bancaire** (`https://safinum.cm/api/v1`), pas sur la banque de démonstration.

## 1. Ce qui a été fait

| Étape | Résultat | Preuve |
| --- | --- | --- |
| Tunnel HTTPS | `https://weed-bulk-gibraltar-reports.trycloudflare.com` (quick tunnel) | `GET /health` → 200 en 0,62 s |
| Déclaration | **6 canaux sur 6** acceptés (200 chacun) | `GET /api/v1/sandbox/endpoint` |
| Chaîne solde | `681 145 FCFA`, `BALANCE_INQUIRY`, 1,2 s | tour USSD réel |
| Cycle transactionnel | `pending` → `confirmed`, même `TRX-3B6F6595B5`, frais 50 FCFA | 4 tours USSD réels |
| Les 6 canaux | **6/6 réponses 200** | `docs/preuves/six-canaux-2026-11-27.json` |

Le tunnel nommé n'a **pas** été possible : la machine n'a aucun certificat Cloudflare
(`~/.cloudflared` absent) et un tunnel nommé exige une connexion navigateur à un compte
Cloudflare **et un domaine dont on gère le DNS**. Le quick tunnel est le repli documenté ; son URL
change à chaque redémarrage, donc il ne peut pas être l'URL du jour J.

## 2. La table des endpoints, telle que la sandbox la renvoie

```
$ node apps/gateway/scripts/safinum.mjs status
200
team            shun and Co (shun-and-co)
mode            dev
locked          false
simulator_pass  JDN-NMM
channels        ussd, mobile, web, sms, atm, ivr
endpoints       atm    https://weed-bulk-gibraltar-reports.trycloudflare.com
                ivr    https://weed-bulk-gibraltar-reports.trycloudflare.com
                mobile https://weed-bulk-gibraltar-reports.trycloudflare.com
                sms    https://weed-bulk-gibraltar-reports.trycloudflare.com
                ussd   https://weed-bulk-gibraltar-reports.trycloudflare.com
                web    https://weed-bulk-gibraltar-reports.trycloudflare.com
```

Les six URL répondent : `GET /` → 200, `GET /health` → 200, `GET /langues` → 200, `GET /voix` → 200.

> **Correction de la documentation** : `docs/SANDBOX-SAFINUM.md` affirmait « sms, atm, ivr refusés
> pour l'instant ». C'est faux depuis l'ouverture du 27/11 : la sandbox liste les six canaux et
> accepte les six déclarations. Le statut de l'équipe `shun-and-co` (`id 10`) porte bien
> `["ussd","mobile","web","sms","atm","ivr"]`.

## 3. Un tour par canal (copie exacte)

Écrit par `apps/gateway/scripts/six-canaux.mjs` dans `docs/preuves/six-canaux-2026-11-27.json`.

| Canal | HTTP | Ce que le middleware a répondu |
| --- | --- | --- |
| `ussd` | 200 | `Safinum. Choisissez:` + les 8 entrées de menu |
| `mobile` | 200 | `translation.language = fr`, `strings` d'accueil complets (`nav.*`, `home.*`, `common.*`) |
| `web` | 200 | idem `mobile` |
| `sms` | 200 | même menu, `sms: {encoding: "gsm7", segments: 1}` |
| `atm` | 200 | écran `atm_welcome`, `strings` ATM servis (`atm.bank`, `atm.insert_card`…) |
| `ivr` | 200 | `Choisissez: 1. Solde 2. Envoyer 3. Frais 4. Historique 0. Quitter` |

Deux choses à savoir pour reproduire :

- **Le simulateur est verrouillé par un PASS.** `POST /channel/*` renvoie
  `403 SIMULATOR_LOCKED` sans lui. La séquence est :
  `POST /api/v1/simulator/unlock` `{ "team_id": 10, "pass": "…" }` → `{ token }`, puis l'en-tête
  **`X-Sandbox-Access: <token>`** sur chaque appel. Le jeton est un secret de session : il ne se
  commite pas, le script le garde en mémoire.
- **`team_id` est un entier** (10 pour `shun-and-co`), pas le slug. Le slug est refusé
  (`422 The team id field must be an integer`). La liste des équipes et de leurs canaux est dans
  les props de la page `/sandbox/ussd` (`teams[]`).
- `mobile`, `web` et `atm` exigent un champ **`screen`** : `home` pour mobile/web,
  et pour l'ATM l'un de `atm_welcome`, `atm_pin`, `atm_menu`, `atm_amount`, `atm_confirm`,
  `atm_cash`, `atm_receipt`, `atm_statement`, `atm_balance`, `atm_other`, `atm_end`.

## 4. La chaîne complète sur le scénario solde

```
> (menu)  200  "Safinum. Choisissez: 1. Mon solde 2. Envoyer de l'argent …"
> 1       200  "Votre solde est de 681 145 FCFA."
              intention = BALANCE_INQUIRY · langue = fr · statut = none · 1 238 ms
```

`681 145 FCFA` est le solde du compte de test `237650626114` renvoyé par `GET /accounts` côté
sandbox : le chiffre n'est pas calculé chez nous, il vient de la banque.

## 5. Le cycle transactionnel (pending → confirm)

```
> 2             200  "Numero du beneficiaire (9 chiffres):"        (CLARIFICATION_NEEDED)
> 237653397927  200  "Montant (FCFA):"                              (CLARIFICATION_NEEDED)
> 5000          200  "Envoi de 5 000 FCFA a 653397927 (653 397 927). Frais 50 FCFA.
                      Total 5 050 FCFA. 1. Confirmer 2. Annuler 3. Modifier"
                     statut = pending · id = TRX-3B6F6595B5
> 1             200  "5 000 FCFA envoye a 653397927 (653 397 927).
                      Ref TRX-3B6F6595B5. Solde 665 995 FCFA."
                     statut = confirmed · même id
```

- Les frais (50 FCFA pour 5 000) viennent de `GET /fees`, pas d'une table locale.
- La confirmation se fait **au tour suivant**, avec un autre `trace_id` : c'est la règle qui piège
  les équipes, et elle est respectée.
- **Défaut trouvé et corrigé pendant ce test** : la réponse de `confirm` ne contient **aucun
  solde**. Le code affichait `Solde 0 FCFA` (`?? 0`). Il relit maintenant `GET /accounts` après
  confirmation, et si la lecture échoue il n'annonce aucun solde (`done.transfer_nobalance`)
  au lieu de mentir. Vérifié : `665 995` = `681 145 − 5 050 (premier test) − 5 050 (second) − 5 050
  (sonde)`.

### Le même cycle, annulé

```
> 2 → 237653397927 → 5000   200  récapitulatif (statut = pending)
> 2                         200  "Operation annulee. Aucun montant debite."
                                statut = cancelled
```

Soldes relus par un tour USSD séparé : `639 495` avant, `634 445` après le transfert confirmé,
`634 445` après l'annulation — **écart 0**. Preuve datée : `docs/preuves/parcours-2026-11-27.json`
(parcours `transfert-confirme` et `transfert-annule`).

## 6. Tous les écrans, en anglais (23/23)

Les 23 écrans atteignables ont été rejoués en direct le 27/11 avec `language: "en"` :
6 écrans `mobile`, les 6 mêmes en `web`, et les 11 écrans ATM. Preuve brute :
`docs/preuves/ecrans-en-2026-11-27.json`, produite par `node scripts/ecrans.mjs --langue en`.
La même campagne a été rejouée en `fub` : `docs/preuves/ecrans-fub-2026-11-27.json`.

| Canal | Écrans | Rapport de traduction |
| --- | --- | --- |
| `mobile` | `home` (30 clés), `transfer` (28), `pay` (34), `review` (31), `receipt` (19), `history` (25) | 6/6 en 200, `missing: []` |
| `web` | mêmes écrans, 32/30/36/33/21/31 clés | 6/6 en 200, `missing: []` |
| `atm` | `atm_welcome` (6), `atm_pin` (6), `atm_menu` (8), `atm_amount` (11), `atm_confirm` (13), `atm_cash` (5), `atm_receipt` (9), `atm_statement` (15), `atm_balance` (7), `atm_other` (9), `atm_end` (5) | 11/11 en 200, `missing: []`, `over_limit: []`, `placeholder_errors: []` |

**Défaut trouvé et corrigé pendant ce test** : sur le canal ATM, la sandbox n'attend pas notre
dialogue local (`say` / `screen`), elle envoie les libellés de l'écran (`strings`) et attend la
**même traduction clé par clé que mobile/web**. Notre route renvoyait `handleAtm` : réponse
`INVALID_RESPONSE` et 47 clés `atm.*` marquées `missing`. Le dispatch ATM traduit maintenant
`strings` quand elles sont présentes (`server.ts`), et `POST /atm` garde le dialogue local
(carte, code, montant) hors contrat. Un test le verrouille dans `local-channels.test.ts`.

### Ce que le fulfulde sert réellement (mesuré le 27/11)

| Canal | Langue rendue | Clés présentes | Non traduites | Dépassements |
| --- | --- | --- | --- | --- |
| 6 écrans `mobile` | `fub` | 19/19 à 34/34 selon l'écran | aucune | aucun |
| 6 écrans `web` | `fub` | 21/21 à 36/36 selon l'écran | `shell.secure` (reste français, 6/6) | aucun |
| 11 écrans `atm` | **`fr`** | 5/5 à 15/15 selon l'écran | **toutes** (aucune clé fub) | `atm.error_step` 42 > 40 sur 3 écrans |

- Le dictionnaire fub couvre **88 clés sur 89** : `shell.secure` n'a pas d'équivalent relu et
  reste « Connexion sécurisée ». Elle n'est **pas** traduite ; la sandbox la compte `untranslated`
  sur les 6 écrans web, les seuls qui la demandent (les écrans mobile ne l'envoient pas). Les autres
  clés demandées sont bien en fulfulde, `missing: []`.
- Les 47 clés `atm.*` existent en `en`, **aucune** en fub. Par la règle de repli de `ui.ts` (0 clé
  traduite), l'écran ATM entier repart en `fr` et `language` vaut `fr` : le `translated: 6/6` du
  rapport est la complétude de l'écran **français**, pas une traduction fulfulde. Rien n'est inventé.
- Le repli ATM a une limite mesurée : `atm.error_step` fait 42 caractères en français pour un
  `max_chars` de 40 ; la sandbox signale `over_limit` sur `atm_amount`, `atm_confirm` et
  `atm_other`. En `en`, la traduction (33 caractères) passe.

Deux clés restent signalées `untranslated` par la sandbox parce que l'anglais est identique au
français (`review.service` = « Service », `history.col_date` = « Date ») : c'est 1 clé sur 31 et
sur 33, très loin du seuil de 25 % qui ferait basculer l'écran entier en `fr`.

## 7. Les onze parcours par fonctionnalité (11/11)

`node scripts/six-canaux.mjs --parcours` rejoue, sur la même URL déclarée, un parcours par
fonctionnalité et écrit `docs/preuves/parcours-<date>.json`. Exécution du 27/11/2026 (code 0) :

| Fonctionnalité | Réponse réelle | Statut |
| --- | --- | --- |
| Solde | `Votre solde est de 641 595 FCFA.` | `none` |
| Frais (25 000) | `frais 150 FCFA. Total 25 150 FCFA.` | `none` |
| Historique | `Vos dernieres operations: 27/11 transfer … bill … airtime …` | `none` |
| Terminologie | `Les frais sont ce que la banque retient pour executer une operation.` | `none` |
| Langue → fulfulde | `Demngal: fub. Safinum. Subo: …` | `LANGUAGE_SWITCH` |
| Crédit 1 000 | `Credit de 1 000 FCFA envoye au 650 626 114. Ref TRX-52A480950F.` | `confirmed` |
| Facture ENEO 1 000 | `Facture ENEO payee: 1 000 FCFA. Ref TRX-BA721D302D.` | `confirmed` |
| Transfert confirmé | `Ref TRX-2C97A08A2B. Solde 634 445 FCFA.` | `confirmed` |
| Transfert annulé | `Operation annulee. Aucun montant debite.` | `cancelled` |
| Solde par SMS | `Votre solde est de 634 445 FCFA.` · `gsm7`, 1 segment | `none` |
| Solde par IVR | `Votre solde est de 634 445 FCFA.` | `none` |

Le script reprend automatiquement sur `429` (quota du simulateur) : une preuve trouée ne vaut pas
une preuve. Il sort en code 1 si un seul tour n'a pas répondu 200.

## 8. Ce que ces tests ne prouvent pas

- **Pas de tunnel stable** : l'URL est un quick tunnel, elle mourra au prochain redémarrage.
- **Une seule langue de test** : les écrans ont été joués en `en`. Les 5 langues camerounaises
  restent au repli français tant qu'aucun pack n'est livré (voir `docs/LANGUES.md`).
- **L'ATM ne fait pas de retrait réel** : la sandbox n'a pas de route de retrait ; le dialogue
  local le dit dans chaque réponse (`simulation.bankRoute: "none"`).

## 9. Reproduire

```bash
# 1. middleware sur la vraie banque, six canaux, routes locales actives
cd apps/gateway
pnpm build
PORT=8080 HOST=127.0.0.1 ENABLE_V2_CHANNELS=1 \
  SAFINUM_BANK_URL=https://safinum.cm/api/v1 node dist/server.js

# 2. tunnel (quick, pour une répétition)
cloudflared tunnel --url http://127.0.0.1:8080 --no-autoupdate

# 3. déclaration des six canaux + relecture
node scripts/safinum.mjs declare https://<tunnel>.trycloudflare.com
node scripts/safinum.mjs status

# 4. preuve des six canaux (PASS dans l'environnement, jamais dans un fichier versionné)
SAFINUM_SIMULATOR_PASS=… node scripts/six-canaux.mjs

# 5. tous les écrans mobile/web/ATM, en anglais (23 appels, un seul déverrouillage)
SAFINUM_SIMULATOR_PASS=… node scripts/ecrans.mjs --langue en

# 6. onze parcours par fonctionnalité, solde et cycle confirmé/annulé compris
SAFINUM_SIMULATOR_PASS=… node scripts/six-canaux.mjs --parcours
```

Les scripts écrivent `docs/preuves/six-canaux-<date>.json`, `docs/preuves/ecrans-<date>.json` et
`docs/preuves/parcours-<date>.json`, et sortent en code 0 seulement si tous les appels répondent 200.
`ecrans.mjs` imprime aussi, écran par écran, `traduit=n/n` et la liste des clés `missing`,
`over_limit` ou aux emplacements cassés. `--parcours` reprend sur `429` au lieu de rendre une preuve
incomplète.
