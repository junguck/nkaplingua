# 1 · Description de la solution et problème résolu

**NkapLingua — la finance dans nos langues**
*SAFINUM Innovate Challenge 2026 · CNEF · Salon de la Finance Numérique, Yaoundé*

---

## Le problème

Au Cameroun, l'argent est devenu numérique bien plus vite que le vocabulaire qui l'entoure. Un
commerçant de Ngaoundéré, une tontinière de Mbalmayo, un élève de Meiganga utilisent chaque jour des
interfaces de mobile money et de banque **écrites en français ou en anglais** : « solde disponible »,
« frais de retrait », « plafond journalier », « bénéficiaire », « total à débiter », « transaction
irréversible ».

Trois conséquences concrètes, observées sur le terrain :

1. **On ne comprend pas ce qu'on signe.** Un montant mal compris, un frais invisible, un total qui ne
   correspond pas : l'argent part sans que l'utilisateur ait réellement validé.
2. **On est une cible.** Les SMS d'arnaque (« envoyez votre code PIN pour recevoir votre gain »)
   fonctionnent d'autant mieux que la victime ne lit pas couramment la langue de l'interface.
3. **On dépend de quelqu'un.** Il faut un proche lettré pour lire l'écran — ce qui fait fuiter le code
   secret et le solde.

Les services financiers, eux, ne peuvent pas réécrire leurs applications pour douze langues : c'est
cher, lent, et cela demande de toucher au cœur du système transactionnel.

## La solution

**Une extension de navigateur qui se pose par-dessus n'importe quelle interface financière** et
superpose une couche de compréhension en langue camerounaise — **sans modifier le service, sans
installer quoi que ce soit côté banque, sans envoyer une seule donnée.**

Concrètement, sur la page telle qu'elle s'affiche :

- chaque phrase financière reçoit une **note** dans la langue choisie (fulfulde, pidgin, ewondo, duala,
  basaa, ghomálá', gbaya…), avec la traduction des mots-clés et un pictogramme quand la langue n'est pas
  encore disponible ;
- une **fiche claire** résume le montant, les frais, le bénéficiaire, le numéro et le total, et
  **recalcule** `montant + frais = total` : si le total ne tombe pas juste, l'écart est signalé ;
- un **bouclier anti-arnaque** détecte huit familles de signaux (demande de code, faux gain, « payer
  pour recevoir », urgence, menace de blocage, lien suspect, code USSD avec PIN…) et affiche une alerte ;
- un **guide pas à pas** accompagne le transfert, champ par champ, jusqu'à la confirmation ;
- un **répondeur vocal simulé** reprend les mêmes parcours au téléphone, pour ceux qui ne lisent pas
  encore l'écran ;
- un **Studio linguistique** permet aux locuteurs natifs de corriger, d'enregistrer leur voix et de
  valider chaque entrée — deux validateurs distincts sont nécessaires.

## Ce qui rend la solution défendable

| Principe | Mise en œuvre |
|---|---|
| **Ne jamais trahir le chiffre** | Les montants, noms, numéros, références, pourcentages et dates sont **verrouillés** avant traduction puis réinjectés à l'identique ; un gabarit qui perd ou ajoute un chiffre est **rejeté** |
| **Ne jamais inventer** | Si la langue n'a pas l'entrée, on affiche le **français facile** avec un badge honnête (`FR facile`), jamais une traduction fabriquée |
| **Ne rien envoyer** | Aucune collecte, aucun compte, aucun appel réseau ; le glossaire est embarqué. L'IA est **optionnelle**, et si elle est activée elle ne voit qu'un texte **masqué** (`⟦0⟧` à la place des montants et des noms) |
| **Ne pas dépendre du service** | Lecture seule du DOM, aucune modification du code cible, fonctionne sur tout site en français **ou** en anglais, y compris les interfaces dynamiques |
| **Être vérifiable** | 19 tests du moteur (`npm test`), 40 vérifications de bout en bout dans un Chrome réel avec l'extension chargée, et un test sur le site du hackathon : 9 notes posées, montant `250 000 FCFA` inchangé, zéro erreur console |

## Pour qui

- **Usagers** du mobile money, des banques et de la microfinance qui parlent une langue nationale ;
- **commerçants et tontiniers** qui valident des transactions pour d'autres ;
- **institutions** (banques, EMF, opérateurs) qui veulent tenir leur promesse d'inclusion sans refonte
  logicielle : un simple attribut `data-nkap-concept` dans leurs pages rendrait la reconnaissance parfaite ;
- **universités et associations de locuteurs**, qui disposent là d'un outil concret de documentation et de
  validation des langues.

## Impact attendu

Moins de transactions mal comprises, moins d'arnaques abouties, et une inclusion qui ne demande **ni
nouvelle application, ni nouveau compte, ni nouvelle connexion** : le coût marginal d'une langue
supplémentaire est d'un fichier JSON validé par ses locuteurs.

## Limites assumées (détail au livrable 4)

L'extension couvre le **web** : les applications natives Android/iOS demandent un *Accessibility Service*
(feuille de route) ; les textes rendus en image ou en canvas ne sont pas lus ; il n'existe pas de
synthèse vocale fulfulde — la voix native vient des enregistrements validés dans le Studio.
