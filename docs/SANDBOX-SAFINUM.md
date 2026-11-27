# Sandbox SAFINUM — contrat d'intégration et impacts

> Source : https://safinum.cm/sandbox/docs, relue le 26/11/2026 (documentation intégrée à la sandbox ; PDF final reçu le 26/11/2026).
> Les valeurs ci-dessous sont recopiées telles quelles. Ce qui n'est pas documenté est marqué **inconnu**.

## 1. Le sens des appels (ce qui change tout)

La page `/sandbox/` redirige vers `/sandbox/docs` : c'est cette documentation intégrée qui donne le contrat utile. Le PDF de finale confirme le contexte de l'évaluation ; le contrat de sandbox ci-dessous fait foi pour les formats d'intégration. Les essais en direct restent nécessaires avec une clé d'équipe valide.

```
Simulateur de canal (navigateur)
        │  POST /api/v1/channel/{channel}
        ▼
   Passerelle Safinum ──── X-Trace-Id ────┐
        │  POST (votre URL)               │
        ▼                                 │
  VOTRE MIDDLEWARE                        │
        │  X-Team-Key + X-Trace-Id        │
        ▼                                 ▼
  API bancaire simulée ──────────► Journal du jury
```

**C'est SAFINUM qui appelle notre middleware**, pour chaque canal. Le jury teste via SES simulateurs
(`/sandbox/ussd`, mobile, web) : nos propres applications ne sont pas le chemin évalué.

- Canaux servis : **les six** — `ussd`, `mobile`, `web`, `sms`, `atm`, `ivr` (vérifié le 27/11/2026 :
  `channels` et les six déclarations répondent 200 ; la mention « v2, refusés pour l'instant » qui
  figurait ici était périmée). Voir [SIX-CANAUX](SIX-CANAUX.md).
- Notre URL doit être **publique** (`localhost` refusé → `UNSAFE_ENDPOINT`) : `ngrok http 3000` ou
  `cloudflared tunnel --url http://localhost:3000`. L'URL ngrok change à chaque redémarrage.
- Déclaration par canal : `POST {baseUrl}/sandbox/endpoint` `{"channel":"ussd","url":"https://…/middleware"}`,
  relecture `GET {baseUrl}/sandbox/endpoint`. **Pendant l'évaluation → `409 CONFIG_LOCKED`** : déclarer l'URL
  définitive avant le passage.

## 2. Contrat de la passerelle

**Reçu** (POST sur notre URL) :

```json
{
  "trace_id": "6f1c…",
  "team_id": "votre-equipe",
  "channel": "ussd",
  "session_id": "…",
  "phone": "2376XXXXXXXX",
  "language": "dua",
  "input": { "type": "menu", "text": "2", "ussd_text": "1*2" },
  "constraints": { "max_chars": 182, "charset": "gsm7", "mode": "menu", "timeout_ms": 3000 },
  "bank_api": { "base_url": "https://safinum.cm/api/v1" }
}
```

- `language` **peut être `null`** : la détection nous revient (cas d'évaluation à part entière).
- USSD : saisies concaténées par `*` dans `ussd_text`, code de service `*123#`, session de 180 s.
- IVR (v2) : `input.type = "audio"`, WAV 16 kHz mono (+ variante 8 kHz). Réponse en texte.
- Autres valeurs de `input.type` : **inconnu** (vu : `menu`, `audio`).

**Renvoyé** :

```json
{
  "response": { "text": "Votre solde est de 100 000 FCFA.", "end_session": false, "options": [] },
  "interpretation": {
    "intent": "BALANCE_INQUIRY",
    "parameters": { "amount": 5000, "currency": "XAF", "beneficiary": "…" },
    "language": "dua"
  },
  "transaction": { "id": null, "status": "none" }
}
```

- Obligatoires : `response.text`, `interpretation.intent`. `end_session` absent = `false`.
- Intention hors liste, mauvaise casse, `transaction.status` hors contrat ou réponse non-JSON → `INVALID_RESPONSE`.
- Valeurs autorisées de `transaction.status` : **inconnu** (vu : `none`, `pending` côté API). À confirmer.
- Format des `options` : **inconnu** (tableau vide dans l'exemple).

**Intentions standard** (casse exacte) :
`BALANCE_INQUIRY` `TRANSFER` `FEE_INQUIRY` `TRANSACTION_HISTORY` `AIRTIME_PURCHASE` `BILL_PAYMENT`
`CONFIRM` `CANCEL` `CORRECTION` `CLARIFICATION_NEEDED` `TERM_EXPLANATION` `LANGUAGE_SWITCH` `UNKNOWN`

**Langues** : `dua` Duala · `ewo` Ewondo · `bas` Basaa · `bbj` Ghomala · `byv` Medumba · `fub` Fulfulde · `fr` · `en`.
**Le pidgin n'est pas dans la liste.**

## 3. API bancaire — `https://safinum.cm/api/v1`

En-têtes sur **chaque** appel : `X-Team-Key: sbx_…` (remise une seule fois), `X-Trace-Id: <trace_id reçu>`,
`Accept: application/json`.

| Endpoint | Rôle |
|---|---|
| `GET accounts/{phone}` | Titulaire, solde, devise |
| `GET accounts/{phone}/transactions?limit=10` | Historique, 50 au maximum |
| `GET beneficiaries?q=&phone=` | Recherche par nom OU numéro |
| `GET fees?type=&amount=` | Frais et total avant confirmation |
| `GET billers` | Facturiers et opérateurs |
| `POST transactions` | Crée en `pending` — ne débite rien. Corps : `{"type":"transfer","from":"…","to":"…","amount":5000}` |
| `POST transactions/{id}/update` | Corrige montant ou bénéficiaire |
| `POST transactions/{id}/confirm` | Exécute — seul endroit où l'argent bouge |
| `POST transactions/{id}/cancel` | Abandonne |
| `POST sandbox/reset` | Régénère les données fictives |

- Numéros normalisés : `677000001`, `+237 677 000 001`, `237677000001` = même compte.
- Une transaction `pending` ne réserve rien : le solde est revérifié à la confirmation.
- Corps des réponses de l'API, valeurs de `type` hors `transfer`, corps de `update` : **inconnus**.
- `UNKNOWN_BENEFICIARY` peut contenir `candidates` (homonymes) → demander une précision.

**Erreurs** : `INSUFFICIENT_FUNDS` 422 · `UNKNOWN_BENEFICIARY` 404 · `LIMIT_EXCEEDED` 422 · `INVALID_AMOUNT` 422 ·
`UNKNOWN_BILLER` 404 · `TX_NOT_FOUND` 404 · `TX_NOT_PENDING` 409 · `UNAUTHORIZED` 401 · `UNKNOWN_ACCOUNT` 404 ·
`INVALID_REQUEST` 422 · `CONFIG_LOCKED` 409 · `UNSAFE_ENDPOINT` 422. Ne jamais les montrer tels quels à l'utilisateur.

## 4. Frais (grille officielle)

| Type | Tranches |
|---|---|
| transfer / withdrawal | 1–5 000 : 50 · 5 001–25 000 : 150 · 25 001–100 000 : 400 · ≥ 100 001 : 1 % |
| airtime | 0 |
| bill | 100 |

Plafond **500 000 XAF** par opération. Exemples officiels : 5 000 → 5 050 · 5 001 → 5 151 · 25 000 → 25 150 ·
25 001 → 25 401 · 100 001 → 101 001 · 500 000 → 505 000.

Facturiers : `ENEO`, `CAMWATER`, `CANAL`, `CAMTEL`. Opérateurs : `MTN` (67, 650–654), `ORANGE` (69, 655–659), `CAMTEL` (620–622).

## 5. Contraintes par canal

| Canal | max_chars | charset | mode | délai |
|---|---|---|---|---|
| ussd | 182 (septets) | gsm7 | menu | 3 s |
| mobile | `null` au niveau canal → **par clé** (`strings.*.max_chars`) | utf8 | ui_translation | 10 s |
| web | `null` au niveau canal → **par clé** (`strings.*.max_chars`) | utf8 | ui_translation | 10 s |

- **USSD seulement** : ɛ, ɔ, ŋ, ə ne sont pas dans GSM-7 ; la longueur se compte en septets (« € » = 2).
  Un seul caractère hors alphabet fait basculer le message en UCS-2 → 70 caractères (choix à assumer : translittérer ou réduire).
- **Mobile et web ne conversent pas** (`mode: "ui_translation"`) : on traduit les `strings` d'un écran.
  `constraints.charset` vaut `utf8` et la seule limite de longueur qui compte est celle portée **par chaque clé**
  (`max_chars: null` = pas de limite pour cette clé). Les anciennes valeurs globales 1000 / 2000 et le mode `free`
  étaient une grille périmée : ne plus s'y fier.
  - `max_chars` renseigné et dépassé → `OVER_LENGTH`.
  - clé absente de la réponse → texte affiché en français + `MISSING_STRINGS`.
  - plus d'un quart des textes identiques au français → `UNTRANSLATED`.
  - `{amount}`, `{name}`, `{fee}` supprimés ou renommés → `PLACEHOLDER_BROKEN`, l'écran casse.
- Le délai inclut nos appels bancaires → `TIMEOUT`.
- SMS (v2) : 160 car. GSM-7 / 70 UCS-2 par segment, segments comptés. ATM (v2) : retraits en multiples de 5 000 FCFA.

## 6. Règles d'évaluation qui piègent

1. **Confirmer au tour SUIVANT**, avec un autre `X-Trace-Id` que l'initiation. Sinon : ÉCHEC.
2. **Recopier `X-Trace-Id`** sur chaque appel bancaire, sinon `NO_BANK_CALL` (« tout votre travail devient invisible »).
3. Déclarer `TRANSFER` sans appeler `POST /transactions` est signalé automatiquement.
4. Le jury vérifie dans le journal : `GET /accounts` (solde), `GET /fees` (frais) — un chiffre calculé chez nous ne compte pas.
5. Ambiguïté → intention déclarée `CLARIFICATION_NEEDED`. **Deviner un montant ou un bénéficiaire = faute grave.**
6. Multicanal : opération initiée en USSD, reprise sur le web avec le même numéro → **la pire issue est une double exécution**.

## 7. Écarts avec notre socle J0 et corrections

| Écart | Gravité | Correction |
|---|---|---|
| Nos intentions (`CHECK_BALANCE`, `WITHDRAW`…) ≠ liste officielle | Bloquant | Adaptateur de sortie : `CHECK_BALANCE→BALANCE_INQUIRY`, `CHECK_FEES→FEE_INQUIRY`, `TX_HISTORY→TRANSACTION_HISTORY`, `BUY_AIRTIME→AIRTIME_PURCHASE`, `PAY_BILL→BILL_PAYMENT`, `EXPLAIN_TERM→TERM_EXPLANATION`, `CHANGE_LANGUAGE→LANGUAGE_SWITCH` ; étape `clarifying` → `CLARIFICATION_NEEDED` ; correction → `CORRECTION` |
| Port financier en `quote/execute` ≠ cycle `pending → update → confirm/cancel` | Bloquant | Port v2 : `initiate`, `update`, `confirm`, `cancel` ; la transaction en attente vit côté banque (id gardé en session) |
| Pas de `X-Trace-Id` dans le port | Bloquant | Contexte de tour passé à chaque appel du port |
| Frais du simulateur (375 pour 25 000) ≠ grille officielle (150) | Élevée | Aligner `banking-sim` sur la grille, et toujours demander les frais à `GET /fees` |
| Carnet de contacts local ≠ `GET beneficiaries` + `candidates` | Élevée | Résolution du bénéficiaire par l'API ; `candidates` → clarification |
| Rendu fulfulde avec ɓ ɗ ŋ ƴ et « → », « — », « … », « ’ » sur USSD | Élevée | Translittération GSM-7 dans `formatForChannel` pour `charset: gsm7` (le repliement `fold` existe déjà) |
| Pidgin absent des langues de la sandbox | Stratégique | Fulfulde en langue principale ; Duala ou Ewondo en seconde (kits de démarrage de la présélection) ; pidgin hors évaluation |
| `language: null` | Moyenne | Déjà couvert par la détection ; ajouter les langues de la sandbox au détecteur |
| Notre app mobile / bulle ne sont pas le chemin évalué | Stratégique | Priorité au **middleware** ; app et bulle redescendent en P2 (démonstration d'innovation seulement) |

## 8. Correspondance `Trace` (notre socle) ↔ dashboard du jury

Le dashboard du jury n'est pas à nous : SAFINUM le remplit depuis le journal de la passerelle. Notre seul levier
est le middleware, qui produit `interpretation`, `response` et `transaction`, et qui doit relayer `X-Trace-Id`.
Passage entre `Trace` (`packages/contracts/src/trace.ts`, ordre du règlement §6.D) et ce que le jury voit :

| Champ `Trace` | Dashboard du jury | Produit par | Remarque |
|---|---|---|---|
| `team` | nom de l'équipe | passerelle (`team_id`) | nous ne le renseignons pas |
| `channel` | canal testé | passerelle (`channel`) | `ussd` / `mobile` / `web` |
| `lang` | langue utilisée | passerelle (`language`) **ou** notre détection si `null` | à renvoyer dans `interpretation.language` (USSD) et `language` (ui_translation) |
| `rawInput` | requête initiale | passerelle | sur mobile/web = textes FR de l'écran, pas une phrase |
| `intent` | intention interprétée | notre middleware | casse exacte, liste fermée des 13 intentions |
| `params` | paramètres extraits | notre middleware | = `interpretation.parameters` |
| `response` | réponse générée | notre middleware | `response.text` (USSD) / `strings` (mobile-web) |
| `status` | statut de la transaction | notre middleware | `transaction.status` — voir le mapping ci-dessous |
| `latencyMs` | temps d'exécution | passerelle | inclut nos appels bancaires ; budget 3 s / 10 s |
| `errors` | erreurs techniques | passerelle + nous | `INVALID_RESPONSE`, `TIMEOUT`, `PLACEHOLDER_BROKEN`, `NO_BANK_CALL`… |
| `validation.integrity` | résultat de la validation | croisement journal ↔ intention déclarée | faux si l'intention n'est pas suivie des appels réels |
| `validation.translationStatus` | qualité linguistique | notre rendu (`reference` / `validated` / `draft`) | pas d'équivalent direct côté sandbox |
| `validation.fallback` | (aucune colonne) | notre rendu | se manifeste côté jury en `MISSING_STRINGS` / `UNTRANSLATED` |

Colonnes du dashboard **sans équivalent dans `Trace`** : les **appels bancaires réellement exécutés**
(reconstitués par la passerelle via `X-Trace-Id`) et les **septets / caractères hors GSM-7** (mesurés côté
serveur sur chaque réponse USSD).

### `Trace.status` ↔ `transaction.status` de la sandbox

> **Remplacé par le kit officiel (26/11).** Le tableau ci-dessous était une hypothèse prudente, faite sans
> source. Le kit de démarrage SAFINUM renvoie le cycle bancaire tel quel (`confirmed`, `cancelled`, `failed`) :
> c'est désormais le défaut du middleware. Voir §9.

Nos statuts internes sont plus riches que le contrat sandbox (valeurs observées : `none`, `pending` ; liste
complète **inconnue**). Correspondance à appliquer dans le middleware :

| `Trace.status` | `transaction.status` | Sens |
|---|---|---|
| `none` | `none` | aucun objet transactionnel (solde, frais, historique, explication de terme) |
| `awaiting_input` | `none` | on attend un complément, rien n'est créé |
| `awaiting_clarification` | `none` (intention `CLARIFICATION_NEEDED`) | ambiguïté : on ne devine pas |
| `awaiting_confirmation` | `pending` | transaction créée côté banque, aucun débit |
| `executed` | `pending` + `id` de la transaction confirmée | `POST /transactions/{id}/confirm` appelé au tour **suivant** |
| `cancelled` | `none` + `id` | `POST /transactions/{id}/cancel` |
| `rejected` | `none` | refus métier (`INSUFFICIENT_FUNDS`, `LIMIT_EXCEEDED`…) expliqué en langue |
| `failed` | `none` | erreur technique ; `errors` renseigné |

Rappels bloquants : `X-Trace-Id` recopié sur **chaque** appel bancaire (sinon `NO_BANK_CALL`), et `confirm`
obligatoirement dans un tour portant un **autre** `trace_id` que l'initiation (sinon ÉCHEC). En `mobile` / `web`,
aucun appel bancaire n'est attendu : nos `Trace` locales y servent la démo, pas le journal du jury.

## 9. Ce que le kit de démarrage officiel confirme (reçu le 26/11)

Le kit Node.js remis aux équipes (« respecte déjà le contrat ») tranche plusieurs points marqués **inconnu** :

| Point | Ce que fait le kit | Notre middleware |
|---|---|---|
| `transaction.status` | `pending` au récapitulatif, `confirmed`, `cancelled`, `failed` | aligné (défaut `lifecycle`) |
| Identifiant de trace | en-tête HTTP `X-Trace-Id` de la requête, `trace_id` du corps en repli | aligné |
| `input.type` USSD | `"text"`, saisie dans `input.text`, `ussd_text` = chaîne `*123#*1` | déjà géré |
| `response.options` | libellés des choix, en plus de la liste écrite dans `text` | aligné (menu inclus) |
| Écrans `ui_translation` | clé par clé ; clé absente = repli français par l'appli ; emplacements triés sans doublon | aligné (+ seuil 75 %) |
| Langue sans traduction | déclarer `fr` | déjà le cas |
| Contrôle GET | `GET /` → `{ "ok": true }` pour vérifier le tunnel | déjà le cas |
| Erreur bancaire | fin de session, `transaction.status: failed` si une transaction existait | déjà le cas |
| Clés d'écran de référence | `translations/en.json` : 89 clés | identiques à notre dictionnaire anglais (89/89) |


## 10. Les dix scénarios d'évaluation (documentation relue le 26/11)

Source : données de la page `https://safinum.cm/sandbox/docs` (attribut Inertia `data-page`, clé `scenarios`)
et composant `Docs`. Chaque scénario est joué **sur USSD** (« say » : ce que dit le testeur) **et dans
l'application** mobile/web (« app » : ce que le testeur ouvre). La langue est **tirée au sort**.

| Scénario | Le jury attend | Le jury surveille | Chez nous |
|---|---|---|---|
| **Solde** — « sans jamais dire *solde* en français » | montant exact, dans la langue, avec la devise | montant différent, pas de `GET /accounts` | texte libre compris par le moteur (fr, en, fub, duala partiel) ; réponse dans la langue si catalogue complet, sinon `fr` déclaré |
| **Transfert** | relecture montant + frais + total, PUIS arrêt ; confirmation au tour suivant | frais tus, débit ≠ total annoncé | ✓ `pending` → récapitulatif → `confirm` au tour suivant (autre trace) |
| **Frais** (montant proche de 5 000 / 25 000) | frais exacts de la grille + total | frais inventés, pas de `GET /fees` | ✓ `GET /fees` à chaque fois, grille officielle en repli seulement |
| **Historique** | opérations réelles, lisibles sur le canal | liste inventée, réponse trop longue en USSD | ✓ 4 dernières, 182 septets |
| **Correction** avant confirmation | nouveau montant, frais **recalculés**, nouvelle relecture | frais de l'ancien montant conservés | ✓ corrigé le 26/11 : `GET /fees` rappelé ; « Non, 3000 » compris |
| **Ambiguë** (montant absent, homonymes) | question de précision, `CLARIFICATION_NEEDED` | montant ou destinataire **deviné** (faute grave) | ✓ jamais deviné ; homonymes listés avec numéro |
| **Solde insuffisant** | refus expliqué dans la langue, si possible une issue | code `INSUFFICIENT_FUNDS` brut, français à un locuteur duala | ✓ jamais de code brut ; ✗ duala : français tant qu'aucun pack n'est livré |
| **Changement de langue** en plein parcours | bascule suivie, contexte conservé | contexte perdu, langue initiale conservée | ✓ la langue du tour gagne, la transaction en attente est gardée |
| **Multicanal** (USSD puis web, même numéro) | opération en attente retrouvée ou signalée | **double exécution** | ✓ une seule exécution (confirm côté banque) ; libellés `tx.status.pending` traduits |
| **Terminologie** (frais, plafond, bénéficiaire) | explication intelligible sans compte bancaire | terme répété sans explication | ✓ menu 7 + `TERM_EXPLANATION` (fr, en, fub) |

### Règles supplémentaires lues dans la documentation

- **Écrans** : six écrans (`home`, `transfer`, `pay`, `review`, `receipt`, `history`). « **Renvoyez toutes les clés** »
  (absente → `MISSING_STRINGS`) ; plus d'un quart identique au français → `UNTRANSLATED` ; `max_chars` → `OVER_LENGTH` ;
  emplacements supprimés/renommés → `PLACEHOLDER_BROKEN` ; « Lisez `context` » (un bouton ≠ un titre) ; les bulles (i)
  visent « quelqu'un qui n'a jamais eu de compte bancaire ». Réponse minimale valide : `{"language":"fr","strings":{}}`.
- **USSD** : réponse minimale valide `{"response":{"text":"Bonjour","end_session":false,"options":[]},"interpretation":{"intent":"UNKNOWN","parameters":{},"language":"fr"},"transaction":{"id":null,"status":"none"}}` ;
  `end_session` absent vaut `false` ; GSM-7 vérifié côté serveur sur chaque réponse (option « GSM-7 strict » = anomalie).
- **Diagnostics** du simulateur : « exactement ce que le jury verra » (intention, durée, longueur, hors GSM-7, anomalies).
- **API** : `POST /transactions` accepte `transfer`, `airtime` (`to` facultatif, sinon `operator` ; un opérateur qui
  contredit le préfixe → `UNKNOWN_BILLER` avec `detected`), `bill` (`{"type":"bill","from","biller","amount"}`), `withdrawal`.
  `UNKNOWN_BENEFICIARY` peut porter `candidates` (homonymes) → demander une précision.
- **Canaux v2** (refusés pour l'instant, formats figés) : SMS 160 GSM-7 / 70 UCS-2, segments de 153 / 67 comptés ;
  ATM retraits en **multiples de 5 000 FCFA**, pas de texte libre ; IVR `input.type = "audio"`, WAV 16 kHz mono (+ 8 kHz), réponse en texte.
- **Kits de démarrage** : Node.js, Python, PHP (`/sandbox/starter/{node,python,php}.zip`).

## 11. Simulateur : PASS, jeton et paramètres réels (vérifié le 27/11/2026)

Depuis le 27/11, `/channel/*` exige un **PASS d'équipe**. Sans lui :
`403 {"error":"SIMULATOR_LOCKED"}` — un simple `X-Team-Key` ne suffit plus.

```bash
# 1. déverrouiller (team_id est un ENTIER, pas le slug → 422 sinon)
POST /api/v1/simulator/unlock   { "team_id": 10, "pass": "<PASS de l'équipe>" }
→ 200 { "token": "…" }

# 2. chaque appel de canal porte le jeton en en-tête
POST /api/v1/channel/ussd
  X-Team-Key: sbx_…
  X-Sandbox-Access: <token>
```

Le jeton est un secret de session : ni commité, ni affiché, ni mis en capture. Le nôtre vit le
temps d'un script (`apps/gateway/scripts/six-canaux.mjs`) et n'est jamais écrit sur disque.

| Canal | Corps minimal accepté | Remarque |
| --- | --- | --- |
| `ussd` | `{ team_id, phone, text, session_id, language, input_type }` | `text: ""` ouvre le menu |
| `mobile`, `web` | + **`screen`** (`home`, `transfer`, `pay`, `review`, `receipt`, `history`) | 422 sans `screen` |
| `sms` | comme `ussd` | la réponse porte `sms.segments` / `sms.encoding` |
| `atm` | + **`screen`** : `atm_welcome`, `atm_pin`, `atm_menu`, `atm_amount`, `atm_confirm`, `atm_cash`, `atm_receipt`, `atm_statement`, `atm_balance`, `atm_other`, `atm_end` | 422 sans `screen` ; la sandbox envoie `strings` et attend une **traduction d'écran** comme mobile/web, pas un dialogue (mesuré le 27/11 : `INVALID_RESPONSE` sinon) |
| `ivr` | comme `ussd` | réponse en texte (`say` / `response.text`) |

Autres faits utiles :

- `GET /sandbox/teams/{id}/accounts` (avec le jeton) donne les comptes de test et leurs soldes :
  c'est la source du « montant exact » attendu par le scénario solde.
- La liste des équipes et de leurs canaux est dans les props de `/sandbox/ussd` (`teams[]`) :
  `shun-and-co` = `id 10`, canaux `["ussd","mobile","web","sms","atm","ivr"]`.
- `POST /api/v1/channel/*` limite les tentatives (`429 Too Many Attempts`, `x-ratelimit-limit: 10`).
  Déverrouiller une fois et réutiliser le jeton dans le même processus, sinon on perd des minutes.
