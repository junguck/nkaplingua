# 5 · Langues prises en charge et méthode de validation linguistique

---

## 1. Langues prises en charge

L'extension reconnaît les interfaces en **français** et en **anglais**, et restitue en **français
facile + pictogrammes** ou dans une **langue nationale**.

Deux glossaires coexistent, tous deux générés par `tools/build-glossary.mjs` :

- **superposition des pages** : 129 concepts financiers (`glossary/concepts.json`) ;
- **répondeur vocal** : 221 énoncés de parcours (`glossary/ivr.json`).

État réel des traductions (mesuré sur `glossary/ivr.json`, 221 énoncés) :

| Code | Langue | Entrées | Attesté | Proposé | Brouillon IA | Faible | Repli |
|---|---|---|---|---|---|---|---|
| `fr-facile` | Français facile + pictogrammes (référence) | 221 | — | — | — | — | — |
| `fub` | **Fulfulde (Adamaoua)** | 213 | 44 | 123 | 46 | — | 8 |
| `wes` | **Pidgin camerounais (Kamtok)** | 129 | — | 129 | — | — | 92 |
| `ewo` | **Ewondo** | 19 | 2 | 7 | — | 10 | 202 |
| `dua` | **Duala** | 6 | 6 | — | — | — | 215 |
| `bas` | **Basaa** | 2 | 1 | 1 | — | — | 219 |
| `bbj` | **Ghomálá'** | 1 | — | 1 | — | — | 220 |
| `gya` | **Gbaya (nord-ouest)** | 5 | — | 5 | — | — | 216 |
| `mdd` | **Mbum** | 3 | 1 | 2 | — | — | 218 |
| `tik` | **Tikar** | 1 | 1 | — | — | — | 220 |
| `vut` | Vute | 0 | — | — | — | — | 221 |
| `dur` | Dii (Duru) | 0 | — | — | — | — | 221 |

**Langues effectivement démontrables aujourd'hui** : français facile (référence), **fulfulde** (le plus
complet, 100 % des concepts couverts avec statut explicite), **pidgin**, puis ewondo / duala / basaa /
ghomálá' / gbaya en **kits de démarrage** — ils s'affichent quand l'entrée existe, et retombent
honnêtement sur le français facile sinon (badge `FR facile`).

> Aucune langue n'est jamais « inventée » : une entrée absente produit un repli visible, pas une
> traduction générée à la volée.

## 2. Les quatre statuts d'une entrée

| Statut | Affichage | Signification |
|---|---|---|
| `atteste` | badge ✓ (bleu) | Forme attestée dans une source écrite (ALCAM, lexiques, littérature) |
| `valide` | badge ✓ (vert) | **Validée par deux locuteurs distincts** dans le Studio |
| `propose` | badge ◌ | Proposition de l'équipe, **non validée** — à faire confirmer |
| `draft` | étiquette « brouillon IA » | Proposition automatique, jamais prononcée, jamais présentée comme validée |
| `manquant` | badge `FR facile` | Pas d'entrée : repli français facile + pictogramme |

## 3. Méthode de validation linguistique

### 3.1 Principe : deux locuteurs distincts, jamais un seul

Le code refuse une validation venant de la personne qui a enregistré
(`audio-store.js` : `if (who === r.by) throw new Error('la validation doit venir d'un AUTRE locuteur')`).
Une entrée n'est « validée » que si `speakersOf(rec).size >= 2`. C'est la règle qui distingue
« un locuteur a proposé » de « la communauté a approuvé ».

### 3.2 Le protocole, pas à pas

1. **Préparer** — ouvrir `chrome://extensions` → l'extension → *Studio linguistique* (ou options →
   Studio). Choisir la langue ; saisir son nom dans *Validateur·rice*.
2. **Traiter en priorité les entrées critiques** (pastille corail : sécurité, montants, conditions) —
   filtre « critiques ».
3. **Corriger** le texte si nécessaire, en conservant **exactement** les emplacements `{AMOUNT}`,
   `{NAME}`, `{PHONE}`… Le Studio refuse un gabarit dont les emplacements diffèrent, et refuse tout
   chiffre écrit en dur.
4. **Enregistrer la voix** (bouton 🎙️ Voix) — c'est la **seule** source de prononciation native.
5. **Valider** (bouton *Valider*) : le premier locuteur fait passer l'entrée en « 1 validation » ;
   un **second locuteur, avec un autre nom**, la fait passer en `validé`.
6. **Vérifier** dans le répondeur : la langue n'est **parlée** que si l'enregistrement de l'énoncé
   d'accueil est validé par deux locuteurs ; sinon le répondeur annonce le repli et poursuit en
   français facile.
7. **Exporter / fusionner** : les exports JSON du Studio sont fusionnables entre groupes de validateurs
   (`ovr:<langue>` dans `chrome.storage.local`), puis intégrés au glossaire par
   `node tools/build-glossary.mjs`.

### 3.3 Ce que la machine garantit, et ce qu'elle ne garantit pas

**Garanti automatiquement** (tests) :
- les emplacements `{AMOUNT}`, `{NAME}`… sont identiques entre la référence et la traduction ;
- aucun chiffre en dur dans un gabarit ;
- un gabarit corrompu (un chiffre perdu) est **rejeté** à l'exécution ;
- le mode strict n'utilise que les entrées `attesté`/`validé` ;
- une langue sans entrée retombe sur le français facile, sans invention.

**Non garanti par la machine** : la **justesse sémantique** et la **tonalité**. Les tons ne sont pas
notés dans les entrées proposées ; c'est précisément pourquoi la validation par deux locuteurs natifs
est obligatoire avant toute démonstration officielle.

## 4. Reste à faire (transparence)

- Faire valider les **123 entrées fulfulde « proposées »** et arbitrer les **46 brouillons** ;
- enregistrer les **énoncés d'accueil du répondeur** (`ivr.*`) par deux locuteurs par langue ;
- compléter l'ewondo, le duala, le basaa, le ghomálá' et le gbaya (kits de démarrage) ;
- noter les tons dans les entrées validées ;
- partenariat universitaire (département de langues africaines, Université de Yaoundé I) et jeux de
  données ALCAM pour un corpus audio des 129 concepts.

## 5. Où voir la couverture

- Fenêtre de l'extension : couverture de la langue choisie (ex. « Fulfulde (Adamaoua) · 100 % traduit »).
- Studio linguistique : `129/129 traduites · 6 attestées ou validées · 0/20 critiques validées` pour le
  fulfulde au moment de la livraison — le compteur des critiques est le tableau de bord du travail
  restant.
- `docs/GLOSSAIRE.md` et `docs/glossaire.csv` : le dictionnaire complet avec le statut de chaque entrée.
