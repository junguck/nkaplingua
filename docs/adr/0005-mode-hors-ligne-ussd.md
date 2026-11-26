# ADR 0005 — Mode hors-ligne d'abord pour les menus USSD

**Statut** : accepté (J3)

## Contexte
L'USSD est le canal des zones à faible couverture. Le budget est de 3 s par tour : si l'API bancaire
est injoignable, attendre son délai d'expiration à chaque tour rend le service inutilisable. Les
traductions, elles, n'ont pas besoin du réseau : elles sont embarquées dans le middleware.

## Décision
1. **Cache de traductions par clé** (`TranslationCache`) : chaque chaîne garde ses contraintes
   (`max_chars`, charset `gsm7` pour l'USSD à 182 septets, `utf8` pour mobile/web). Il est garni au
   démarrage depuis les catalogues embarqués ; un instantané fichier (`offline.cacheFile`) est relu
   au démarrage et réécrit à chaque correction.
2. **Détection de panne** (`Connectivity` + `ResilientBank`) : un `UNREACHABLE` de la banque passe le
   middleware hors-ligne ; il ne la sonde ensuite qu'une fois toutes les 15 s.
3. **Réponse de secours** : banque injoignable → message d'indisponibilité + menu complet, pré-traduit
   dans la langue du tour, depuis le cache seul (GSM-7, ≤ 182 septets, `end_session: false`).
4. **File de synchronisation** (`SyncQueue`) : `gateway.correct(langue, clé, texte, max_chars, charset)`
   valide la chaîne (longueur, charset, emplacements `{x}` identiques), l'applique tout de suite au
   cache, puis l'enfile. Une nouvelle correction de la même clé remplace la précédente. Au retour du
   réseau, `gateway.sync()` rejoue la file via un `sender` injectable.

## Conséquences
+ Aucun temps d'attente en zone blanche : la réponse est locale et immédiate.
+ Une correction est effective hors-ligne avant d'être synchronisée ; une chaîne invalide est refusée à l'entrée.
− Seuls le menu et le message d'indisponibilité sont servis hors-ligne ; un dialogue en cours repart du menu.
− Aucun point de terminaison de synchronisation n'est documenté par SAFINUM : le `sender` n'est pas
  branché, la file attend. La file est vidée seulement si le `sender` répond `true`.
− Une seule instance du middleware : le cache et la file sont locaux (pas de partage entre instances).
