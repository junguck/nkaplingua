# IVR et canaux vocaux — ce que je propose

État actuel : l'IVR DTMF (`POST /ivr`) et le distributeur (`POST /atm`) existent et sont testés,
mais restent **locaux** (`ENABLE_V2_CHANNELS=1`) parce que la sandbox SAFINUM n'expose que
`ussd`, `mobile` et `web`. La voix n'est donc pas un prérequis du jour J : c'est ce qu'on ajoute
*après*, sans toucher au moteur de compréhension.

Trois voies, de la plus sûre à la plus ambitieuse. Mon avis : **A tout de suite, B le jour J en
secours, C seulement après mesure.**

## A. IVR DTMF enrichi (recommandé maintenant)

Ce qui existe déjà + ce qui manque :

| Élément | Aujourd'hui | À ajouter |
| --- | --- | --- |
| Saisie | chiffres + `#` (valider) + `*` (annuler) | rien : c'est le format attendu par tous les centraux |
| Langue de l'appel | portée par la session | menu vocal « 1. Français · 2. English · 3. Fulfulde » en tête d'appel |
| Message | texte `say` (à faire lire par la passerelle) | balises SSML légères (`<break>`, chiffres épelés) |
| Montants | chiffres DTMF (fiable) | **ne jamais** passer les montants à la reconnaissance vocale |
| Repli | `*` annule, transaction annulée côté banque | idem, déjà testé |

**Pourquoi c'est la bonne première étape** : aucun nouveau fournisseur, aucune latence ajoutée,
aucun risque de mal comprendre un montant. Le texte `say` est déjà produit dans la langue servie ;
il suffit que la passerelle ait une voix.

## B. Voix : synthèse ou enregistrements humains

Le vrai sujet n'est pas la technique, c'est **la qualité par langue**.

- `fr`, `en` : synthèse vocale immédiate et correcte (voix système ou fournisseur TTS).
- `fub`, `dua`, `ewo`, `bas`, `bbj`, `byv` : **aucune voix de synthèse fiable n'existe**. Faire lire
  du fulfulde par une voix française donne un résultat inintelligible et décrédibilise la démo.

Ma proposition, honnête et peu coûteuse : **enregistrer les phrases fixes**.

1. Les 70 phrases du catalogue (`i18n fiche fub` les liste déjà) sont **fixes**, sauf les
   emplacements `{amount}`, `{recipient}`, `{ref}`, `{balance}`.
2. Deux locuteurs enregistrent les phrases **sans** les emplacements, dans un téléphone ou un micro
   correct, en une seule séance (≈ 45 min pour 70 phrases, la fiche de relecture sert de script).
3. Le middleware compose : `audio(phrase fixe) + montant épelé chiffre par chiffre + audio(suite)`.
   Les montants restent en chiffres DTMF, jamais en mots.
4. Fichiers : `apps/gateway/audio/<langue>/<cle>.wav` + un `index.json` (durée, locuteur, date,
   statut `proposed|validated`), servis par une route locale `/audio/<langue>/<cle>.wav`.
5. Repli automatique : pas d'audio validé pour une clé → la phrase repasse en **français** et la
   réponse déclare `language: "fr"` (même règle que l'USSD : on ne sert jamais un écran à moitié
   traduit).

C'est la voie que je recommande pour le jury : **une voix humaine en fulfulde**, deux ou trois
phrases, et le reste en français. C'est court, vérifiable, et cela montre la contrainte réelle
(les langues nationales n'ont pas de TTS).

## C. Reconnaissance vocale (ASR) — après mesure, pas avant

Idée : l'appelant *parle* (« envoie cinq mille à Aïcha ») au lieu de taper.

Ce qu'il faut mesurer avant d'écrire une ligne de code :

- **WER par langue** sur 50 phrases réelles, avec un modèle multilingue (Whisper large-v3) :
  attendre < 10 % en français, sans doute > 40 % en fulfulde. En dessous de 90 % de précision sur
  un montant, on ne déclenche pas de transaction : on fait confirmer par DTMF.
- **Latence** : un aller-retour ASR + notre moteur + TTS doit tenir dans les 3 s du budget, sinon
  l'appelant raccroche. Sur un appel téléphonique, la latence perçue compte plus que la précision.
- **Coût** : facturation à la minute d'audio. À 2 000 appels/jour de 45 s, c'est un budget mensuel
  réel, pas une ligne de démo.

Architecture si on y va : un adaptateur `src/voice.ts` (STT → `interpret()` → TTS), le même moteur
que l'USSD, et **une règle non négociable** : tout montant ou numéro dicté est relu chiffre par
chiffre et confirmé par une touche. La voix ne doit jamais être la seule source d'un montant.

## D. Les autres canaux à envisager

| Canal | Intérêt | Effort | Remarque |
| --- | --- | --- | --- |
| **WhatsApp (note vocale)** | très utilisé au Cameroun ; la note vocale est le vrai canal des langues nationales | moyen | même chaîne ASR que C ; répondre en texte + audio |
| **SMS de repli** | l'USSD coupe, le SMS reste | faible | utile pour un reçu ou une confirmation différée |
| **Rappel sortant (callback)** | « nous vous rappelons » quand le menu est trop long | faible | un appel sortant DTMF réutilise `/ivr` tel quel |
| **Agent vocal temps réel** | démonstration spectaculaire | élevé | latence et coût ; à garder pour après le concours |
| **USSD *et* voix sur le même numéro** | le client choisit son mode | moyen | c'est un réglage de passerelle, pas de notre code |

## Ce que je ferais, dans l'ordre

1. **Maintenant** : garder l'IVR DTMF comme il est, ajouter le menu de langue vocal (A) — 1 jour.
2. **Avant le jour J** : enregistrer 10 phrases fulfulde avec deux locuteurs (B), les brancher en
   lecture locale ; si la séance n'a pas lieu, ne rien annoncer et rester en DTMF français.
3. **Après le concours** : mesurer le WER (C) sur des phrases réelles avant de promettre la voix
   libre ; en attendant, WhatsApp note vocale (D) est le meilleur rapport valeur/risque.

Ce qui ne change pas : le moteur (`interpret`), la base de mots (`data/langues.json`), les packs de
langue et la règle d'honnêteté (« je déclare la langue que j'affiche réellement »). Un canal vocal
n'est qu'un transport de plus au-dessus du même moteur.
