# Brainstorm — de « Shazam de la finance » à infrastructure linguistique

> Session du J0 (24/11/2026). Point de départ : l'idée de Shane. Point d'arrivée : ce qu'on construit.

## 1. L'idée de départ

Une application Android qui **s'affiche au-dessus des autres** (bulle flottante), **traduit en temps réel**
le texte d'un service financier, et qui, au clic sur la bulle, ouvre un **mini tableau de bord** :
centralisation des services financiers, dépôt / retrait / envoi, dans la langue choisie, avec la voix.

## 2. Ce qui est bon (on garde)

| Point fort | Pourquoi ça compte pour le jury |
|---|---|
| **Superposition sans toucher l'app cible** | Le règlement (§3) exige l'intégration « sans modification de leur code source principal ». C'est exactement ça. |
| **La bulle « Shazam »** | Geste simple, démontrable en 5 secondes, très lisible pour un public peu lettré. Fort sur *Innovation* et *UX/Accessibilité*. |
| **Agir, pas seulement traduire** | Le tableau de bord du jury (§6.D) affiche *intention interprétée* et *paramètres extraits* : il faut comprendre une **demande**, pas seulement afficher une traduction. |
| **La voix** | Indispensable pour la littératie faible — et c'est un canal à part entière (SVI). |

## 3. Ce qui ne passe pas en l'état (désaccords argumentés)

### 3.1 Le produit ne peut pas être « une application »

Le PDF le dit en toutes lettres (§3) : *« dépasser le développement d'une solution conçue pour une seule
application ou un seul terminal »*, et (§12) *« faire des langues nationales une couche technologique
réutilisable plutôt qu'une fonctionnalité isolée »*.

Si la bulle Android EST le produit, on perd sur **Interopérabilité**, **Réutilisabilité** et on ne couvre
pas l'**USSD** et le **web**, qui sont **obligatoires** (§5.3 : mobile + web + USSD).

**Décision** : le produit est **NkapLingua Core**, un moteur linguistique unique (compréhension → dialogue →
réponse) exposé par API et SDK. La bulle Android devient **un client parmi d'autres** — le plus spectaculaire.

### 3.2 « Traduire en temps réel tout l'écran » est un piège

- Coût : relire l'arbre d'accessibilité à chaque frame, repositionner des calques sur des éléments qui
  bougent → batterie, latence, bugs visuels pendant la démo.
- Sécurité : un service d'accessibilité qui lit en continu une app bancaire est **le schéma exact des
  chevaux de Troie bancaires** Android. Google Play restreint `AccessibilityService`, et certaines apps
  bancaires détectent ces services et se ferment. Le jury te le demandera.

**Décision** : mode **« touche pour comprendre »** (le vrai geste Shazam). On touche la bulle → lecture
**ponctuelle** de l'écran visible → fiche claire dans la langue (montant, frais, total, bénéficiaire, alerte
arnaque). Rien n'est lu en arrière-plan, rien ne quitte le téléphone, liste blanche d'applis financières.

### 3.3 « Centraliser nos différents services financiers » : hors sujet et hors délai

Agréger MTN MoMo, Orange Money et des banques réelles demande des accès API qu'aucune équipe n'aura en
3 jours, et soulève des questions d'agrément (COBAC/BEAC). Le jury ne l'évaluera pas.

**Recadrage** : on démontre la **réutilisabilité** en branchant **deux institutions simulées** sur le même
moteur via le port `FinancialPort` (le sandbox SAFINUM + « Mboa Pay »). C'est la même promesse —
« un seul assistant pour mes services » — mais prouvée techniquement.

### 3.4 « Dépôt » n'est pas une action numérique

Un dépôt se fait en espèces chez un agent. Le backend SAFINUM (§6.A) propose : solde, historique,
transferts, crédit téléphonique, factures, frais. **On aligne le tableau de bord sur ces opérations.**
Le **retrait** devient intéressant en multicanal : demandé en fulfulde sur mobile → code de retrait →
utilisé au **GAB** simulé.

## 4. Les améliorations retenues

| # | Amélioration | Critère du jury visé |
|---|---|---|
| A | **Contrat canonique unique** (intention + paramètres + trace) partagé par tous les canaux | Interopérabilité, Réutilisabilité |
| B | **Moteur déterministe et explicable** (indices pondérés, pas de LLM obligatoire) : instantané, hors ligne, chaque décision montrée au jury | Performance, Faisabilité |
| C | **Verrouillage des valeurs** (héritage présélection) : un montant ou un nom n'est jamais traduit, un gabarit qui perd un chiffre est rejeté | Précision, Confiance |
| D | **Dialogue à états** : clarification, correction avant exécution, confirmation obligatoire, idempotence | Scénarios §7 « correction », « ambiguë », « solde insuffisant » |
| E | **Changement de langue en pleine opération** sans perte de contexte | Scénario §7 « changement de langue » |
| F | **Conversation rattachée au titulaire, pas au canal** : commencer en USSD, confirmer sur l'app | Interaction multicanale, wow démo |
| G | **Matrice de cohérence** dans la console jury : une requête rejouée sur 6 canaux, résultats comparés côte à côte | §8 protocole (« comparer la cohérence ») |
| H | **Statut de traduction visible** (référence / attesté / validé / proposé / brouillon) jusque dans la trace | Honnêteté linguistique |
| I | **Trois modes d'intégration** : SDK embarqué, proxy de canal (USSD/SMS), superposition (extension + bulle) | Facilité d'intégration d'un nouveau canal (§10) |
| J | **Anti-arnaque** réutilisé de la présélection, appliqué aux SMS entrants | Innovation, impact |

## 5. Risques et parades

| Risque | Gravité | Parade |
|---|---|---|
| Les traductions fulfulde/pidgin ne sont pas validées par des natifs | **Critique** (critère n°1 du jury) | Recruter **2 locuteurs fulfulde + 1 pidgin dès J1 matin**, sessions de validation de 30 min sur les ~60 gabarits du dialogue. Tout ce qui n'est pas relu reste affiché « brouillon ». |
| La doc d'intégration SAFINUM arrive tard ou diffère | Élevée | Architecture hexagonale : un adaptateur `SafinumBank` à écrire, rien d'autre ne bouge. USSD/SMS au format webhook standard (type Africa's Talking) en attendant. |
| La bulle Android ne marche pas le jour J | Moyenne | Le canal mobile est aussi couvert par l'app React Native (assistant intégré) ; la bulle est un bonus. |
| Réseau du salon instable | Moyenne | Moteur 100 % local, pas de dépendance cloud obligatoire ; démo de secours sur `localhost`. |
| Reconnaissance vocale fulfulde inexistante dans les OS | Élevée | Voix en **sortie** (enregistrements validés + montants en français) ; voix en **entrée** : pidgin via STT anglais, fulfulde via menus vocaux à touches (SVI). Modèle MMS/Omnilingual en piste, pas en promesse. |
