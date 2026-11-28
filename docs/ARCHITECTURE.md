# NkapLingua : architecture technique

> Tout le monde devrait pouvoir parler le langage de l'argent.

Une réalisation **Shun&Co.** pour le SAFINUM Innovate Challenge 2026.

NkapLingua fait parler les services financiers dans les langues du Cameroun, sur six canaux : USSD, SMS, serveur vocal (IVR), application mobile, web et guichet automatique (GAB). Les locuteurs enrichissent les langues depuis un studio web, où chaque phrase est validée par un second locuteur avant d'être servie.

Stack : Node.js 22 (serveur HTTP natif, TypeScript strict), MongoDB 7, Redis 7, PyTorch (MMS-VITS), Next.js 15 et shadcn/ui. Livré en conteneurs Docker.

## 1. Vue d'ensemble

```mermaid
flowchart LR
    subgraph Usagers
        U1[Téléphone basique<br/>USSD, SMS, appel]
        U2[Appli mobile, web, GAB]
    end
    subgraph SAFINUM
        GW[Passerelle SAFINUM]
        BANK[(API bancaire)]
    end
    subgraph NkapLingua
        MW[Gateway Node.js<br/>catalogues en mémoire]
        R[(Redis<br/>instantané, diffusion)]
        M[(MongoDB<br/>vérité, audio)]
        TTS[Service voix<br/>PyTorch, ffmpeg]
        ST[Studio web<br/>Next.js + shadcn]
    end
    LOC[Locuteurs]

    U1 --> GW
    U2 --> GW
    GW -- tour + X-Trace-Id --> MW
    MW -- X-Team-Key + X-Trace-Id --> BANK
    U2 -. opérations exécutées par l'appli .-> BANK
    MW <--> R
    MW -- démarrage --> M
    LOC --> ST
    ST --> M
    ST -- publication --> R
    ST -- transcodage --> TTS
    TTS --> M
```

| Composant | Technologie | Rôle |
| --- | --- | --- |
| Gateway | Node.js 22, serveur HTTP natif, TypeScript strict | contrat SAFINUM, conversation, appels bancaires |
| Vérité | MongoDB 7, GridFS | références, propositions, base définitive, audio |
| Diffusion | Redis 7 | instantané des traductions validées, pub/sub |
| Voix | PyTorch, MMS-VITS, ffmpeg | synthèse des phrases fixes, transcodage mp3 |
| Studio | Next.js 15, shadcn/ui | contribution texte ou voix, relecture à quatre yeux |

Deux familles de canaux :

| Canaux | Ce que reçoit le middleware | Appels bancaires |
| --- | --- | --- |
| mobile, web, GAB | des gabarits (`{amount}`, `{name}`), jamais une valeur | aucun : l'appli opère elle-même |
| USSD, SMS, IVR | la saisie de l'usager, imposée par le contrat | oui, à chaque étape |

## 2. Le gateway

```mermaid
flowchart TB
    IN[POST /hook/secret] --> V{Contrôles du payload<br/>structure, canal, langue, 512 Ko}
    V -- invalide --> E400[400 ou 404]
    V -- ui_translation --> UI[Traduction d'écran<br/>aucun accès bancaire]
    V -- ussd, sms, ivr --> RL{Limite de débit<br/>par numéro}
    RL -- dépassée --> E429[429]
    RL --> S[Session en mémoire TTL 180 s]
    S --> C[Moteur conversationnel]
    C --> B[Client bancaire<br/>connexion chaude, budget du tour]
    C --> RD[Rendu : langue déclarée,<br/>pliage GSM-7, 182 septets]
    L1[(Catalogues intégrés + packs<br/>+ couche studio, en mémoire)] --> RD
    L1 --> UI
    RD --> OUT[Réponse au contrat]
    UI --> OUT
```

Fonctionnalités clés :

- **Traductions en mémoire, studio prioritaire.** Un écran de 40 clés est traduit en 24 µs, sans aller-retour réseau. Une phrase validée dans le studio l'emporte, phrase par phrase, sur les dictionnaires intégrés et les packs ; Redis amorce et met à jour cette couche, il n'est pas interrogé pendant un tour.
- **Connexion bancaire toujours chaude.** Keep-alive de 60 s et ping de maintien toutes les 20 s : quand l'usager a fini de lire et de taper, l'appel suivant ne coûte qu'un aller-retour réseau.
- **Délai borné.** Chaque appel bancaire est limité à 2,2 s pour tenir les 3 s d'un tour USSD ; une banque injoignable déclenche un menu hors ligne honnête.
- **Sessions.** En mémoire, 180 s, effacées en fin d'opération ; elles ne contiennent que l'étape et la référence de l'opération.
- **Écrans décrits par des clés.** Un écran peut être rejoué dans une autre langue sans perdre l'opération en cours.
- **Langue déclarée honnête.** Si une seule phrase de l'écran manque dans la langue demandée, tout l'écran part en français, déclaré `fr`.
- **Compréhension libre.** Lexique pondéré par langue (`data/langues.json`) : « envoie 5000 à Paul » est compris en un seul message.
- **Douze langues.** Toutes les langues de la sandbox sont acceptées ; une langue n'est servie en USSD qu'une fois toutes ses phrases validées, sinon la réponse est en français, déclarée `fr`.

## 3. Transfert en deux tours

```mermaid
sequenceDiagram
    autonumber
    actor U as Usager
    participant G as Passerelle
    participant M as Middleware
    participant B as Banque
    U->>G: envoie 5000 a paul
    G->>M: tour N
    M->>B: GET /beneficiaries?q=paul
    B-->>M: 2 homonymes
    M-->>G: CLARIFICATION_NEEDED, 1. Paul Mbarga 2. Paul Etoa
    U->>G: 1
    G->>M: tour N+1
    M->>B: POST /transactions
    B-->>M: en attente, frais 150, total 5150
    M-->>G: TRANSFER, relecture du montant, des frais et du total
    U->>G: 1 (confirmer)
    G->>M: tour N+2
    M->>B: POST /transactions/id/confirm
    B-->>M: confirmée
    M-->>G: CONFIRM, reçu, fin de session
```

- L'opération est créée dans un tour et confirmée dans un tour suivant, jamais dans le même.
- Un montant ou un bénéficiaire n'est jamais deviné : la réponse est `CLARIFICATION_NEEDED`.
- « non, plutôt 30000 » est compris comme une correction : la banque recalcule les frais, une nouvelle relecture suit.
- L'usager peut changer de langue en pleine relecture : l'écran est rejoué, l'opération reste en attente.
- `0` annule à n'importe quelle étape ; rien n'est débité.

## 4. Lettres à tons et budget USSD

Un seul caractère hors de l'alphabet GSM-7 fait passer un message en UCS-2 : la limite tombe alors de 182 à 70 caractères. NkapLingua plie chaque phrase une fois, à son entrée dans le catalogue.

| Source | GSM-7 | Septets | Raison |
| --- | --- | --- | --- |
| ŋ ɓ ɗ ƙ ƴ | ng bh dh kh yh | 2 | consonnes composées |
| ɛ ɔ | è ò | 1 | déjà dans GSM-7, distinctes de e et o |
| ə | eu | 2 | lecture francophone de la voyelle centrale |
| tons (á à â ǎ) | retirés | 0 | de façon uniforme |

Exemples : Duálá devient Duala, Mə̀dûmbà devient Meudumba, Ghɔmálá devient Ghòmala, Ɓasaá devient Bhasaa. Les règles sont des données, modifiables langue par langue.

## 5. Le studio web

Décrit en détail dans [STUDIO.md](STUDIO.md).

```mermaid
stateDiagram-v2
    [*] --> Reference: phrase source amorcée<br/>ou vue en production
    Reference --> Pending: un contributeur propose<br/>texte et/ou voix
    Pending --> Rejected: un AUTRE locuteur rejette<br/>(motif obligatoire)
    Pending --> Approved: un AUTRE locuteur valide
    Approved --> Published: Mongo écrit, puis Redis HSET + PUBLISH
    Published --> Served: chaque middleware met son catalogue à jour
    Rejected --> Pending: nouvelle proposition
    Served --> Pending: proposition d'amélioration
```

- **Quatre yeux.** La requête de validation exclut l'auteur (`authorId` différent du relecteur) : la règle est tenue par la base, pas seulement par l'écran.
- **Une seule publication.** Le passage de « en attente » à « validée » est atomique.
- **Mêmes contrôles partout.** Emplacements, longueur maximale et 182 septets sont vérifiés par la même fonction dans le navigateur et sur le serveur.

## 6. Pipeline de données

```mermaid
flowchart LR
    subgraph Collecte
        direction TB
        P1[Trafic réel des écrans] --> REF[(references)]
        P2[Amorçage fr, en, lexique] --> REF
        C1[Texte proposé] --> CO[(contributions)]
        C2[Voix enregistrée] --> GF[(GridFS brut)]
    end
    subgraph Validation
        direction TB
        RV{Relecteur tiers} --> TR[(translations)]
        RV --> TC[mp3 16 kHz]
        TC --> GF2[(GridFS mp3)]
    end
    subgraph Diffusion
        direction TB
        RS[(Redis)] -- PUBLISH --> L1[Catalogue en mémoire]
        L1 --> SRV[USSD, SMS : GSM-7]
        L1 --> SRV2[Écrans mobile, web, GAB]
    end
    subgraph Voix
        direction TB
        PG[Synthèse PyTorch] --> V[IVR : /voix/lang/cle.mp3]
    end
    CO --> RV
    GF --> RV
    TR --> RS
    TR --> PG
    GF2 --> V
```

| Étape | Stockage | Garantie |
| --- | --- | --- |
| Référence | `references` | découverte automatique sur le trafic réel, par lot, hors du chemin critique |
| Proposition | `contributions`, GridFS | jamais servie |
| Validation | `translations` | relue par un tiers, auteur et relecteur tracés, versionnée |
| Instantané | Redis `i18n:t:<lang>` | écrit en transaction `MULTI` |
| Service | catalogue en mémoire | O(1), variante GSM-7 précalculée |

Au démarrage : Mongo, puis Redis, puis la mémoire (308 phrases validées chargées en 240 ms, connexions comprises). Si Mongo est indisponible, le gateway démarre sur l'instantané Redis (vérifié en coupant le conteneur Mongo) ; sans les deux, sur ses catalogues intégrés (fr, en, fub). Le service répond toujours.

## 7. Voix

- Synthèse `facebook/mms-tts` (VITS) sous PyTorch, chargée à la demande, une fois par langue.
- Cache disque par empreinte (langue, texte), écriture atomique.
- Refus de synthétiser un gabarit à trous : les montants sont lus par la synthèse SAFINUM.
- Une langue sans modèle est déclarée indisponible, jamais simulée.
- Une voix humaine validée a toujours priorité et n'est jamais remplacée par la synthèse.
- Enregistrements du studio transcodés en mp3 mono 16 kHz, 32 kb/s, servis sous `/voix/<langue>/<clé>.mp3`.

## 8. Sécurité

### Défense en couches

```mermaid
flowchart TB
    I[Requête venue d'Internet] --> C1{1. URL secrète<br/>/hook/secret}
    C1 -- inconnue --> R1[404, rien n'est révélé]
    C1 --> C2{2. Contrôles du payload<br/>structure, canal, langue, 512 Ko}
    C2 -- invalide --> R2[400, sans trace interne]
    C2 --> C3{3. Limite de débit<br/>par numéro}
    C3 -- dépassée --> R3[429]
    C3 --> C4[4. Moteur en deux tours<br/>rien n'est deviné]
    C4 --> C5[5. Client bancaire<br/>URL fixée par la configuration]
    C5 --> BANK[(Banque SAFINUM)]
    C4 -. journaux .-> LOG[Numéros masqués,<br/>saisies jamais écrites]
```

### Tentative de détournement de la clé d'équipe

```mermaid
sequenceDiagram
    autonumber
    actor A as Attaquant
    participant M as Middleware NkapLingua
    participant B as Banque SAFINUM
    participant E as Serveur de l'attaquant
    A->>M: tour forgé, bank_api.base_url = serveur de l'attaquant
    Note over M: l'URL du payload est ignorée,<br/>seules les origines en liste blanche sont appelées
    M->>B: appel avec X-Team-Key vers l'URL configurée
    M--xE: aucun appel
    M-->>A: réponse normale, alerte dans les journaux
```

| Menace | Protection |
| --- | --- |
| Détournement de la clé d'équipe | l'URL bancaire vient de la configuration, jamais du payload ; origines en liste blanche |
| Appels par un tiers | URL déclarée secrète, comparaison à temps constant |
| Abus de la banque à travers le gateway | limite de débit par numéro et par minute |
| Fuite dans les journaux | numéros masqués, saisies jamais journalisées, secret masqué dans l'URL |
| Données financières côté écrans | gabarits seulement, aucun accès bancaire pour ce module |
| Relecture complaisante | quatre yeux imposés en base |
| Session du studio | JWT HS256 httpOnly, rôles relus en base à chaque requête |

## 9. Déploiement

```mermaid
flowchart TB
    CF[Tunnel nommé] --> GW[gateway :8080]
    GW --> RD[(redis)]
    GW --> MG[(mongo)]
    SD[seed : amorçage idempotent] --> MG
    ST[studio :3000] --> MG
    ST --> RD
    ST --> TTS[tts : voix]
    TTS --> MG
    DB[demo-bank, profil demo] -.-> GW
```

Toute l'application se lance avec Docker Compose :

```bash
cp infra/.env.example infra/.env        # SAFINUM_TEAM_KEY, HOOK_SECRET, STUDIO_SECRET, SEED_PASSWORD
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build
```

| Service | Image | Rôle |
| --- | --- | --- |
| mongo | mongo:7 | base définitive, GridFS (volume persistant) |
| redis | redis:7-alpine | instantané et diffusion, AOF activé (volume persistant) |
| seed | nkaplingua/gateway | amorçage idempotent du studio, s'exécute puis s'arrête |
| gateway | nkaplingua/gateway | middleware SAFINUM, port 8080, branché sur `mongodb://mongo` et `redis://redis` |
| studio | nkaplingua/studio | studio linguistique, port 3000 |
| tts | nkaplingua/tts | transcodage mp3 et synthèse (PyTorch avec `TTS_TORCH=1`) |
| demo-bank | nkaplingua/gateway | banque simulée, profil `demo` uniquement |

- Chaque service a un contrôle de santé ; le gateway et le studio attendent Mongo et Redis en bonne santé et la fin de l'amorçage.
- Les secrets viennent de `infra/.env`, jamais commité ; le service refuse de démarrer s'il en manque un.
- Les images tournent sous un utilisateur non root.
- Le gateway garde ses sessions en mémoire : une instance par déploiement. La montée en charge horizontale passera par des sessions partagées dans Redis.
