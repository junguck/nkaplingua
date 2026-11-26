# Pistes d'innovation

Quatre idées qui prolongent NkapLingua au-delà de la traduction des services financiers. Les idées 2, 3 et 4
sont implémentées et testées (voir « État » ci-dessous) ; l'idée 1 reste à arbitrer.

| # | Idée | Dépend de | État | Effet pour la démonstration |
|---|---|---|---|---|
| 1 | Boîte à corrections communautaire | file de synchro ([ADR 0005](adr/0005-mode-hors-ligne-ussd.md)), studio | à faire | rend la validation linguistique mesurable |
| 2 | Alerte anti-arnaque par message | moteur `screen` (`cat.fraud`, `ui.scam_alert`) | fait (cœur) | démonstration en 30 secondes, sans banque |
| 3 | Second regard (confirmation par un proche) | confirmation du dialogue, canal SMS | fait | protège contre la contrainte et l'erreur |
| 4 | Aller-retour de vérification | moteur de rendu, valeurs verrouillées | fait (cœur) | détecte une mauvaise traduction sans locuteur |

## 1. Boîte à corrections communautaire

**Problème.** Le glossaire contient des centaines d'entrées « proposées » (fulfulde, ewondo, haoussa) que
personne n'a validées. Le studio impose déjà un second locuteur natif, mais rien ne mesure l'avancement.

**Idée.** Dans le studio, chaque phrase s'affiche avec « c'est juste » ou « corriger » (texte ou audio). Une
entrée passe à « validée » seulement après deux locuteurs différents. Les corrections hors-ligne utilisent la
file de synchronisation existante (`gateway.correct`, qui refuse déjà une chaîne trop longue, hors charset ou
qui casse un emplacement `{x}`). Un tableau « entrées validées / à relire » par langue donne l'état réel.

**À construire.** Statuts `propose` → `en_relecture` → `valide` avec l'identité des relecteurs ; vue de
progression ; point de terminaison de réception côté serveur.

**Risque.** Sans identité des locuteurs, deux validations peuvent venir de la même personne : prévoir un pseudo
unique par relecteur.

## 2. Alerte anti-arnaque par message

**Problème.** La plupart des fraudes mobile money passent par un SMS ou un appel qui réclame le code secret ou
un « frais pour recevoir un gain ».

**Idée.** L'utilisateur colle ou transfère un message suspect. La réponse tient en une ligne, dans sa langue :
un verdict (arnaque probable) et le motif (« il demande ton code secret »). Rien n'est exécuté, aucun appel
bancaire. Le moteur reconnaît déjà ce type de texte (`cat.fraud`, `ui.scam_alert`).

**À construire.** Entrée « message à vérifier » sur le web et en SMS ; règles de motif (demande de code, urgence,
gain à payer, lien) ; réponse courte traduite avec statut de traduction.

**Risque.** Un faux négatif rassure à tort : la réponse doit rester prudente (« non détecté » n'est pas « sûr »).

## 3. Second regard (confirmation par un proche)

**Problème.** Un transfert important peut être fait sous la contrainte, par erreur, ou par une personne qui ne
lit pas la langue de l'application.

**Idée.** Au-delà d'un seuil choisi, l'utilisateur désigne un proche de confiance. Avant la confirmation, ce
proche reçoit un résumé court dans sa propre langue (montant, bénéficiaire, frais) et répond « oui » ou « non ».
Le transfert n'est confirmé que si le proche valide ; sinon il reste en attente puis expire.

**À construire.** Liste des proches de confiance, seuil par utilisateur, étape d'attente dans la machine à états
du dialogue, expiration. Les valeurs du résumé restent verrouillées : le proche voit exactement les mêmes chiffres.

**Risque.** Confidentialité : le proche ne doit voir que le résumé, jamais le solde ni le code secret.

## 4. Aller-retour de vérification

**Problème.** Pour les langues sans relecteur disponible, une mauvaise traduction peut changer le sens d'une
consigne (« ne jamais donner le code »).

**Idée.** Après traduction, le système retraduit vers le français puis compare avec l'original : montants,
noms, négations (« jamais », « ne pas ») et conditions doivent survivre. Si l'écart dépasse un seuil, la phrase
est marquée « à vérifier » et le français est proposé en repli. La trace du jury affiche le résultat du contrôle.

**À construire.** Retraduction par glossaire inversé (entrées `fr` ↔ langue) pour rester déterministe ; comparaison
des éléments verrouillés et des marqueurs de négation ; statut supplémentaire dans la trace.

**Risque.** Le glossaire inversé ne couvre que les entrées connues : une phrase libre peut passer sans contrôle.

## État d'implémentation

| Idée | Code | Tests | Pas encore fait |
|---|---|---|---|
| 2. Alerte anti-arnaque | `checkMessage(texte, langue)` dans `packages/core/src/screen/message-check.ts` ; textes `msgcheck.*` en français et en anglais | `packages/core/test/innovations.test.ts` | écran web / entrée SMS ; textes fulfulde et pidgin (repli français signalé) |
| 3. Second regard | `apps/gateway/src/second-look.ts` ; option `secondLook` de `Gateway` ; route `POST /second-look/{id}/answer` ; branché à la confirmation USSD d'un transfert | `apps/gateway/test/second-look.test.ts` (8 cas, avec la banque de démo) | envoi réel des SMS (`Notifier` injecté), saisie du proche et du seuil par l'utilisateur, balayage périodique `sweep()` |
| 4. Aller-retour | `auditRoundTrip`, `compareTemplates`, `renderVerified` dans `packages/core/src/render/round-trip.ts` | `packages/core/test/innovations.test.ts` | rendu automatique par le moteur (`renderVerified` est à appeler explicitement) |

Réglage du second regard : `new Gateway({ ..., secondLook: new SecondLook({ thresholdXAF, ttlMs, contactFor }, notify) })`.
Sans `secondLook`, le comportement de la sandbox est inchangé.

Points d'honnêteté :

- Le contrôle d'aller-retour produit des **alertes à vérifier**, pas des erreurs prouvées. Sur le lexique actuel il
  signale quelques gabarits (par exemple `not.understood` en fulfulde) : les marqueurs de négation fulfulde et pidgin
  sont une liste courte, à enrichir avec les relecteurs. Une alerte ne dit pas que la traduction est fausse.
- L'alerte anti-arnaque ne couvre que ce que les règles du moteur reconnaissent (français et anglais).
- Le second regard envoie le résumé au numéro national à 9 chiffres ; le branchement à un opérateur SMS reste à faire.
