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

## 6. Ce que ce test ne prouve pas

- **Pas de tunnel stable** : l'URL est un quick tunnel, elle mourra au prochain redémarrage.
- **Les écrans ne sont prouvés que sur `home` et `atm_welcome`** : les autres écrans
  (`transfer`, `pay`, `review`, `receipt`, `history`, et le reste de l'ATM) n'ont pas encore été
  joués en direct.
- **Les clés `atm.*` ne sont pas traduites** : la sandbox en envoie 47 (`atm.bank`, `atm.key_withdraw`,
  `atm.pin_title`…). Elles n'existent ni dans `ui-dictionaries.ts` ni dans `data/langues.json`, donc
  le rapport de traduction les marque `missing` et l'écran retombe en français. C'est visible dans
  la preuve (`report.missing`), et c'est honnête : mieux vaut un repli déclaré qu'un faux gala.
- **Une seule langue par écran** : `language` était `fr`. Les 5 langues camerounaises restent au
  repli français tant qu'aucun pack n'est livré (voir `docs/LANGUES.md`).
- **L'ATM ne fait pas de retrait réel** : la sandbox n'a pas de route de retrait ; la simulation
  le dit dans chaque réponse (`simulation.bankRoute: "none"`).

## 7. Reproduire

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
```

Le script écrit `docs/preuves/six-canaux-<date>.json` et sort en code 0 seulement si les six canaux
répondent 200.
