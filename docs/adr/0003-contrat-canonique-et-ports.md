# ADR 0003 — Contrat canonique et port financier (hexagonal)

**Statut** : accepté (J0)

## Contexte
Six canaux possibles, une documentation d'intégration SAFINUM pas encore reçue, et un critère
« réutilisabilité sur plusieurs plateformes ou institutions ».

## Décision
- `@nkap/contracts` définit l'unique format d'échange (intention, paramètres, tour, trace) et le port
  `FinancialPort` que chaque institution implémente.
- Le moteur ne connaît ni les canaux (seulement leur profil : longueur, mode) ni les backends (seulement le port).
- Les entrées structurées (menus, boutons) et le langage naturel convergent vers la même `Interpretation`.

## Conséquences
+ La doc SAFINUM n'impacte qu'un adaptateur. Un nouveau canal = un adaptateur d'entrée/sortie.
+ La cohérence multicanale est garantie par construction et vérifiée par test.
− Un canal ne peut pas « tricher » avec un comportement propre : toute spécificité passe par le profil.
