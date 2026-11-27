# Guide des actions humaines — les 10 gestes à faire, et comment les faire

> Ce guide ne décrit pas le logiciel : il décrit **ce qu'une personne doit faire, dans l'ordre**, avec la
> commande exacte, le résultat attendu et le piège à éviter. Chaque commande a été exécutée sur ce dépôt
> le 27/11/2026 (Windows, Git Bash) ; les chiffres cités viennent de ces exécutions.
>
> Conventions : toutes les commandes partent de `nkaplingua/`. Le middleware écoute sur `127.0.0.1:8080`,
> la banque simulée sur `127.0.0.1:8788`. La clé réelle `sbx_…` reste dans `apps/gateway/.env`
> (gitignoré) et n'apparaît **jamais** dans une commande tapée devant le jury.

---

## 1. Installer esbuild par le lockfile et produire le build gateway

**But** : un `dist/` reproductible, avec la version d'esbuild verrouillée (0.28.2), et rien d'autre.

```bash
cd nkaplingua
pnpm install --frozen-lockfile      # échoue si le lockfile ne correspond pas : c'est voulu
pnpm ls esbuild --depth 0           # doit afficher 0.28.2
pnpm --filter @nkap/gateway build
```

Résultat attendu (dernier contrôle) :

```
dist/server.js            596.7kb
dist/demo/server.js        13.2kb
dist/server.js.map         1.1mb
```

**Contrôles** :

```bash
ls -l apps/gateway/dist/server.js apps/gateway/dist/demo/server.js
ls apps/gateway/dist/translations        # les packs de langue suivent l'artefact
```

**Pièges** :
- `npm install esbuild` ou `pnpm add esbuild` **hors lockfile** : version différente, build non reproductible.
  Si le lockfile doit vraiment changer, c'est un commit séparé, relu.
- `tsc` seul ne suffit pas : les paquets `@nkap/*` sont publiés en TypeScript source, `dist/` ne démarrerait pas.
- Le build ne copie **pas** `public/console.html` ni `data/langues.json` : ils sont lus depuis `apps/gateway/`,
  donc on lance toujours `node apps/gateway/dist/server.js` (pas en déplaçant `dist/` seul sans ces dossiers).

---

## 2. Lancer la banque simulée et rejouer les 10 scénarios standards

**But** : rejouer les dix scénarios du règlement sans clé réelle et sans réseau.

```bash
# terminal 1 — banque simulée (accepte la clé sbx_demo_local)
node apps/gateway/dist/demo/server.js

# terminal 2 — middleware branché sur cette banque
SAFINUM_TEAM_KEY=sbx_demo_local \
SAFINUM_BANK_URL=http://127.0.0.1:8788/api/v1 \
node apps/gateway/dist/server.js

# navigateur
http://127.0.0.1:8080/console
```

Dans la console : onglet **USSD**, boutons « Scénario transfert / solde / crédit », ou saisie libre
(« Envoie 5000 à Aicha », « Combien de frais pour 25 000 ? », « Parle-moi en fulfulde »).
Pour un écran, passer sur l'onglet **Mobile** ou **Web** puis « Envoyer ».

Rejouer **les dix** scénarios d'un coup, sans cliquer :

```bash
node apps/gateway/scripts/scenarios.mjs
```

**Contrôles** : la dernière ligne doit être `✓ 10 scénarios rejoués, tous les tours en HTTP 200`.
Remise à zéro des soldes de la banque simulée :

```bash
curl -s -X POST -H 'X-Team-Key: sbx_demo_local' http://127.0.0.1:8788/api/v1/sandbox/reset
```

**Pièges** :
- Sans `SAFINUM_BANK_URL`, le middleware interroge la vraie sandbox et répond `UNAUTHORIZED` si la clé
  n'est pas définie : c'est le symptôme d'un `.env` absent, pas d'un bug.
- Si l'environnement définit déjà `PORT`, le middleware écoute ailleurs (vu sur ce poste : 57196). Forcer
  `PORT=8080 node apps/gateway/dist/server.js` et vérifier la ligne `a l'ecoute sur http://127.0.0.1:8080`.
- `SAFINUM_TEAM_KEY` doit être sur la **même ligne** que `node …` (ou exportée) : sinon le serveur démarre
  avec une clé vide et le dit dans `/health` (`teamKeyConfigured: false`).

---

## 3. Capturer une preuve par scénario (entrée, intention, paramètres, statut, trace, temps)

**But** : une trace vérifiable pour chaque tour, pas une capture d'écran.

```bash
pnpm --filter @nkap/gateway build
node apps/gateway/scripts/scenarios.mjs --out docs/preuves/jour-j.json
```

Le script écrit un JSON et affiche un tableau. Extrait réel du 27/11/2026 :

```
scénario        entrée                  intention        statut      trace              ms
2-transfert     Envoie 5000 à Aicha     TRANSFER         pending     2-transfert-t1…    48
2-transfert     1                       CONFIRM          confirmed   2-transfert-t2…    15
7-changement…   Parle-moi en fulfulde   LANGUAGE_SWITCH  pending     7-changement-…     12
```

Chaque tour du JSON contient : `entree`, `canal`, `langue_demandee`, `http`, `intention`, `parametres`,
`statut`, `langue_reponse`, `trace`, `ms`, `reponse`.

**Contrôles avant de montrer la preuve** :
- chaque `trace` est unique et correspond à ce que le journal du middleware affiche (`trace=… intent=… ms=…`) ;
- `parametres` contient bien le montant/frais/bénéficiaire **extraits**, jamais un montant inventé ;
- `statut` d'un transfert : `pending` au récapitulatif, `confirmed` **seulement** au tour suivant.

**Piège** : relancer le script réinitialise les scénarios mais **pas** la banque ; un solde insuffisant
attendu peut devenir un succès après plusieurs transferts. Relancer la banque (ou `sandbox/reset`) entre
deux campagnes de preuve.

---

## 4. Créer un tunnel nommé HTTPS et enregistrer les URL USSD, mobile et web

**But** : **une** URL stable, déclarée une fois, qui survit à un redémarrage.

```bash
# une seule fois (compte Cloudflare de l'équipe)
cloudflared tunnel login
cloudflared tunnel create nkaplingua
cloudflared tunnel route dns nkaplingua gateway.<votre-domaine>

# à chaque démarrage — variante scriptée : vérifie /health public PUIS déclare les 3 canaux
# CLOUDFLARE_TUNNEL=nkaplingua PUBLIC_URL=https://gateway.<votre-domaine> pnpm --filter @nkap/gateway tunnel:named
cloudflared tunnel run --url http://127.0.0.1:8080 nkaplingua
```

Détail (jeton Cloudflare, config.yml, dépannage DNS, machine de secours) : **`docs/TUNNEL-NOMME.md`**.
Le script `scripts/tunnel-named.mjs` fait la même chose que les commandes ci-dessous, mais s'arrête
proprement si l'URL publique ne répond pas — il ne déclare jamais une URL morte.

Puis déclarer les trois canaux et vérifier :

```bash
SAFINUM_TEAM_KEY=sbx_… node apps/gateway/scripts/safinum.mjs declare https://gateway.<votre-domaine>
SAFINUM_TEAM_KEY=sbx_… node apps/gateway/scripts/safinum.mjs status
curl -s https://gateway.<votre-domaine>/health
```

**Contrôles** : `status` renvoie nos trois URL (`ussd`, `mobile`, `web`) ; `/health` répond
`{"ok":true,…}` ; un tour USSD depuis le simulateur arrive dans le journal local.

**Pièges** :
- La base de mots ne s'administre **pas** à travers le tunnel : `/langues-admin` et `/api/langues`
  répondent `403` hors boucle locale. C'est voulu : un tunnel public ne doit jamais écrire le lexique.
- Un tunnel **rapide** (`trycloudflare.com`) change d'URL à chaque redémarrage : interdit le jour J
  (l'URL déclarée ne serait plus la bonne). `scripts/tunnel-stable.mjs` ne fait que **redéclarer** une URL
  rapide toutes les 10 s — utile en répétition, jamais pendant l'évaluation (la configuration est verrouillée).
- Ne déclarer que `ussd`, `mobile`, `web` : `ivr` et `atm` sont locaux, hors contrat.
- La clé ne se met **pas** dans la commande si on est filmé : `export SAFINUM_TEAM_KEY=$(grep … .env)` ou
  simplement `node … status` (le script lit `.env`).

---

## 5. Exécuter un parcours complet dans chaque simulateur SAFINUM avec un compte de test

**But** : prouver que la passerelle réelle nous atteint, sur les trois canaux.

1. Ouvrir `https://safinum.cm/sandbox/channel/ussd` (puis `/mobile`, `/web`).
2. Déverrouiller le simulateur : sélectionner l'équipe (`shun-and-co`, identifiant `10`), saisir le PASS
   affiché par `GET /api/v1/sandbox/endpoint` (champ `simulator_pass`), bouton « Activer ».
3. Choisir un **compte de test existant** dans la liste du simulateur (l'ancien `237699000003` n'existe que
   dans notre banque de démonstration ; la vraie banque répond `UNKNOWN_ACCOUNT`).
4. Jouer : menu → solde, puis transfert + confirmation ; sur mobile/web, demander la traduction de l'écran
   d'accueil (le simulateur envoie `ui_translation`).

**Contrôles** : le journal du middleware affiche chaque tour avec la **trace du simulateur** ; côté
simulateur, l'intention est officielle (`BALANCE_INQUIRY`, `TRANSFER`, `CONFIRM`…) et la langue déclarée
correspond à la langue affichée. Un écart « français affiché sous une étiquette `dua` » est le défaut à
signaler avant que le jury ne le voie.

**Piège** : `/channel/*` n'est **pas** notre route (404) ; les tours arrivent sur `/middleware/{canal}`.
Pendant le passage, `POST /sandbox/endpoint` répond `CONFIG_LOCKED` : tout se déclare **avant**.

---

## 6. Corriger les incohérences entre le nombre de tests documenté et le nombre exécuté

**But** : un seul chiffre vrai, partout, avec sa date.

Source de vérité :

```bash
pnpm test                 # 18 fichiers, 229 tests (27/11/2026)
```

Chiffres corrigés dans ce dépôt (mêmes valeurs que l'exécution) :

| Document | Avant | Après |
| --- | --- | --- |
| `README.md` (racine) | 154 tests | **229 tests** |
| `docs/GUIDE-SAFINUM.md` | 57 tests dédiés, 154 au total, 38 middleware | **128 tests gateway, 229 au total, 40 middleware** |
| `docs/PRESENTATION-TECHNIQUE.md` | 154 tests | **229 tests** |
| `apps/gateway/README.md` | 80 tests | **128 tests** |

**Règle** : toute modification de test met à jour ces quatre endroits dans le **même commit**. Un chiffre
sans date (« 218 tests ») est faux dès le lendemain : écrire « 218 tests au dernier contrôle (27/11/2026) ».

**Piège** : `pnpm test apps/gateway` (argument positionnel) exécute toute la suite avec ce script ; pour ne
lancer qu'un paquet, utiliser `npx vitest run apps/gateway`.

---

## 7. Faire relire les écrans Fulfulde prioritaires par deux locuteurs et enregistrer leur provenance

**But** : pouvoir dire, preuve en main, qui a relu quoi et quand.

```bash
# 1. produire le modèle complet (89 clés d'écran, 56 phrases USSD, français + anglais en regard)
pnpm --filter @nkap/gateway i18n modele

# 2. les locuteurs remplissent translations/fub.json (copie de _modele.json) :
#    - garder EXACTEMENT les emplacements {amount}, {name}…
#    - renseigner "sources" : ["Aïssatou B. (Ngaoundéré), 27/11/2026", "Oumarou D. (Garoua), 27/11/2026"]
#    - passer "status" à "validated" SEULEMENT après la seconde relecture

# 3. vérifier : couverture, emplacements intacts, 182 septets par phrase USSD
pnpm --filter @nkap/gateway i18n verifier
pnpm test
```

**Contrôles** : `i18n verifier` sort en code 0 et affiche `fub (validated) — écrans 89/89, USSD 56/56 :
SERVIE sur USSD`. Le champ `sources` d'un pack `validated` doit contenir **deux personnes distinctes**.

**Pièges** :
- Un pack `proposed` (un seul locuteur) ne se présente jamais comme « validé » ; le middleware le sert,
  mais le discours au jury doit dire « proposé, relu par un locuteur ».
- Une phrase USSD au-delà de 182 septets est refusée : raccourcir, ne pas « couper » le gabarit.
- Changer une phrase française change la référence : relancer `i18n verifier` après toute retouche de `fr`.

---

## 8. Afficher nettement la langue de réponse, son statut et le repli français dans la console de jury

**But** : que le jury voie la langue **et** l'honnêteté du repli, sans qu'on ait à l'expliquer.

Ouvrir `http://127.0.0.1:8080/console`. Chaque réponse affiche quatre indicateurs :

| Indicateur | Ce qu'il montre | Exemple |
| --- | --- | --- |
| `langue` | langue réellement servie + nom + statut du pack | `fub · Fulfulde · proposé` |
| `statut langue` | `servie` (vert) ou `repli français` (orange) | `servie` |
| `repli` | `aucun`, ou `fr (demandé : dua)` | `fr (demandé : dua)` |
| `septets GSM-7` | longueur réelle de la réponse USSD | `139 / 182 · GSM-7` |

Le sélecteur de langue est construit depuis `GET /langues`, qui donne pour chaque langue de la sandbox :
`mots` reconnus, `pack` (`intégré`/`proposed`/`validated`/`draft`/`absent`), `ecrans`, `ussd`
(`servi`/`repli fr`) et `sources`. C'est aussi ce que la vigie surveille :

```bash
curl -s http://127.0.0.1:8080/langues | head -40
```

**Ce qu'on dit au jury** quand la langue tirée n'a pas de pack complet : « Nous comprenons la demande —
regardez l'intention et les paramètres — mais nous n'avons pas de traduction relue par deux locuteurs en
`dua` ; nous répondons donc en français et nous le **déclarons** : la langue de réponse est `fr`. »

**Piège** : le statut affiché vient du **pack**, pas de l'intention. Un pack `draft` s'affiche `draft` :
ne pas le présenter comme validé.

---

## 9. Préparer une vidéo de secours courte (transfert, frais, confirmation, annulation)

**But** : 90 secondes qui sauvent la démonstration si le réseau tombe.

Plan de tournage (une seule prise, écran + voix) :

| Temps | Geste | Ce qui doit être lisible |
| --- | --- | --- |
| 0:00–0:10 | `/console`, onglet USSD | le menu numéroté, la langue `fr` |
| 0:10–0:30 | « Envoie 5000 à Aicha » | récapitulatif : 5 000, frais 50, total 5 050, statut `pending` |
| 0:30–0:45 | « Combien de frais pour 25 000 ? » | 150 FCFA, total 25 150 (frais recalculés, pas devinés) |
| 0:45–1:05 | retour au transfert, « 1 » | statut `confirmed`, solde après opération |
| 1:05–1:20 | nouveau transfert puis « 2 » | `cancelled`, « aucun montant débité » |
| 1:20–1:30 | `GET /langues` | statut des packs et repli français |

**Contrôles** : la vidéo se lit **hors ligne** (fichier local, pas un lien), le son est audible, le texte
USSD est lisible à 100 %. La copier sur la machine de secours et sur une clé USB.

**Piège** : ne pas filmer le `.env` ni un terminal où la clé apparaît. Filtrer la fenêtre avant
l'enregistrement.

---

## 10. Répéter la présentation chronométrée avec une langue et un scénario tirés au sort

**But** : que personne ne découvre en direct une langue sans pack.

```bash
# tirage : lister les langues de la sandbox et leur état
pnpm --filter @nkap/gateway lang liste

# essai à froid d'un énoncé dans la langue tirée
pnpm --filter @nkap/gateway lang tester "Mi yiɗi anndude ceede am keddiiɗe"

# la console de jury, avec la langue imposée (sélecteur) puis un scénario au hasard :
# transfert / frais / correction / solde insuffisant / changement de langue
http://127.0.0.1:8080/console
```

Déroulé chronométré (20 min) : ouverture 2 min → dix scénarios 12 min → replis et statuts 3 min →
clôture 2 min → marge 1 min. Chronométrer **deux fois** : une fois en `fub`, une fois en langue sans pack
(`dua`), pour répéter la phrase du repli.

**Contrôles** : `/health` (`teamKeyConfigured: true`) et `/langues` sont ouverts avant de commencer ;
`docs/preuves/jour-j.json` de la veille est à portée de main ; le chronomètre est visible du narrateur.

**Piège** : le tirage au sort porte sur les **huit** langues de la sandbox ; six n'ont pas de pack complet.
La répétition doit donc inclure au moins une langue en repli, sinon la première fois sera le jour J.

---

## Annexe A — Ajouter une langue ou des mots (la base de données `data/langues.json`)

Deux endroits, deux rôles :

| Où | Quoi | Qui modifie |
| --- | --- | --- |
| `packages/core/src/lexicon/*.lexicon.ts` | lexique de référence, avec ses sources en commentaire | développement, revu |
| `apps/gateway/data/langues.json` | **base vivante** : langues, alias, mots, poids | linguistes et dev, sans rebuild |
| `apps/gateway/translations/<code>.json` | réponses complètes (écrans + USSD) relues | deux locuteurs |

```bash
# voir l'état (mots reconnus, pack, écrans, repli)
pnpm --filter @nkap/gateway lang liste

# ajouter une langue de la sandbox (elle existe déjà côté contrat : bas, byv, bwi… non)
pnpm --filter @nkap/gateway lang ajouter bas --nom Basaa --alias bassa

# ajouter un mot-clé d'intention (poids 1 = faible, 5 = sans ambiguïté)
pnpm --filter @nkap/gateway lang mot bas CHECK_BALANCE "ndap" 3

# ajouter un mot-outil (aide à reconnaître la langue d'une phrase courte)
pnpm --filter @nkap/gateway lang mot-outil bas "ni" 1

# corriger un alias, supprimer un mot
pnpm --filter @nkap/gateway lang alias bas "bassa" "basaa"
pnpm --filter @nkap/gateway lang supprimer bas "ndap"

# faire venir TOUTE la langue du fichier (modifiable et supprimable sans toucher au code)
pnpm --filter @nkap/gateway lang exporter dua

# essayer une phrase tout de suite, sans rebuild
pnpm --filter @nkap/gateway lang tester "parle-moi en bassa"

# contrôles (code 1 si un problème)
pnpm --filter @nkap/gateway lang verifier
```

Ce que fait le middleware au démarrage : il lit le fichier, le valide, et l'installe dans le moteur
(`installWordBase`). Une base invalide est **refusée en entier** — jamais à moitié — et signalée dans
`/health` et `/langues` (`wordBase.ok: false` + la liste des problèmes). Un fichier acceptable mais
incomplet ne casse rien : le lexique intégré reste actif.

**Règles de la base** :
- `remplace: false` (défaut) : les mots **s'ajoutent** au lexique intégré ;
- `remplace: true` (produit par `exporter`) : la langue vient **entièrement** du fichier — c'est le seul
  mode qui permet de **supprimer** un mot intégré ;
- les poids sont des entiers de 1 à 5 ; une intention ou une langue inconnue est refusée avec la liste des
  valeurs valides ;
- `sources` n'est pas décoratif : c'est la provenance qu'on présente au jury (« qui a dit ce mot, quand,
  où »). Une entrée sans source est signalée par `lang verifier` ;
- un mot n'est **jamais** inventé pour « remplir » une langue : on ajoute un mot attesté, ou on ne l'ajoute pas.

**Piège** : la base ne traduit pas les réponses. Comprendre (« ndap ») et répondre (phrases relues dans
`translations/bas.json`) sont deux chantiers distincts — voir l'étape 7.
