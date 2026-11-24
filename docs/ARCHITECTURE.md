# Architecture — NkapLingua 2

> Un seul moteur linguistique. N canaux. M institutions. Aucune modification du système financier.

## 1. Vue d'ensemble

```
   CANAUX (clients)                      NKAPLINGUA CORE                         INSTITUTIONS
 ┌──────────────────┐              ┌──────────────────────────┐            ┌───────────────────┐
 │ App mobile (RN)  │─┐            │ 1. Normalisation         │            │ Sandbox SAFINUM   │
 │  + bulle Android │ │  TurnRequest│ 2. Langue               │  Financial │  (adaptateur)     │
 │ Web (Next.js)    │ ├───────────►│ 3. Entités verrouillées  │◄──────────►│ Mboa Pay (simulé) │
 │ USSD (webhook)   │ │            │ 4. Intention             │    Port    │ Banque X, EMF Y…  │
 │ SMS (webhook)    │ │◄───────────│ 5. Dialogue à états      │            └───────────────────┘
 │ SVI (DTMF/voix)  │ │ TurnResponse 6. Rendu dans la langue │
 │ GAB / extension  │─┘            │ 7. Mise en forme canal   │──► Trace ──► Console jury (SSE)
 └──────────────────┘              └──────────────────────────┘
```

| Paquet | Rôle | Dépend de |
|---|---|---|
| `@nkap/contracts` | Le **contrat** : intentions canoniques, paramètres, tours, traces, port financier, schémas zod | zod |
| `@nkap/core` | Le **moteur** : pur TypeScript, sans DOM, sans réseau. Tourne dans Node, le navigateur, React Native | contracts |
| `@nkap/banking-sim` | Backend simulé conforme au port (comptes, frais, plafonds, idempotence) | contracts |
| `apps/gateway` *(J1)* | API REST + webhooks USSD/SMS + flux de traces | core |
| `apps/web`, `apps/mobile` *(J2)* | Clients riches | contracts (+ core embarqué hors ligne) |
| `apps/extension` | Extension de la présélection (superposition de pages) | — puis gateway |

## 2. Le contrat canonique

Tout canal converge vers la même structure, quelle que soit la forme de l'entrée :

```ts
// Phrase libre (web, app, SMS, voix)     // Choix structuré (menu USSD, bouton, touche SVI)
{ kind: 'text', value: 'Neldu ujineere      { kind: 'intent', intent: 'TRANSFER',
  jowi ka Fadimatou' }                        slots: { amount: { amount: 5000, currency: 'XAF' } } }
                    \                         /
                     ▼                       ▼
     Interpretation { intent: 'TRANSFER', slots: { amount: 5000 XAF, recipientQuery: 'fadimatou' },
                      lang: 'fub', confidence, cues: ['TRANSFER:neld*'], isCorrection: false }
```

C'est ce qui garantit le critère « *cohérence de l'opération financière interprétée, quel que soit le
canal* » (§5.5) : le test `jury-scenarios › 9` rejoue la même requête sur les 6 canaux et vérifie que
l'intention, les paramètres, la fiche d'opération et le texte sont **identiques**.

## 3. Technologie linguistique

### 3.1 Compréhension (`packages/core/src/nlu`)

1. **Normalisation à deux niveaux** — `normalize` garde ɓ ɗ ŋ ƴ ; `fold` les replie (« njobdi » tapé sur
   un clavier basique = « njoɓdi »).
2. **Montants** — chiffres (« 25 000 », « 5k », « 5 mille ») et **lettres en 4 langues**, y compris l'ordre
   fulfulde où le multiplicateur précède (« ujineere noogas e jowi » = 25 000). Numéros de téléphone
   camerounais séparés des montants.
3. **Langue** — mots-outils discriminants + indices d'intention ; en cas de doute, langue de la conversation.
4. **Intention** — classifieur à indices pondérés **toutes langues confondues** (le code-switching
   « send 5000 a maman » est compris), règles d'arbitrage explicites (« c'est quoi les frais » ≠
   « what is MY balance »).
5. **Entités dynamiques** — le carnet de contacts du titulaire sert de dictionnaire de noms : « Paul » est
   reconnu, « deux Paul » déclenche une clarification, un inconnu n'est **jamais inventé**.

**Pourquoi pas un LLM au cœur ?** Déterminisme (le jury rejoue les scénarios), latence < 5 ms, hors
ligne, explicabilité (chaque décision liste ses indices), coût nul, et aucune donnée financière ne sort.
Un modèle statistique pourra s'ajouter **derrière la même interface** pour les énoncés inconnus, en ne
voyant que du texte masqué (règle de la présélection).

### 3.2 Dialogue (`packages/core/src/dialogue`)

Machine à états `idle → collecting → clarifying → confirming → executed`. Le dialogue produit un **plan**
(clés de messages + valeurs), jamais du texte : c'est ce qui permet de **changer de langue en cours
d'opération** et de servir le même contenu en USSD (182 caractères) comme en vocal.

Garanties testées : confirmation obligatoire avant tout débit · correction appliquée avant exécution ·
solde vérifié **avant** la confirmation · question annexe sans perte de l'opération · idempotence
(double « oui » = un seul débit) · conversation rattachée au titulaire (USSD → app).

### 3.3 Rendu (`packages/core/src/render`)

- Gabarits par langue avec emplacements **verrouillés** `{AMOUNT}`, `{NAME}`, `{PHONE}`…
- Un gabarit traduit qui n'a pas **exactement** les mêmes emplacements que la référence est rejeté →
  repli français signalé (`fallback: true`).
- Chaque réponse porte le **statut le plus faible** de ses phrases : `reference` · `attested` ·
  `validated` · `proposed` · `draft`. Le jury et l'utilisateur voient ce qui a été validé par des locuteurs.
- Mise en forme par canal : les choix numérotés sont prioritaires, puis les phrases par ordre
  d'importance ; une coupe ne tombe jamais au milieu d'un montant.

## 4. Mécanismes d'intégration

| Mode | Pour qui | Effort côté institution |
|---|---|---|
| **API REST** `POST /v1/turns` | Toute plateforme | Appeler un endpoint |
| **Proxy de canal** (USSD, SMS) | Opérateur / agrégateur | Pointer le webhook vers NkapLingua |
| **SDK / widget** | App ou site de l'institution | Une ligne `<script>` ou un paquet npm |
| **Superposition** (extension, bulle Android) | Aucune — côté utilisateur | **Zéro** |
| **Port financier** `FinancialPort` | Brancher un nouveau backend | Un adaptateur (6 méthodes) |

Ajouter un canal = un adaptateur qui transforme son entrée en `TurnRequest` et formate la `Reply`
(`formatForChannel` fait déjà USSD/SMS/GAB). Ajouter une langue = un code dans `LANGUAGES` + ses
entrées de lexique, validées par deux locuteurs.

## 5. Sécurité

- Aucun montant, nom ou numéro n'est produit par la traduction : ils viennent du système financier.
- Confirmation explicite + clé d'idempotence par opération.
- Validation zod à chaque frontière ; le moteur ne reçoit jamais d'entrée non validée.
- La bulle Android lit l'écran **à la demande uniquement**, sur une liste blanche, sans envoi réseau.

## 6. Scalabilité et déploiement

- Le moteur est **sans état** ; l'état de conversation passe par `SessionStore` (mémoire en démo,
  Redis/Postgres en production) → mise à l'échelle horizontale de la gateway.
- Coût d'un tour : quelques millisecondes CPU, pas de GPU, pas d'appel externe.
- Même code embarqué sur mobile → fonctionne hors ligne pour la compréhension et le rendu.
- Coût marginal d'une langue : un fichier de lexique validé — pas un nouveau développement par institution.
