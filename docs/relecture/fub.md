# Fiche de relecture — fub

> Document de travail à faire valider par **deux locuteurs distincts**, en séance, en présence du développeur.
> Chaque ligne se lit à voix haute dans la langue ; les deux relecteurs donnent leur verdict séparément.
> Une phrase refusée ou corrigée n’est **pas** publiée : elle revient en atelier, puis repasse en relecture.

## Comment faire (30 à 45 minutes)

1. Lire la colonne « texte proposé » sans l’accent français, et dire ce qu’un client comprendrait.
2. Cocher **OK** si la phrase est naturelle et exacte ; sinon noter la correction dans la dernière colonne.
3. Vérifier les **chiffres et les noms** : montants, numéros, frais ne doivent jamais être traduits.
4. Une phrase USSD doit tenir en **182 caractères GSM-7** : pas de ɛ, ɔ, ŋ, ə ni d’apostrophe courbe à l’écran (le clavier ne les affiche pas).
5. Signer en bas : nom, quartier/ville, date, et le nombre de phrases acceptées.

Statut du pack : aucun fichier `translations/fub.json`

Provenance déclarée : à compléter

## 1. Phrases USSD (61/70 déjà différentes du français)

| clé | français (référence) | texte proposé | L1 | L2 | correction retenue |
| --- | --- | --- | --- | --- | --- |
| `ambiguous.beneficiary` | Plusieurs beneficiaires. Precisez le numero. | Yimɓe ɗuuɗɓe. Winndu limgal. | OK / à corriger | OK / à corriger | |
| `ask.airtimePhone` | Numero a recharger (9 chiffres): | Limgal nde renndintee (9 limle): | OK / à corriger | OK / à corriger | |
| `ask.airtimeTarget` | Credit pour:<br>1. Mon numero<br>2. Un autre numero | Kerdii ngam:<br>1. Limgal am<br>2. Limgal goɗngal | OK / à corriger | OK / à corriger | |
| `ask.amount` | Montant (FCFA): | Ceede (FCFA): | OK / à corriger | OK / à corriger | |
| `ask.beneficiary` | Numero du beneficiaire (9 chiffres): | Limgal keɓoowo ceede (9 limle): | OK / à corriger | OK / à corriger | |
| `ask.billReference` | Numero de facture: | Lammba fakture: | OK / à corriger | OK / à corriger | |
| `ask.biller` | Choisissez le facturier: | Suɓo fakture: | OK / à corriger | OK / à corriger | |
| `ask.feesAmount` | Frais pour quel montant (FCFA) ? | Njoɓdi ngam ceede njelu (FCFA)? | OK / à corriger | OK / à corriger | |
| `ask.language` | Choisissez la langue: | Suɓo ɗemngal: | OK / à corriger | OK / à corriger | |
| `ask.term` | Quel terme ?<br>1. Frais<br>2. Plafond<br>3. Beneficiaire<br>4. Confirmation | Ko honɗum?<br>1. Njoɓdi<br>2. Keɓal<br>3. Keɓoowo<br>4. Tabbitgol | OK / à corriger | OK / à corriger | |
| `atm.card` | Numero de carte (9 chiffres): | Numero de carte (9 chiffres): | OK / à corriger | OK / à corriger | |
| `atm.dispensed` | Retrait de {amount}. Frais {fee}. | Retrait de {amount}. Frais {fee}. | OK / à corriger | OK / à corriger | |
| `atm.eject` | Merci. Prenez votre carte. | Merci. Prenez votre carte. | OK / à corriger | OK / à corriger | |
| `atm.menu` | Choisissez:<br>1. Retrait<br>2. Solde<br>3. Quitter | Choisissez:<br>1. Retrait<br>2. Solde<br>3. Quitter | OK / à corriger | OK / à corriger | |
| `atm.multiple` | Montant multiple de {step} FCFA. | Montant multiple de {step} FCFA. | OK / à corriger | OK / à corriger | |
| `atm.pin` | Code a 4 chiffres: | Code a 4 chiffres: | OK / à corriger | OK / à corriger | |
| `atm.simulated` | Simulation locale: aucun debit bancaire. | Simulation locale: aucun debit bancaire. | OK / à corriger | OK / à corriger | |
| `atm.welcome` | Bienvenue au distributeur Safinum, {name}. | Bienvenue au distributeur Safinum, {name}. | OK / à corriger | OK / à corriger | |
| `balance` | Votre solde est de {balance}. | Ceede maa keddiiɗe: {balance}. | OK / à corriger | OK / à corriger | |
| `common.cancel` | Annuler | Haaytu | OK / à corriger | OK / à corriger | |
| `common.confirm` | Confirmer | Tabbitin | OK / à corriger | OK / à corriger | |
| `common.edit` | Modifier | Waylu | OK / à corriger | OK / à corriger | |
| `confirm.airtime` | Credit de {amount} pour le {phone}. Frais {fee}. Total {total}. | Kerdii {amount} ngam {phone}. Njoɓdi {fee}. Fof {total}. | OK / à corriger | OK / à corriger | |
| `confirm.bill` | Facture {biller} {reference}: {amount}. Frais {fee}. Total {total}. | Fakture {biller} {reference}: {amount}. Njoɓdi {fee}. Fof {total}. | OK / à corriger | OK / à corriger | |
| `confirm.choose` | 1. Confirmer<br>2. Annuler | 1. Tabbitin<br>2. Haaytu | OK / à corriger | OK / à corriger | |
| `confirm.edit` | 3. Modifier le montant | 3. Waylu ceede | OK / à corriger | OK / à corriger | |
| `confirm.retry` | Repondez 1 pour confirmer ou 2 pour annuler. | Tii 1 ngam tabbitinde walla 2 ngam haaytude. | OK / à corriger | OK / à corriger | |
| `confirm.transfer` | Envoi de {amount} a {recipient}. Frais {fee}. Total {total}. | Neldugol {amount} ka {recipient}. Njoɓdi {fee}. Fof {total}. | OK / à corriger | OK / à corriger | |
| `done.airtime` | Credit de {amount} envoye au {phone}. Ref {ref}. | Kerdii {amount} neldaama ka {phone}. Limgal {ref}. | OK / à corriger | OK / à corriger | |
| `done.bill` | Facture {biller} payee: {amount}. Ref {ref}. | Fakture {biller} yoɓaama: {amount}. Limgal {ref}. | OK / à corriger | OK / à corriger | |
| `done.cancel` | Operation annulee. Aucun montant debite. | Golle ndee haaytaama. Ceede fof ittaaka. | OK / à corriger | OK / à corriger | |
| `done.transfer` | {amount} envoye a {recipient}. Ref {ref}. Solde {balance}. | {amount} neldaama ka {recipient}. Limgal {ref}. Ceede keddiiɗe {balance}. | OK / à corriger | OK / à corriger | |
| `error.GENERIC` | Operation impossible. Reessayez plus tard. | Golle ndee waɗaaka. Ɗaɓɓit caggal. | OK / à corriger | OK / à corriger | |
| `error.INSUFFICIENT_FUNDS` | Solde insuffisant pour cette operation. | Ceede keddiiɗe ɗee paɗaani ngam golle ndee. | OK / à corriger | OK / à corriger | |
| `error.INVALID_AMOUNT` | Montant invalide. | Ceede ɗee moƴƴaani. | OK / à corriger | OK / à corriger | |
| `error.LIMIT_EXCEEDED` | Montant au-dessus du plafond autorise. | Ceede ɗee ɓuri keɓal jaɓaangal. | OK / à corriger | OK / à corriger | |
| `error.TX_NOT_PENDING` | Cette operation ne peut plus etre modifiee. | Golle ndee waylaa tawo. | OK / à corriger | OK / à corriger | |
| `error.UNAUTHORIZED` | Service momentanement indisponible. Reessayez plus tard. | Golle ɗee keɓaani jooni. Ɗaɓɓit caggal. | OK / à corriger | OK / à corriger | |
| `error.UNKNOWN_ACCOUNT` | Compte introuvable pour ce numero. | Konta alaa e limgal ngal. | OK / à corriger | OK / à corriger | |
| `error.UNKNOWN_BENEFICIARY` | Beneficiaire introuvable. Verifiez le numero. | Keɓoowo tawaaka. Ƴeewto limgal ngal. | OK / à corriger | OK / à corriger | |
| `error.UNKNOWN_BILLER` | Facturier inconnu. Choisissez dans la liste. | Fakture anndaaka. Suɓo e doggol ngol. | OK / à corriger | OK / à corriger | |
| `error.UNREACHABLE` | Service momentanement indisponible. Reessayez plus tard. | Golle ɗee keɓaani jooni. Ɗaɓɓit caggal. | OK / à corriger | OK / à corriger | |
| `fees` | Pour {amount}: frais {fee}. Total {total}. | Ngam {amount}: njoɓdi {fee}. Fof {total}. | OK / à corriger | OK / à corriger | |
| `history.empty` | Aucune operation pour le moment. | Golle alaa tawo. | OK / à corriger | OK / à corriger | |
| `history.header` | Vos dernieres operations: | Golle maa ɓennuɗe: | OK / à corriger | OK / à corriger | |
| `history.line` | {date} {label} {amount} | {date} {label} {amount} | OK / à corriger | OK / à corriger | |
| `invalid.amount` | Montant invalide. Tapez un nombre, ex: 1000 | Ceede ɗee moƴƴaani. Tii limoore, yeru: 1000 | OK / à corriger | OK / à corriger | |
| `invalid.choice` | Choix invalide. | Suɓal moƴƴal alaa. | OK / à corriger | OK / à corriger | |
| `invalid.limit` | Montant trop eleve. Plafond: {max} FCFA. | Ceede ɗee ɓuri keɓal. Keɓal: {max} FCFA. | OK / à corriger | OK / à corriger | |
| `invalid.phone` | Numero invalide. 9 chiffres, ex: 699000002 | Limgal ngal moƴƴaani. 9 limle, yeru: 699000002 | OK / à corriger | OK / à corriger | |
| `ivr.askAmount` | Montant (FCFA) puis #: | Ceede (FCFA) refti #: | OK / à corriger | OK / à corriger | |
| `ivr.askBeneficiary` | Numero du beneficiaire puis #: | Limgal keɓoowo refti #: | OK / à corriger | OK / à corriger | |
| `ivr.confirmPrompt` | 1. Confirmer<br>2. Annuler | 1. Tabbitin<br>2. Haaytu | OK / à corriger | OK / à corriger | |
| `ivr.hangup` | Merci. Au revoir. | A jaɓɓaama. Yaltu. | OK / à corriger | OK / à corriger | |
| `ivr.invalid` | Choix invalide. | Suɓal moƴƴal alaa. | OK / à corriger | OK / à corriger | |
| `ivr.menu` | Choisissez:<br>1. Solde<br>2. Envoyer<br>3. Frais<br>4. Historique<br>0. Quitter | Suɓo:<br>1. Ceede am keddiiɗe<br>2. Neldu ceede<br>3. Njoɓdi<br>4. Golle ɓennuɗe<br>0. Yaltu | OK / à corriger | OK / à corriger | |
| `lang.set` | Langue: {language}. | Ɗemngal: {language}. | OK / à corriger | OK / à corriger | |
| `menu.airtime` | Acheter du credit | Soodu kerdii | OK / à corriger | OK / à corriger | |
| `menu.balance` | Mon solde | Ceede am keddiiɗe | OK / à corriger | OK / à corriger | |
| `menu.bill` | Payer une facture | Yoɓ fakture | OK / à corriger | OK / à corriger | |
| `menu.fees` | Frais | Njoɓdi | OK / à corriger | OK / à corriger | |
| `menu.header` | Safinum. Choisissez: | Safinum. Suɓo: | OK / à corriger | OK / à corriger | |
| `menu.help` | Aide | Wallu | OK / à corriger | OK / à corriger | |
| `menu.history` | Historique | Golle ɓennuɗe | OK / à corriger | OK / à corriger | |
| `menu.language` | Langue | Ɗemngal | OK / à corriger | OK / à corriger | |
| `menu.transfer` | Envoyer de l'argent | Neldu ceede | OK / à corriger | OK / à corriger | |
| `term.beneficiary` | Le beneficiaire est la personne qui recoit l'argent. | Keɓoowo ko neɗɗo jaɓotoo ceede ɗee. | OK / à corriger | OK / à corriger | |
| `term.confirmation` | Rien n'est debite avant votre confirmation, au tour suivant. | Ceede ittaaka haa tabbitin-ɗaa, e turnu garoowo. | OK / à corriger | OK / à corriger | |
| `term.fee` | Les frais sont ce que la banque retient pour executer une operation. | Njoɓdi ko ceede banki jogitotoo ngam waɗde golle. | OK / à corriger | OK / à corriger | |
| `term.limit` | Le plafond est de 500 000 FCFA par operation. | Keɓal ko 500 000 FCFA e kala golle. | OK / à corriger | OK / à corriger | |

## 2. Mots compris par le moteur (24)

| intention | mot | poids | L1 | L2 | correction retenue |
| --- | --- | --- | --- | --- | --- |
| BUY_AIRTIME | `kerdii` | 3 | OK / à corriger | OK / à corriger | |
| CHECK_BALANCE | `ceede am` | 1 | OK / à corriger | OK / à corriger | |
| CHECK_BALANCE | `ceede maa` | 1 | OK / à corriger | OK / à corriger | |
| CHECK_BALANCE | `heddii*` | 3 | OK / à corriger | OK / à corriger | |
| CHECK_BALANCE | `keddii*` | 3 | OK / à corriger | OK / à corriger | |
| CHECK_FEES | `njoɓdi` | 3 | OK / à corriger | OK / à corriger | |
| EXPLAIN_TERM | `firo` | 3 | OK / à corriger | OK / à corriger | |
| EXPLAIN_TERM | `ko ɗum woni` | 3 | OK / à corriger | OK / à corriger | |
| EXPLAIN_TERM | `ko woni` | 3 | OK / à corriger | OK / à corriger | |
| GREETING | `a hirti jam` | 2 | OK / à corriger | OK / à corriger | |
| GREETING | `a nyalli jam` | 2 | OK / à corriger | OK / à corriger | |
| GREETING | `a waali jam` | 2 | OK / à corriger | OK / à corriger | |
| GREETING | `jam` | 1 | OK / à corriger | OK / à corriger | |
| GREETING | `sannu` | 2 | OK / à corriger | OK / à corriger | |
| HELP | `ballal` | 3 | OK / à corriger | OK / à corriger | |
| HELP | `wallu` | 2 | OK / à corriger | OK / à corriger | |
| PAY_BILL | `fakture` | 3 | OK / à corriger | OK / à corriger | |
| PAY_BILL | `yoɓ*` | 1 | OK / à corriger | OK / à corriger | |
| TRANSFER | `hokku` | 1 | OK / à corriger | OK / à corriger | |
| TRANSFER | `neld*` | 3 | OK / à corriger | OK / à corriger | |
| TX_HISTORY | `golle am` | 2 | OK / à corriger | OK / à corriger | |
| TX_HISTORY | `golle ɓennuɗe` | 3 | OK / à corriger | OK / à corriger | |
| WITHDRAW | `yaltin*` | 3 | OK / à corriger | OK / à corriger | |
| WITHDRAW | `yalting*` | 3 | OK / à corriger | OK / à corriger | |

> Les mots s’ajoutent ou se corrigent ensuite sans code : `pnpm --filter @nkap/gateway lang mot fub TRANSFER "<mot>" 3`.

## 3. Signatures

| | locuteur 1 | locuteur 2 |
| --- | --- | --- |
| nom | | |
| ville / quartier | | |
| téléphone | | |
| date | | |
| phrases acceptées / corrigées | | |
| signature | | |

Après la séance : reporter les corrections dans `translations/fub.json` (ou dans la base de mots), passer `pnpm --filter @nkap/gateway i18n verifier`, puis `pnpm test`.
