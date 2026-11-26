# ADR 0002 — Bulle Android : « touche pour comprendre », pas de traduction continue

**Statut** : accepté (J0)

## Contexte
L'idée initiale : traduire en temps réel tout le texte des applications financières affichées.

## Décision
La bulle déclenche une lecture **ponctuelle** de l'écran (service d'accessibilité, liste blanche
d'applications financières), puis affiche une fiche claire dans la langue choisie. Aucune lecture en
arrière-plan, aucun envoi réseau du contenu de l'écran.

## Conséquences
+ Pas de coût batterie/latence, pas de calques mal positionnés en démo.
+ Argument de sécurité défendable face au jury (les chevaux de Troie bancaires utilisent la lecture continue).
− Moins « magique » qu'un sous-titrage permanent.
− `AccessibilityService` reste soumis à la politique Google Play : distribution hors Play pour la démo.
