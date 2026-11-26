# NkapLingua 2 — l'infrastructure linguistique des services financiers

**SAFINUM Innovate Challenge 2026 · finale** (CNEF · Wave · Huawei)

> *« Le challenge ne consiste pas simplement à traduire les services financiers. Il s'agit de construire
> l'infrastructure linguistique qui les rend accessibles partout. »* — règlement, §12

NkapLingua comprend une demande financière **en fulfulde, en pidgin, en français ou en anglais**, sur
**n'importe quel canal** (application, web, USSD, SMS, serveur vocal, guichet), l'exécute sur le système
de l'institution **sans modifier son code**, et répond dans la langue de l'utilisateur — **sans jamais
altérer un montant, un nom ou un numéro**.

```
« Neldu ujineere jowi ka Fadimatou »          (fulfulde, sur USSD)
  → intention TRANSFER · montant 5 000 XAF · bénéficiaire Fadimatou Bouba (699000003)
  → « A neldan 5 000 FCFA ka Fadimatou Bouba, limgal 699000003. Njoɓdi: 50 FCFA. … »
  → « Eey » (confirmé, éventuellement depuis l'application mobile)
  → exécuté · référence MBP00000001 · trace complète dans la console du jury
```

## Ce qui est prêt (J0)

| | |
|---|---|
| **Moteur** `@nkap/core` | compréhension (langue, montants en chiffres et en lettres dans 4 langues, intention, bénéficiaire), dialogue à états (clarification, correction, confirmation, idempotence), rendu multilingue à valeurs verrouillées, mise en forme USSD/SMS |
| **Contrat** `@nkap/contracts` | intentions canoniques, tours, traces jury (§6.D), port financier, schémas zod |
| **Banque simulée** `@nkap/banking-sim` | comptes, contacts, grilles de frais, plafonds, historique, codes de retrait |
| **Tests** | **73/73**, dont les **10 scénarios standardisés du §7** joués de bout en bout |

## Ce qui est prêt (J2 — clients)

| | |
|---|---|
| **Client partagé** `@nkap/client` + `@nkap/react` | port `NkapClient` (moteur embarqué aujourd'hui, gateway demain), stores observables communs au web et au mobile, actions rapides, libellés d'interface à statut de traduction |
| **Web** `apps/web` | Next.js 16 + shadcn/ui : banque en ligne simulée + assistant (texte, micro, fiche verrouillée, statut, trace jury) |
| **Mobile** `apps/mobile` | Expo SDK 58 : tableau de bord, assistant hors ligne, réglages de la bulle |
| **Bulle Android** `apps/mobile/modules/nkap-bubble` | module natif Kotlin : bulle flottante + lecture d'écran **à la demande** (liste blanche, jamais les champs secrets) → fiche claire rendue par le moteur TypeScript |
| **Lecture d'écran** `@nkap/core/screen` | montant, frais, total, bénéficiaire, contrôle « montant + frais = total », bouclier anti-arnaque |

Reste : **le middleware SAFINUM (J1, P0, chemin évalué par le jury)**, la console jury, la voix —
voir [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Démarrer

```bash
corepack enable            # pnpm 10
pnpm install
pnpm test                  # 73 tests, < 1 s
pnpm typecheck             # TypeScript strict, zéro any (paquets + web + mobile)

pnpm dev:web               # http://localhost:3000 — banque en ligne + assistant
pnpm dev:mobile            # Expo (écrans) ; la bulle exige un build Android :
pnpm android               # expo prebuild + run:android (SDK Android requis)
pnpm check:bubble          # compile le Kotlin de la bulle sans SDK Android (Gradle)
```

La bulle ne fonctionne pas dans Expo Go (module natif). Sur l'appareil : onglet **Bulle** →
autoriser la superposition et « Lecture d'écran à la demande » → **Lancer la bulle**.

## Documentation

| Document | Contenu |
|---|---|
| [`docs/BRAINSTORM.md`](docs/BRAINSTORM.md) | De l'idée « Shazam de la finance » au produit : ce qu'on garde, ce qu'on change, pourquoi |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Plan des 3 jours, priorités P0/P1/P2, correspondance avec les livrables §11 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architecture, technologie linguistique, intégration, sécurité, scalabilité |
| [`docs/adr/`](docs/adr/) | Décisions d'architecture et leurs compromis |
| [`docs/SANDBOX-SAFINUM.md`](docs/SANDBOX-SAFINUM.md) | Contrat de la sandbox SAFINUM, règles d'évaluation, écarts à corriger |
| [`preselection/`](preselection/) | Dossier de la phase de présélection (extension v1.1, vidéo, notes) |

## Structure

```
packages/
  contracts/     le contrat partagé par tous les canaux et toutes les institutions
  core/          le moteur linguistique (pur TypeScript : Node, navigateur, React Native)
    src/text/      normalisation, lecture des montants, formatage déterministe
    src/lexicon/   intentions, messages, terminologie, langues — avec statut de validation
    src/nlu/       langue, entités, intention, interprétation
    src/dialogue/  machine à états, session, fusion des corrections
    src/render/    rendu verrouillé par langue, mise en forme par canal
    src/screen/    lecture ponctuelle d'un écran tiers (bulle, extension) + anti-arnaque
  banking-sim/   backend financier simulé (remplaçable par l'adaptateur SAFINUM)
  client/        port NkapClient, client embarqué, stores partagés web/mobile, libellés d'interface
  react/         provider + hooks React (web et React Native)
apps/
  web/           Next.js + shadcn/ui : banque en ligne simulée + assistant
  mobile/        Expo : tableau de bord, assistant, réglages de la bulle
    modules/nkap-bubble/  module natif Kotlin de la bulle (+ jvm-check : compilation sans SDK)
  extension/     extension navigateur de la présélection (superposition de pages)
docs/            brainstorm, roadmap, architecture, ADR
preselection/    livrables de la phase de sélection
```

## Honnêteté linguistique

Chaque phrase affichée porte un statut : **référence** (français/anglais), **attesté** (source écrite),
**validé** (deux locuteurs natifs), **proposé** (glossaire de l'équipe), **brouillon** (jamais relu).
Le statut le plus faible d'une réponse remonte jusqu'à la trace du jury. Les formes fulfulde et pidgin
non validées **doivent** être relues par des locuteurs natifs avant la démonstration officielle.
