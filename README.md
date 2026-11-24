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
| **Tests** | **53/53**, dont les **10 scénarios standardisés du §7** joués de bout en bout |

Prochaines étapes : passerelle NestJS + USSD (J1), web + console jury + mobile + bulle Android (J2),
voix et démonstration (J3) — voir [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Démarrer

```bash
corepack enable            # pnpm 10
pnpm install
pnpm test                  # 53 tests, < 1 s
pnpm typecheck             # TypeScript strict, zéro any
```

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
  banking-sim/   backend financier simulé (remplaçable par l'adaptateur SAFINUM)
apps/
  extension/     extension navigateur de la présélection (superposition de pages)
docs/            brainstorm, roadmap, architecture, ADR
preselection/    livrables de la phase de sélection
```

## Honnêteté linguistique

Chaque phrase affichée porte un statut : **référence** (français/anglais), **attesté** (source écrite),
**validé** (deux locuteurs natifs), **proposé** (glossaire de l'équipe), **brouillon** (jamais relu).
Le statut le plus faible d'une réponse remonte jusqu'à la trace du jury. Les formes fulfulde et pidgin
non validées **doivent** être relues par des locuteurs natifs avant la démonstration officielle.
