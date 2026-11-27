# Gabarits de packs de langue — ce qui manque, langue par langue

Ces cinq fichiers (`dua.json`, `ewo.json`, `bas.json`, `bbj.json`, `byv.json`) sont des
**formulaires vides**, pas des packs. Chaque valeur vaut `""` et le statut est `draft` : aucun mot,
aucune phrase n'a été inventé. Ils sont produits à partir de
`apps/gateway/translations/_modele.json` (même liste de clés, mêmes emplacements `{x}`).

Un pack ne se remplit **pas** par génération automatique : aucun modèle MMS-TTS n'est publié pour
ces langues (401) et Google Translate ne les couvre pas. La seule voie honnête est une séance avec
**deux locuteurs distincts**, puis `pnpm --filter @nkap/gateway i18n verifier` avant de copier le
fichier dans `apps/gateway/translations/`.

## Volume attendu par langue

| Bloc | Clés | Ce que c'est |
| --- | --- | --- |
| `ui` | **89** | libellés et messages des écrans mobile/web/ATM (dont les 47 `atm.*`) |
| `ussd` | **56** | phrases complètes du menu, du récapitulatif et des confirmations USSD |
| **Total** | **145** | à remplir intégralement, emplacements `{amount}`, `{name}`, `{ref}` conservés |

État actuel : **0/89 écrans** et **0/145 valeurs** pour les cinq langues. Les gabarits restent donc
rangés ici, hors du dossier chargé par le middleware (`apps/gateway/translations/`), pour qu'ils ne
soient jamais servis par erreur.

## Ce qui manque, pour chaque langue

| Langue | Source écrite disponible | Ce qu'elle couvre | Locuteurs | Volume restant |
| --- | --- | --- | --- | --- |
| `dua` Duala | Helmlinger (1972), *Dictionnaire duala-français*, texte OCR (Internet Archive) | un **lexique partiel** (argent, envoyer, compte, oui/non…) utile pour comprendre une saisie ; l'OCR abîme `ɛ` et `ɔ`, donc rien n'est affichable tel quel | **2** | 89 écrans + 56 phrases ; les phrases ne se déduisent pas d'un lexique |
| `ewo` Ewondo | glossaire de présélection, 42 entrées marquées « proposé », **sans source citée** | quelques mots seulement, non vérifiables | **2** | 89 + 56 ; il manque d'abord une source écrite vérifiable |
| `bas` Basaa | **aucune** : le dictionnaire SIL (Njock 2005) exige une connexion (HTTP 403) | rien | **2** | 89 + 56 ; source écrite à obtenir (ouvrage papier ou ayant) |
| `bbj` Ghomala | *Dictionnaire Ghomálá'-Français* (PDF, 96 p.) | mots partiels : la police propriétaire ne laisse lisibles que les « 2e formes » ; aucune phrase | **2** | 89 + 56 ; conversion de police ou séance orale |
| `byv` Medumba | **aucune** : Kemelang refuse les clients automatisés (HTTP 403) | rien | **2** | 89 + 56 ; source écrite à obtenir |

## Mode d'emploi d'une séance

1. Imprimer la fiche `docs/relecture/fub.md` comme exemple de mise en page (phrases dans l'ordre,
   deux colonnes de verdict, une par locuteur).
2. Remplir le gabarit **à la main**, sans jamais traduire un emplacement `{x}` ni changer son nom.
3. Vérifier : `pnpm --filter @nkap/gateway i18n verifier` (couverture, emplacements, septets GSM-7).
4. Passer le statut à `proposed` (un locuteur) puis `validated` (deux locuteurs distincts) ; seul
   `validated` peut être présenté au jury comme une traduction validée.
5. Copier le fichier dans `apps/gateway/translations/<code>.json` et redémarrer le middleware.

Tant que ces étapes ne sont pas faites, le middleware **déclare `fr`** pour ces langues (repli visible
dans le rapport de traduction) au lieu de servir une traduction inventée. Voir
[`docs/LANGUES.md`](../../LANGUES.md) et [`docs/GUIDE-STUDIO-ENREGISTREMENT.md`](../../GUIDE-STUDIO-ENREGISTREMENT.md).
