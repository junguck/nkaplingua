# Kit de démarrage SAFINUM Innovate Challenge 2026 — Node.js

Un middleware qui **respecte déjà le contrat** de la sandbox, sur les deux sortes de canaux :

- **USSD** : menu, consultation du solde, transfert de crédit (vers son numéro ou un autre), avec récapitulatif puis confirmation dans un tour séparé.
- **Mobile et web** : traduction des écrans de l'application bancaire (`ui_translation`).

Il parle français. **Votre travail : la couche linguistique.** Le reste (format des réponses, appels à la banque, `X-Trace-Id`, sessions) est déjà fait.

Aucune dépendance à installer. Prérequis : Node.js 18 ou plus récent.

## 1. Lancer en local

```bash
cp .env.example .env        # puis collez votre clé d'équipe (sbx_...) dans SAFINUM_TEAM_KEY
node server.js
```

Vérification : ouvrez <http://localhost:8080> dans un navigateur, vous devez voir `{"ok":true,...}`.

## 2. Exposer une URL publique

La sandbox est sur Internet : elle ne peut pas joindre votre `localhost`. Ouvrez un tunnel :

```bash
cloudflared tunnel --url http://localhost:8080
# ou
ngrok http 8080
```

Notez l'URL `https://...` affichée. Les URL gratuites changent à chaque redémarrage du tunnel : refaites l'étape 3 à chaque fois.

## 3. Déclarer votre URL

```bash
curl -X POST https://safinum.cm/api/v1/sandbox/endpoint \
  -H "X-Team-Key: sbx_VOTRE_CLE" -H "Content-Type: application/json" \
  -d '{"channel": "ussd", "url": "https://VOTRE-TUNNEL"}'
```

Faites de même avec `"channel": "mobile"` et `"channel": "web"` : la même URL sert les trois canaux, le kit aiguille selon le champ `type` de la requête.

## 4. Tester

- **Dans le simulateur** : https://safinum.cm/sandbox/ussd (USSD), https://safinum.cm/sandbox/channel/mobile (mobile), https://safinum.cm/sandbox/channel/web (web). Composez le code, tapez `1` (solde) ou `2` (crédit), puis confirmez au tour suivant.
- **Sans la sandbox**, en envoyant vous-même un tour au kit :

```bash
curl -X POST http://localhost:8080 -H "Content-Type: application/json" -d @samples/ussd-1-menu.json
curl -X POST http://localhost:8080 -H "Content-Type: application/json" -d @samples/ussd-2-solde.json
curl -X POST http://localhost:8080 -H "Content-Type: application/json" -d @samples/ui-accueil-en.json
```

Dans les exemples USSD, remplacez `237690000000` par un numéro de vos comptes de test (liste dans le simulateur), sinon la banque répond "Compte introuvable", ce qui prouve tout de même que la chaîne fonctionne.

## 5. Brancher votre couche linguistique

| Fichier | Rôle | À modifier ? |
| ------- | ---- | ------------ |

| `language.js` | Votre couche linguistique : `understand()` et `say()` | **Oui** |
| `ussd.js` | Menus USSD, solde, crédit, confirmation | Non |
| `ui.js` | Traduction des écrans mobile et web | Non |
| `bank.js` | Appels à l'API bancaire (`X-Team-Key`, `X-Trace-Id`) | Non |
| `server.js` | Serveur HTTP, aiguillage USSD / écrans | Non |
| `translations/<langue>.json` | Traductions des écrans mobile et web, une clé par texte | **Oui** |
| `samples/` | Requêtes d'exemple de la passerelle | Non |

- **USSD** : `understand(texte, langue)` ramène la saisie de l'utilisateur à un choix de menu ; `say(texte, langue)` traduit chaque phrase française du kit et **renvoie la langue réellement utilisée**.
- **Mobile et web** : `translations/en.json` est fourni en exemple, complet. Créez `translations/dua.json`, `ewo.json`, etc. avec les mêmes clés. Les textes source arrivent dans chaque requête (`strings.<clé>.text`, avec `context` et `max_chars`).

## Ce que la sandbox vérifie (et que le kit respecte déjà)

1. **`X-Trace-Id`** : recopié sur chaque appel bancaire. Sans lui, le jury ne voit aucun de vos appels.
2. **Confirmation dans un tour séparé** : l'opération est créée, l'utilisateur lit le récapitulatif, puis confirme au tour suivant.
3. **Intentions de la liste officielle** uniquement (`BALANCE_INQUIRY`, `AIRTIME_PURCHASE`, `CONFIRM`...). Une faute de casse rend la réponse invalide.
4. **USSD** : 182 caractères au plus, alphabet GSM-7. Les lettres ɛ ɔ ŋ ə et l'apostrophe courbe ne passent pas sur un vrai réseau ; le kit l'affiche dans la console.
5. **Langue déclarée honnête** : sans traduction, déclarez `fr`. Renvoyer du français en déclarant `dua` est repéré.
6. **Écrans** : emplacements `{amount}`, `{name}` intacts, `max_chars` respecté, clés absentes remplacées par le français (et signalées).
7. **Délais** : 3 secondes pour un tour USSD, 10 secondes pour un écran.

Documentation complète : https://safinum.cm/sandbox/docs
