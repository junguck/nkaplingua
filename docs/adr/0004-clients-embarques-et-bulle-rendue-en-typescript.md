# ADR 0004 — Clients web/mobile sur un port `NkapClient`, bulle rendue en TypeScript

**Statut** : accepté (J2)

## Contexte
Le web et le mobile devaient être livrés avant la gateway (J1). La bulle Android doit afficher une
fiche dans 4 langues, avec les mêmes garanties (valeurs verrouillées, statut de traduction) que le
reste du produit. Le temps est compté : aucune logique ne doit être écrite deux fois.

## Décision
1. **Port `NkapClient`** (`@nkap/client`) : `send`, `account`, `history`, `onTrace`. Implémentation
   actuelle : `LocalNkapClient` (moteur + banque simulée embarqués). La gateway sera une seconde
   implémentation ; aucun écran ne change.
2. **Stores sans framework** (`ConversationStore`, `WalletStore`) compatibles `useSyncExternalStore`,
   liés à React par `@nkap/react` : le web et React Native partagent l'état, les règles (un tour à la
   fois, boutons du dernier message seulement) et les tests.
3. **Les boutons du tableau de bord sont des entrées `intent` du même dialogue**, pas des formulaires :
   frais, plafonds, confirmation et idempotence restent dans le moteur.
4. **Bulle : Kotlin affiche, TypeScript comprend.** Le service lit l'écran (liste blanche, champs mot
   de passe exclus), envoie les lignes au moteur JS (`readScreen` → `renderScreenCard` →
   `bubbleCardFor`) qui renvoie une fiche déjà rendue ; la vue native ne connaît aucune langue.

## Conséquences
+ Une seule implémentation de la compréhension et du rendu pour 4 surfaces (web, mobile, bulle, extension).
+ La fiche de la bulle est testée en Vitest (`packages/core/test/screen.test.ts`, `packages/client/test/bubble-card.test.ts`).
− La bulle dépend du processus JS : s'il est suspendu, la bulle ouvre l'application après 2 s (repli).
− Le moteur et la banque simulée tournent dans le client : en démo, l'état repart à zéro au rechargement.
  Le chemin évalué par la sandbox SAFINUM reste le middleware (J1), pas ces clients.
