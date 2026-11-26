# Sandbox SAFINUM — contrat d'intégration et impacts

> Source : https://safinum.cm/sandbox/docs, lue le 24/11/2026 (données de la page + composant `Docs`).
> Les valeurs ci-dessous sont recopiées telles quelles. Ce qui n'est pas documenté est marqué **inconnu**.

## 1. Le sens des appels (ce qui change tout)

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

- Canaux servis : `ussd`, `mobile`, `web`. Prévus (v2, refusés pour l'instant) : `sms`, `atm`, `ivr`.
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
