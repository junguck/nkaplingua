# NkapLingua — dossier technique de présentation

**État au 27 novembre 2026 · Branche de travail : `noshane-main`**

## Résumé exécutif

NkapLingua est une infrastructure linguistique déterministe pour les services financiers numériques. Le dépôt combine un moteur TypeScript partagé, un middleware d’intégration SAFINUM, une banque simulée, une application web, une application mobile Android et une extension de navigateur. Le middleware prend en charge les canaux SAFINUM disponibles dans la documentation actuelle : USSD, mobile et web.

Le contrôle local le plus récent compte 154 tests passés et le typage passe pour le moteur, le middleware, le web et le mobile. La clé SAFINUM est valide, mais l’équipe ne possède pas d’URL middleware déclarée : les simulateurs répondent `NO_ENDPOINT`. La démonstration SAFINUM de bout en bout n’est donc pas encore validée.

## Architecture

| Composant | Rôle | État |
|---|---|---|
| `packages/contracts` | Contrats, traces, types d’opération et profils de canaux | Implémenté |
| `packages/core` | Détection de langue, extraction d’entités, intentions, dialogue, rendu, GSM-7 et contrôles d’écran | Implémenté et testé localement |
| `packages/safinum` | Contrat SAFINUM, intentions, frais, statuts et formats | Aligné sur la documentation et le starter Node |
| `apps/gateway` | Middleware USSD et traduction UI mobile/web, adaptateur bancaire, sessions et banque de démo | Fonctionnel dans les tests locaux ; non connecté à un endpoint public déclaré |
| `apps/web` | Banque web simulée et assistant linguistique | Typecheck réussi ; build production non confirmé |
| `apps/mobile` | App Expo, assistant et bulle Android | Typecheck réussi ; APK/appareil non vérifié ici |
| `apps/extension` | Extension de présélection et lecture ponctuelle d’écran | Présente dans le dépôt |

## Ce qui est démontré

- Le moteur est déterministe : il n’appelle pas de modèle d’IA pour comprendre ou répondre.
- Les montants, noms et numéros injectés dans les gabarits sont protégés par des emplacements. Une traduction ayant des emplacements différents est rejetée ; l’intégrité du rendu est calculée et remonte dans la trace.
- La comparaison aller-retour vérifie les emplacements, nombres, marqueurs de négation connus et collisions de textes. Elle est maintenant appelée pendant le rendu du moteur : en présence d’une anomalie connue, le texte français est servi et `roundTrip: "to_check"` est ajouté à la validation de trace.
- Les réponses USSD sont translittérées vers GSM-7 et formatées sous le plafond de 182 septets, options comprises.
- Le middleware parle à l’API bancaire avec `X-Team-Key` et `X-Trace-Id`, crée une opération en attente et demande une confirmation séparée.
- Les langues ont des statuts de confiance. Les traductions non validées restent marquées comme proposées ; l’absence de pack complet entraîne un repli français déclaré.
- Le second regard est un module optionnel testé avec la banque de démonstration. Le contrôle anti-arnaque est une analyse heuristique prudente, avec résultat « non détecté » plutôt que « sûr ».
- Le cache hors ligne peut servir un menu prétraduit ; la file de changements est locale et la synchronisation distante nécessite un `sender` fourni par l’intégration.

## Validation réalisée

- Suite Vitest : **154 tests réussis** au dernier contrôle.
- TypeScript : contrats, core, SAFINUM, gateway, web et mobile passent le typecheck.
- La clé fournie est valide pour l’équipe `shun-and Co`, identifiant `shun-and-co`.
- Les pages simulateur USSD, mobile et web existent. Les requêtes de test ont été acceptées par le simulateur mais signalées `NO_ENDPOINT`, car aucune URL n’est enregistrée.
- Les simulateurs ATM, IVR et SMS renvoient 404 et sont indiqués comme canaux planifiés.
- Le build production web est resté bloqué pendant la compilation ; le build gateway n’a pas pu être exécuté car `esbuild` manque dans l’installation locale. Aucun build natif Android ni essai sur appareil n’a été confirmé.

## Limites à annoncer au jury

1. **La sandbox n’est pas validée de bout en bout.** Il faut exposer le gateway sur une URL publique stable et faire déclarer les trois canaux avant l’évaluation.
2. **La validation linguistique par deux locuteurs n’est pas achevée.** Fulfulde et pidgin sont proposés ; d’autres langues sont partielles ou retombent sur le français. Le contrôle lexical ne remplace pas une relecture humaine.
3. **Le contrôle aller-retour est lexical, pas sémantique complet.** Il ne sait auditer que les gabarits connus et les marqueurs reconnus pour certaines langues. Les textes libres nécessitent une analyse dédiée et une validation humaine.
4. **Le middleware SAFINUM sert trois canaux documentés.** L’IVR ajouté dans le travail en cours est un adaptateur local expérimental qui réutilise le dialogue USSD ; il n’est pas un canal disponible dans le simulateur SAFINUM et ne transcrit pas l’audio.
5. **L’extension et la bulle ne sont pas des endpoints évalués par la sandbox.** Ce sont des surfaces complémentaires du produit.
6. **Le second regard n’envoie pas de SMS réel par défaut.** L’adaptateur de notification est injecté ; l’opérateur et le parcours de configuration utilisateur restent à connecter.
7. **Le mode hors ligne ne synchronise pas encore les corrections avec un service central.** Il sert des données mises en cache et garde les changements dans une file locale jusqu’au branchement d’un expéditeur.

## État à venir

### Priorité immédiate

- Installer les dépendances de build manquantes, refaire le build de production web et le build gateway.
- Fournir un tunnel HTTPS stable, déclarer les endpoints USSD/mobile/web et jouer les scénarios dans l’environnement SAFINUM.
- Ajouter des locuteurs natifs et valider les packs prioritaires, notamment pour l’écran et les phrases critiques USSD.
- Vérifier les résultats de traduction/fallback et les statuts financiers dans les traces du jury.

### Évolutions produit

- Rendre les packs linguistiques installables et actualisables sans nouvelle version du logiciel.
- Ajouter des audits plus riches, mesurant aussi les mentions obligatoires des valeurs métier et couvrant mieux les marqueurs linguistiques.
- Brancher les clients web et mobile au gateway pour démontrer la continuité d’une session entre canaux.
- Ajouter un adaptateur SMS réel et un stockage de session partagé, avec consentement et politique de confidentialité.
- Déployer l’approbation du proche pour les gros transferts avec un fournisseur SMS, expiration et audit.
- Concevoir un pipeline voix (STT/TTS) avec mesure de confiance et reprise DTMF ; aucune entrée audio brute ne doit être prétendue comprise actuellement.

## Dix améliorations du projet

1. Générer une spécification OpenAPI depuis les schémas réellement utilisés.
2. Ajouter des traces structurées persistantes et consultables avec rétention paramétrable.
3. Déplacer sessions, cache et file hors ligne vers Redis ou un stockage adapté à la production.
4. Séparer le module d’intégration SAFINUM des adaptateurs propres à chaque institution.
5. Ajouter une interface de gestion des packs avec provenance et approbation à deux locuteurs.
6. Enrichir les contrôles d’intégrité des montants, devises, noms, numéros, dates et références.
7. Mesurer la couverture linguistique et la qualité par scénario et par canal.
8. Ajouter la gestion des délais, reprises idempotentes et identifiants de transaction pour les appels bancaires.
9. Ajouter authentification, quotas, limitation de débit, masquage PII et politique de rétention.
10. Produire des builds reproductibles web, gateway et Android dans CI avec artefacts de présentation.

## Dix améliorations réalistes pendant le hackathon

1. Installer `esbuild` par le lockfile et produire le build gateway.
2. Lancer la banque simulée et rejouer les 10 scénarios standards depuis une console de démo.
3. Capturer une preuve par scénario : entrée, intention, paramètres, statut, trace et temps.
4. Créer un tunnel nommé HTTPS et enregistrer les URL USSD, mobile et web de l’équipe.
5. Exécuter un parcours complet dans chaque simulateur SAFINUM avec un compte de test.
6. Corriger les incohérences entre le nombre de tests documenté et le nombre exécuté.
7. Faire relire les écrans Fulfulde prioritaires par deux locuteurs et enregistrer leur provenance.
8. Afficher nettement la langue de réponse, son statut et le repli français dans la console de jury.
9. Préparer une vidéo de secours courte montrant transfert, frais, confirmation et annulation.
10. Répéter la présentation chronométrée avec une langue et un scénario tirés au sort.

## Conclusion de présentation

NkapLingua a déjà un moteur partagé, un parcours financier déterministe, un middleware pour les trois canaux SAFINUM disponibles et des garde-fous linguistiques testés localement. La prochaine preuve décisive est l’intégration réelle au simulateur, qui nécessite un endpoint HTTPS enregistré. Les langues proposées, la voix, les notifications SMS et la synchronisation distante doivent être présentées selon leur statut réel, sans les confondre avec des fonctionnalités terminées.
