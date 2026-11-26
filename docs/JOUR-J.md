# Jour J — déroulé de la présentation et de l'évaluation

> Ce que le jury fait (documentation sandbox) : il ouvre les simulateurs **USSD, mobile et web**, choisit un compte
> de test, **tire une langue au sort** et joue les **dix scénarios** (SANDBOX-SAFINUM §10). Il ne voit pas notre
> code : il voit le **journal de la passerelle** (intention déclarée, appels bancaires réels, durée, longueur,
> GSM-7, anomalies). Pendant le passage, `POST /sandbox/endpoint` répond `CONFIG_LOCKED` : **tout se fige avant**.

## 1. Rôles (3 personnes minimum)

| Rôle | Tâche pendant le passage |
|---|---|
| **Pilote** | seul à toucher la machine du middleware ; ne parle pas |
| **Narrateur** | explique ce que le jury voit, annonce les replis honnêtes avant qu'on les découvre |
| **Vigie** | suit les journaux du middleware (`trace=… intent=… ms=…`) et le panneau « Diagnostics » ; signale tout `TIMEOUT` ou anomalie |
| Locuteurs (2 par langue servie) | présents le matin pour relire les packs ; pendant le passage, peuvent jouer l'utilisateur |

## 2. La veille (J-1)

1. **Clé et équipe** : obtenir de l'organisation la clé `sbx_…` **et** le `team_id` exacts, les vérifier :
   `SAFINUM_TEAM_KEY=sbx_… node apps/gateway/scripts/safinum.mjs status` → `200`.
2. **Tunnel stable** : un tunnel **nommé** (Cloudflare Tunnel avec nom d'hôte fixe, ou domaine ngrok réservé).
   Une URL gratuite qui change au redémarrage est interdite le jour J : on ne pourra plus la redéclarer.
3. **Packs de langue** : faire relire par deux locuteurs, pour chaque langue disponible, le modèle
   `pnpm --filter @nkap/gateway i18n modele` (écrans d'abord, puis messages USSD critiques), puis
   `pnpm --filter @nkap/gateway i18n verifier` et `pnpm test`.
4. **Répétition générale** sur la vraie sandbox : les dix scénarios × trois canaux, avec au moins deux langues tirées
   au sort, chronométrés. Noter chaque anomalie du panneau Diagnostics et la corriger le soir même.
5. **Gel** : étiqueter le commit (`git tag jour-j`), construire (`pnpm --filter @nkap/gateway build`), copier le
   dossier sur la **machine de secours**.

## 3. Le matin (H-3 → H-1)

| Heure | Action | Vérification |
|---|---|---|
| H-3 | Session locuteurs (2 × 1 h) sur les packs restants | `i18n verifier` vert |
| H-2 | `git pull`, `pnpm install`, `pnpm test`, `pnpm --filter @nkap/gateway build` | 0 échec |
| H-2 | Lancer le middleware : `SAFINUM_TEAM_KEY=… SAFINUM_BANK_URL=https://safinum.cm/api/v1 node apps/gateway/dist/server.js` | `curl localhost:8080/health` → `teamKeyConfigured: true` |
| H-2 | Lancer le tunnel nommé | `curl https://<tunnel>/` → `{"ok":true,…}` |
| H-90 min | Déclarer les trois canaux : `node apps/gateway/scripts/safinum.mjs declare https://<tunnel>` | `… status` renvoie nos trois URL |
| H-60 min | Tour de chauffe dans les trois simulateurs (solde, transfert + confirmation, écran d'accueil) | Diagnostics sans anomalie, appels bancaires visibles |
| H-30 min | **Plus aucun changement de code.** Machine en secteur, veille désactivée, notifications coupées | — |
| H-15 min | Réinitialiser les données fictives si besoin (`POST /sandbox/reset`) | soldes de départ connus |

## 4. Pendant le passage (≈ 20 min)

### 4.1 Ouverture (2 min, narrateur)
« NkapLingua n'est pas une traduction de plus : c'est **un seul moteur** de compréhension, branché sur les trois
canaux, qui ne devine jamais un montant, confirme toujours au tour suivant, et **dit honnêtement** quand il n'a
pas de traduction validée. » Montrer le schéma passerelle → middleware → banque → journal.

### 4.2 Scénarios (le jury mène ; on commente)
Pour chaque scénario, le narrateur annonce **ce qu'il faut regarder dans le journal** :

| Scénario | À montrer dans le journal / l'écran |
|---|---|
| Solde | `GET /accounts` avec la trace du tour ; montant identique au compte |
| Transfert | récapitulatif (montant, frais, total) **puis arrêt** ; `confirm` au tour suivant, **trace différente** |
| Frais (5 000 / 25 000) | `GET /fees` ; 5 000 → 50, 25 000 → 150 |
| Correction | `update` puis **`GET /fees` rappelé** ; frais recalculés |
| Ambiguë | `CLARIFICATION_NEEDED` ; homonymes listés avec leur numéro ; rien de deviné |
| Solde insuffisant | message lisible, jamais le code brut |
| Changement de langue | la transaction en attente est conservée |
| Multicanal | une seule exécution ; l'opération en attente visible dans l'historique web |
| Terminologie | explication directe (« Que veut dire frais ? ») |
| `language: null` | détection ; langue déclarée = langue réellement affichée |

### 4.3 Si la langue tirée n'a pas de pack complet (à dire AVANT que le jury le découvre)
« Nous comprenons la demande — regardez l'intention et les paramètres extraits — mais nous n'avons pas de traduction
**validée par deux locuteurs** de nos réponses en <langue>. Nous répondons donc en français, et nous le **déclarons** :
`interpretation.language = fr`. Afficher du français sous l'étiquette <langue> serait signalé, et surtout malhonnête
envers l'utilisateur. » Puis montrer le statut des packs (`i18n verifier`) et le protocole à deux locuteurs.

### 4.4 Clôture (2 min)
Montrer en une minute : bulle Android (vidéo), web, mode hors-ligne USSD (banque coupée → menu de secours).

## 5. Plans de secours

| Incident | Geste immédiat | Ce qu'on dit |
|---|---|---|
| Tunnel tombé | relancer le tunnel **nommé** (même URL, aucune redéclaration) | « Reconnexion réseau, 30 s » |
| Middleware planté | `node apps/gateway/dist/server.js` (sessions en mémoire perdues : reprendre le scénario) | — |
| Banque lente / injoignable | le mode hors-ligne répond seul (menu de secours, ADR 0005) | le montrer comme une fonctionnalité |
| Machine en panne | machine de secours : même commit, même tunnel nommé (identifiants copiés la veille) | — |
| `TIMEOUT` répétés | vérifier la latence du tunnel ; le budget USSD est de 3 s, appels bancaires compris | — |
| Rien ne marche | vidéo de secours de la démonstration complète | « Voici le même parcours enregistré hier sur la sandbox » |

## 6. Après le passage
Relever les traces du passage dans les journaux du middleware, noter les anomalies vues dans Diagnostics, et
consigner ce qui a été dit au jury sur les langues (engagements de validation).
