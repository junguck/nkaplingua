# NkapLingua : modèle économique (proposition à valider)

> Tout le monde devrait pouvoir parler le langage de l'argent.

Convention : **[F]** = fait sourcé, **[M]** = mesuré par nous dans ce dépôt, **[H]** = hypothèse à valider.

## 1. Le problème, en chiffres

- **[F]** 60,87 % des adultes camerounais (15 ans et plus) ont un compte, en banque ou en mobile money (Banque mondiale, Global Findex, données 2024).
- **[F]** 30,9 millions de comptes mobile money au Cameroun fin 2024, soit 65,1 % de la CEMAC ; 2,73 milliards d'opérations dans l'année (BEAC, Rapport 2024 sur les services de paiement, repris par Agence Ecofin et Investir au Cameroun).
- **[F]** Recensement 2005 : 28,8 % des 12 ans et plus ne lisent ni le français ni l'anglais. C'est la population que l'USSD en français exclut (donnée ancienne, aucun recensement plus récent trouvé).
- **[M]** Un écran USSD qui contient une seule lettre ɛ, ɔ ou ŋ tombe de 182 à 70 caractères. Le pliage NkapLingua garde les 182 : 2,6 fois plus de contenu par écran.

## 2. Quatre modèles possibles

| | A. Licence SaaS B2B | B. Place de marché des locuteurs | C. Licence de corpus | D. Subventions inclusion |
| --- | --- | --- | --- | --- |
| Client | banques, EMF, opérateurs mobile money | (moteur de A) | opérateurs, labos IA, universités | bailleurs, régulateur |
| Ce qu'il paie | abonnement + prix par session localisée | | jeux de données texte et voix validés | pilotes par langue |
| Force | revenu récurrent, aligné sur l'usage | coût d'une langue quasi nul, emplois locaux | forte marge | finance le démarrage |
| Risque | cycle de vente bancaire long | qualité (couverte par les quatre yeux) | consentement, licence des modèles | non récurrent |

## 3. Recommandation : A + B, puis C

1. **A, licence SaaS** : 2 FCFA par session localisée **[H]**, plus un abonnement d'intégration par établissement.
2. **B, locuteurs payés en mobile money** : 25 FCFA par traduction validée, 15 FCFA par relecture, 50 FCFA par enregistrement validé **[H]**. 20 % du revenu A reversé au fonds des contributeurs **[H]**. Le slogan devient littéral : les locuteurs gagnent de l'argent en apprenant aux services financiers à parler leur langue.
3. **C, plus tard** : licence du corpus validé (texte et voix), avec consentement explicite à la contribution et partage de revenu.

Point d'attention : les modèles `facebook/mms-tts` sont sous licence CC-BY-NC 4.0. Un usage commercial de la synthèse exige une autre licence ou un modèle entraîné sur notre propre corpus de voix validées, que B produit justement. C'est un argument de plus pour B.

## 4. Économie unitaire

### Coût d'une langue (calcul à partir du dépôt)

| Poste | Volume **[M]** | Tarif **[H]** | Coût |
| --- | --- | --- | --- |
| Traduction + relecture | 144 phrases | 25 + 15 FCFA | 5 760 FCFA |
| Voix + relecture | 45 phrases fixes | 50 + 15 FCFA | 2 925 FCFA |
| **Total par langue** | | | **8 685 FCFA, soit 13,24 €** |
| 10 langues nationales | | | 86 850 FCFA, soit 132,40 € |

(Parité fixe : 1 € = 655,957 FCFA.)

### Revenu, selon la part d'opérations localisées

Base **[F]** : 2,73 milliards d'opérations mobile money par an au Cameroun.

| Part localisée **[H]** | Prix par session **[H]** | Revenu annuel | Fonds contributeurs (20 %) |
| --- | --- | --- | --- |
| 0,5 % | 2 FCFA | 27,3 M FCFA (41 600 €) | 5,5 M FCFA |
| 1 % | 2 FCFA | 54,6 M FCFA (83 200 €) | 10,9 M FCFA |
| 2 % | 3 FCFA | 163,8 M FCFA (249 700 €) | 32,8 M FCFA |

Lecture : même dans le scénario prudent, le coût de construction d'une langue (8 685 FCFA) est remboursé par moins de 4 400 sessions localisées.

## 5. Ce qu'il faut valider ensemble

- Le prix par session : faut-il plutôt une part des frais de transaction ?
- Les tarifs des locuteurs : à tester sur une langue pilote (ewondo ou fulfulde) avec 20 locuteurs.
- Le client de lancement : un EMF régional est plus rapide à signer qu'une banque.

## Sources

- Banque mondiale, Global Findex 2025, indicateur FX.OWN.TOTL.ZS : https://data.worldbank.org/indicator/FX.OWN.TOTL.ZS
- BEAC, Rapport 2024 sur les services de paiement dans la CEMAC : https://www.beac.int/wp-content/uploads/2026/04/RAPPORT-SUR-LES-SERVICES-DE-PAIEMENT-DANS-LA-CEMAC-2024-.pdf
- Agence Ecofin : https://www.agenceecofin.com/actualites/0705-138200-mobile-money-le-cameroun-domine-l-espace-cemac-avec-65-des-comptes-en-2024
- Investir au Cameroun : https://www.investiraucameroun.com/finance/0405-23354-cemac-le-cameroun-reste-roi-du-mobile-money-en-2024-avec-65-1-des-comptes-et-57-de-la-valeur-des-transactions
- Langues du Cameroun, recensement 2005 : https://en.wikipedia.org/wiki/Languages_of_Cameroon
