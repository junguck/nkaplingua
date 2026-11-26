# ADR 0006 — Le middleware SAFINUM s'appuie sur le moteur partagé

**Statut** : accepté (J3)

## Contexte
Le middleware (`apps/gateway`) avait été écrit comme un programme autonome, sans dépendance au
monorepo, pour être lancé par `tsc` + `node` sans étape de bundle. Résultat : un **second moteur**.
Il avait sa propre détection de langue, sa propre liste d'intentions, sa propre translittération GSM-7,
et une copie de la grille de frais (trois en tout avec `banking-sim` et la banque de démonstration).
L'ewondo et le bulu ajoutés au moteur ne pouvaient pas atteindre le chemin évalué par le jury, et une
phrase comme « Neldu ujineere jowi ka Fadimatou » était comprise sur le web mais pas sur l'USSD.

## Décision
1. **`@nkap/safinum`** regroupe tout ce que la sandbox impose : protocole de la passerelle, 13 intentions,
   langues, grille de frais officielle (seule copie), correspondance des intentions et des statuts.
2. **GSM-7 vit dans `@nkap/core`** : le middleware et `formatForChannel` (USSD/SMS) partagent la même
   translittération et le même compte en septets (`ChannelProfile.charset`).
3. **Une seule détection de langue**, celle du moteur. Le middleware n'ajoute que sa prudence propre :
   il ne déclare qu'une langue qu'il sert en entier sur USSD (`fr`, `en`, `fub`) et exige un écart net.
4. **Texte libre sur USSD** : quand la saisie n'est pas un choix du menu, `interpret` du moteur la comprend
   et `free-text.ts` la transforme en point d'entrée du dialogue USSD, qui reste propriétaire du cycle
   `pending → confirm` au tour suivant. Le menu numéroté reste la voie principale.
5. **Statut de transaction** : par défaut, uniquement les valeurs observées (`none`, `pending`), selon
   SANDBOX-SAFINUM §8. Le cycle brut est disponible avec `SAFINUM_STATUS=lifecycle`.
6. **Build par bundle esbuild** : `dist/server.js` embarque les paquets TypeScript du monorepo et
   démarre sans aucune dépendance npm à l'exécution.

## Conséquences
+ Une correction de lexique, de langue ou de frais profite à la fois au web, au mobile, à la bulle et au middleware.
+ Le chemin évalué comprend les phrases des scénarios §7, pas seulement les touches du menu.
− Le dialogue USSD reste distinct du `DialogueManager` du moteur : le port financier du moteur
  (`quote/execute`) ne connaît pas encore le cycle `initiate/update/confirm/cancel`. Les unifier
  est la prochaine étape (voir ROADMAP).
− Le bundle fait environ 580 ko, zod compris. C'est acceptable pour un service Node.
