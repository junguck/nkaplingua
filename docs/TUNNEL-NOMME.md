# Tunnel nommé — URL figée pour le jour J

Un **quick tunnel** (`*.trycloudflare.com`) change d'URL à chaque redémarrage : inutilisable le
jour J, puisqu'une URL déjà déclarée à la sandbox ne peut plus être remplacée. Le tunnel **nommé**
garde la même adresse pour toujours (par exemple `https://nkap.votredomaine.cm`).

Deux choses sont à faire : une **préparation humaine** (une seule fois, ~15 min) puis un
**lancement** (30 s), automatisé par `scripts/tunnel-named.mjs`.

---

## 1. Préparation (une fois, par un humain)

Prérequis : `cloudflared` installé (`cloudflared --version`), et **un domaine dont vous gérez le
DNS chez Cloudflare** (`exemple.cm`). Un tunnel nommé ne peut pas être créé sur un domaine que
vous ne possédez pas.

```bash
# 1. Connexion au compte Cloudflare (ouvre le navigateur, choisit la zone du domaine)
cloudflared tunnel login

# 2. Création du tunnel : le nom sert seulement à vous y retrouver
cloudflared tunnel create nkaplingua

# 3. Nom d'hôte fixe : la commande crée l'enregistrement CNAME chez Cloudflare
cloudflared tunnel route dns nkaplingua nkap.exemple.cm

# 4. Vérification : le tunnel existe et son UUID est affiché
cloudflared tunnel list
```

Deux façons de lancer ce tunnel, au choix :

| Méthode | Ce qu'il faut garder | Où le mettre |
| --- | --- | --- |
| **Jeton** (recommandé) | Cloudflare → Zero Trust → Networks → Tunnels → *nkaplingua* → **Configure → Token** | `CLOUDFLARE_TUNNEL_TOKEN` dans `apps/gateway/.env` (gitignoré) |
| **Certificat local** | `~/.cloudflared/<UUID>.json` + `config.yml` avec `tunnel:` et `ingress:` | la machine du jour J |

Le jeton est un secret : il ne se committe pas, ne se colle pas dans le chat, et ne se met pas
dans une capture d'écran. Il remplace le certificat : sur une machine de secours, il suffit.

## 2. Lancement le jour J

```bash
cd apps/gateway
pnpm build
PORT=8080 HOST=127.0.0.1 ENABLE_V2_CHANNELS=1 node dist/server.js    # terminal 1

# terminal 2 — lance le tunnel, vérifie /health public, déclare les 3 canaux
CLOUDFLARE_TUNNEL_TOKEN=… PUBLIC_URL=https://nkap.exemple.cm pnpm tunnel:named
```

Le script :

1. refuse de démarrer si le middleware local ne répond pas sur `/health` ;
2. lance `cloudflared tunnel run` (jeton ou nom) ;
3. attend que **l'URL publique** réponde `{"ok":true}` (DNS + route) ;
4. déclare cette URL sur **les six canaux** (`ussd`, `mobile`, `web`, `sms`, `atm`, `ivr`) via
   `POST /sandbox/endpoint` — la sandbox les accepte tous depuis le 27/11 ;
5. garde le tunnel au premier plan : `Ctrl+C` l'arrête proprement.

Options utiles :

| Variable | Effet |
| --- | --- |
| `PUBLIC_URL` | URL figée à déclarer (obligatoire pour la déclaration) |
| `DECLARE=0` | lance seulement le tunnel, sans toucher aux canaux |
| `GATEWAY_URL` | autre port local (défaut `http://127.0.0.1:8080`) |
| `SAFINUM_API` | autre base d'API (défaut `https://safinum.cm/api/v1`) |

## 3. Vérifications avant de dire « c'est prêt »

```bash
curl -s https://nkap.exemple.cm/health          # {"ok":true,…}
curl -s https://nkap.exemple.cm/langues | head -c 200
node apps/gateway/scripts/safinum.mjs status     # les trois canaux pointent la même URL
```

Puis un tour de chauffe dans chaque simulateur SAFINUM (solde, transfert + confirmation, écran
d'accueil) : le panneau Diagnostics doit voir les appels bancaires, sans anomalie.

## 4. Ce qui reste vrai même avec un tunnel nommé

- **Le middleware doit tourner** : le tunnel ne sert que de transport. `Ctrl+C` sur le terminal 1
  coupe le service (relancer la même commande, l'URL ne change pas).
- **Les pages d'administration sont locales** : `/langues-admin` et `/api/langues` refusent toute
  requête qui n'arrive pas de `127.0.0.1`/`::1` (HTTP 403). Un tunnel public ne peut donc pas
  écrire dans `data/langues.json`, même si quelqu'un devine l'URL.
- **Le budget USSD reste de 3 s** : un tunnel nommé n'est pas plus rapide qu'un quick tunnel ; si
  les `TIMEOUT` reviennent, mesurer `curl -w '%{time_total}'` sur `/health` avant d'accuser le code.

## 5. Repli si le domaine ou Cloudflare est indisponible

- **ngrok avec domaine réservé** (payant) : `ngrok http --domain=nkap.ngrok.app 8080`, puis
  `PUBLIC_URL=https://nkap.ngrok.app DECLARE=0 pnpm tunnel:named` ne s'applique pas (ngrok lance
  son propre client) — déclarer à la main :
  `node apps/gateway/scripts/safinum.mjs declare https://nkap.ngrok.app`.
- **Machine de secours** : même commit, même jeton de tunnel, donc même URL. C'est tout l'intérêt
  du tunnel nommé ; copier `apps/gateway/.env` et le jeton la veille, sur un support chiffré.
- Le quick tunnel `pnpm tunnel` reste disponible pour les répétitions, jamais pour le passage.

## 6. État au 27/11/2026 — ce qui a été fait, ce qui bloque

- **Aucun certificat Cloudflare sur la machine** (`~/.cloudflared` absent) : `cloudflared tunnel list`
  échoue avec `Cannot determine default origin certificate path`. Un tunnel nommé n'est donc pas
  possible sans l'étape 1 (connexion navigateur + domaine DNS chez Cloudflare).
- **Repli utilisé** : quick tunnel `https://weed-bulk-gibraltar-reports.trycloudflare.com`, qui a
  servi à déclarer et tester les six canaux. Son URL mourra au prochain redémarrage : elle ne doit
  pas rester dans `GET /sandbox/endpoint` le jour J.
- **Rappel de la contrainte** : pendant l'évaluation, `POST /sandbox/endpoint` répond
  `409 CONFIG_LOCKED`. L'URL définitive doit être déclarée **avant** le passage, donc le tunnel
  nommé (ou ngrok à domaine réservé) n'est pas une option mais une nécessité.
- **Vérifier après déclaration** :

  ```bash
  node apps/gateway/scripts/safinum.mjs status   # six endpoints, même URL
  curl -s https://<url>/health                    # {"channels":["ussd","mobile","web","sms","atm","ivr"]}
  SAFINUM_SIMULATOR_PASS=… node apps/gateway/scripts/six-canaux.mjs   # 6/6 en 200
  ```
