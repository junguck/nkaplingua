# Langues de la sandbox — état réel, sources, méthode

> Mis à jour le 26/11/2026. Langues évaluées par la sandbox SAFINUM : `dua` Duala · `ewo` Ewondo · `bas` Basaa ·
> `bbj` Ghomala · `byv` Medumba · `fub` Fulfulde · `fr` · `en`. La langue est **tirée au sort** par le jury.

## 1. Ce qui compte pour la note, et ce que nous pouvons garantir

Une langue intervient à trois endroits, avec des exigences très différentes :

| Où | Ce qu'il faut | Risque si c'est faux | Peut venir d'un dictionnaire ? |
|---|---|---|---|
| **Comprendre** la saisie USSD (« sans dire *solde* en français ») | mots-clés : argent, envoyer, oui, non… | une demande non comprise → menu | **Oui** : un mot attesté suffit, une erreur ne fait que rater la reconnaissance |
| **Répondre** sur USSD (56 phrases) | phrases complètes, emplacements `{amount}`… | phrase fausse ou ridicule devant le jury | **Non** : une phrase se compose, elle ne se recopie pas d'un dictionnaire |
| **Traduire les écrans** (89 clés) | libellés courts + messages + bulles d'aide | `UNTRANSLATED`, `PLACEHOLDER_BROKEN`, perte de crédibilité | En partie (libellés d'un mot), pas les messages |

Règle appliquée : **les dictionnaires servent à comprendre ; les locuteurs servent à répondre.** Aucune phrase
n'est générée par machine et présentée comme une traduction. Le middleware ne déclare une langue que s'il
a de quoi la servir (USSD : catalogue complet ; écrans : ≤ 25 % de français), sinon il déclare `fr`.

## 2. État par langue

| Langue | Comprendre (USSD) | Répondre (USSD) | Écrans (89 clés) | Sources effectivement lues |
|---|---|---|---|---|
| `fr` | ✓ | ✓ | ✓ (source) | — |
| `en` | ✓ | ✓ | ✓ 89/89 (identique au kit officiel) | kit SAFINUM |
| `fub` Fulfulde | ✓ | ✓ (proposé) | ✓ 88/89 (proposé) | glossaire de présélection |
| `dua` Duala | **partiel** : argent, envoyer, aider, compte, confirmer, oui, non, annuler, « à » | ✗ → `fr` déclaré | ✗ → `fr` | **Helmlinger 1972**, texte intégral (Internet Archive) ; Omniglot (présélection) |
| `ewo` Ewondo | partiel : envoyer, frais, solde, oui, aide (proposés) | ✗ → `fr` | ✗ → `fr` | glossaire de présélection (42 entrées « proposé », sans source citée) |
| `bbj` Ghomala | minimal : argent, envoyer, payer | ✗ → `fr` | ✗ → `fr` | *Dictionnaire Ghomálá'-Français* (PDF) : police encodée, seules les « 2e formes » en clair sont exploitables |
| `bas` Basaa | ✗ | ✗ → `fr` | ✗ → `fr` | aucune : le dictionnaire SIL (Njock 2005) exige une connexion (HTTP 403) |
| `byv` Medumba | ✗ | ✗ → `fr` | ✗ → `fr` | aucune : Kemelang refuse les clients automatisés (HTTP 403) |

### Sources consultées le 26/11

- **Duala** — Helmlinger, P. (1972). *Dictionnaire duala-français suivi d'un lexique français-duala*. Klincksieck.
  Texte intégral OCR : `https://archive.org/details/duala`. Formes retenues (lexique français-duala) : argent *mbolo,
  moni* ; envoyer *lôma* ; acheter *anda* ; aider *ôngwane* ; compte *musongi* ; confirmer *bâmse* ; accepter *basa,
  émea, koa* ; non *kém, cém* ; oui *é* ; annuler (une décision) *wunja* ; à *na* ; téléphone *telefon* ; dette *etom* ;
  cent *ebwéa* ; mille *ikâli* ; dix *dôm*. **L'OCR abîme ɛ et ɔ** : ces formes servent à reconnaître une saisie
  (comparaison repliée), jamais à afficher du duala.
- **Ghomala** — *Dictionnaire Ghomálá'-Français* (PDF, `lielatatomdjap.org`, 96 p.). Les mots ghomala sont dans une
  police propriétaire (substitution de caractères) ; seules les formes imprimées en clair sont reprises : envoyer
  *shyaàa*, acheter/payer *joà*, accepter *biàñ/byéàñ*, refuser *ñkóóà*. Argent *ŋkáp* (glossaire de présélection,
  cohérent avec le dictionnaire). Une conversion complète de la police est possible mais n'a pas été faite.
- **Non accessibles** : SIL (basaa), Kemelang (ghomala, medumba), Omniglot (refuse les robots — pas de contournement).
  Références imprimées à consulter sur place : Njock (2005, basaa, ~16 000 entrées), Domche-Téko (2012, ghomala, éd. CLÉ),
  Tsala (1958) et Atangana Ondigui (2007, ewondo), Ittmann (1976, duala).

## 3. Méthode pour « faire toutes les langues » proprement

1. **Comprendre** (fait en partie, à étendre) : mots attestés → `packages/core/src/lexicon/intents.lexicon.ts`,
   source en commentaire. Une forme non attestée n'y entre qu'en statut « proposé » et après un locuteur.
2. **Répondre** : un **pack de langue** par langue, rempli par **deux locuteurs** :
   - `pnpm --filter @nkap/gateway i18n modele` → `apps/gateway/translations/_modele.json` (89 clés d'écran,
     56 phrases USSD, avec le français et l'anglais en regard) ;
   - copier en `dua.json` (etc.), remplir, garder **exactement** les emplacements `{x}` ;
   - `pnpm --filter @nkap/gateway i18n verifier` → couverture, emplacements, 182 septets ; `pnpm test` refuse un pack cassé ;
   - redémarrer le middleware : la langue est servie dès que le pack USSD est complet, les écrans dès 75 % de clés.
3. **Statuts** : `proposed` (un locuteur), `validated` (deux locuteurs distincts), `draft` (jamais relu). Le statut
   est dans le pack ; seul `validated` doit être présenté au jury comme une traduction validée.

Ordre recommandé (rapport effort / note) : **écrans** d'abord (89 libellés courts, relus en ~1 h à deux), puis les
**messages USSD critiques** (récapitulatif, frais, solde insuffisant, confirmation), puis le reste.
