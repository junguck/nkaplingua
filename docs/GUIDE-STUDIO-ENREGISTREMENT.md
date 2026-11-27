# Guide du studio — enregistrer les voix que MMS-TTS ne sait pas dire

Le projet a déjà un studio : la page `GET /voix` sert les clips, `apps/gateway/audio/index.json`
les décrit, et `apps/gateway/src/voice.ts` les attache aux réponses IVR. Ce guide explique comment
y **ajouter des voix humaines** pour les langues où aucun modèle n'existe — d'abord le fulfulde,
puis les autres.

## 1. Pourquoi un studio humain (et pas un modèle)

Sondé le 27/11/2026 sur Hugging Face :

| Langue | Code MMS | Modèle publié | Décision |
| --- | --- | --- | --- |
| Français | `fra` | ✅ `facebook/mms-tts-fra` | synthèse (112 clips déjà produits, fr + en) |
| Anglais | `eng` | ✅ `facebook/mms-tts-eng` | synthèse |
| Fulfulde | `fub`, `fuv`, `fuf`, `ffm` | ❌ 401 | **enregistrement humain** |
| Duala, Ewondo, Basaa, Ghomala, Medumba, Pidgin | `dua`, `ewo`, `bas`, `bbj`, `byv`, `wes` | ❌ 401 | enregistrement humain, après relecture |

Deux conséquences non négociables :

1. **On ne fait jamais lire du fulfulde par une voix française.** Une langue sans modèle garde
   `audio: null` et `voice.model: null` dans la réponse IVR ; le texte reste disponible.
2. **Google Translate ne couvre pas ces langues.** Il n'existe pas de traduction automatique
   fiable pour `dua`, `ewo`, `bas`, `bbj`, `byv` : les fichiers de gabarit (tous les champs vides)
   ne sont pas des packs, et les remplir par un modèle produirait des phrases fausses présentées
   comme validées. La seule voie honnête est : **locuteurs + relecture + enregistrement**.

## 2. Où sont les données de langue

| Quoi | Où | Contenu au 27/11 |
| --- | --- | --- |
| Base de mots (compréhension) | `apps/gateway/data/langues.json` | 212 indices, 11 langues (fr 93, en 54, fub 47, ewo 9, dua 5, bbj 4, bas 0, byv 0…) |
| Packs de traduction (écrans + USSD) | `apps/gateway/translations/<langue>.json` | **aucun pack** : seul `_modele.json` existe |
| Textes intégrés fr/en/fub | `apps/gateway/src/ui-dictionaries.ts` (écrans), `src/i18n.ts` (USSD) | 89 clés d'écran, ~61 phrases USSD |
| Phrases à enregistrer, déjà relues | `docs/relecture/fub.md` | 61/70 phrases différentes du français |
| Clips et index | `apps/gateway/audio/<langue>/<clé>.wav` + `audio/index.json` | 112 clips fr/en (moteur `facebook/mms-tts`) |

## 3. Avant la séance (30 min, une fois)

1. **Deux locuteurs distincts**, pas un seul : celui qui propose et celui qui conteste. Une langue
   validée par une seule personne n'est pas validée.
2. **Consentement écrit** : nom, langue, usage prévu (démonstration Safinum 2026), durée de
   conservation, droit de retrait. Un enregistrement sans consentement ne se publie pas.
3. **Salle calme** : pas de ventilateur, pas de cour. Micro à 20 cm, un seul locuteur à la fois.
4. **Phrases sous les yeux** : `docs/relecture/fub.md` pour le fulfulde, `src/i18n.ts` pour les
   autres langues. On enregistre **le texte validé**, pas une improvisation.

## 4. Format d'enregistrement (le serveur l'exige)

| Paramètre | Valeur | Pourquoi |
| --- | --- | --- |
| Format | WAV PCM 16 bits | lu tel quel par `voice.ts`, pas de décodage |
| Fréquence | **16 000 Hz** mono | format attendu par le central (variante 8 kHz acceptée) |
| Nom | `<clé>.wav`, une phrase par fichier | l'index fait la correspondance texte ↔ clip |
| Silence | 0,3 s avant, 0,5 s après | le central coupe sur le silence |
| Durée | 1 à 8 s | au-delà, l'appelant décroche |

Exemple de conversion avec `ffmpeg` :

```bash
ffmpeg -i prise-01.wav -ar 16000 -ac 1 -sample_fmt s16 \
  apps/gateway/audio/fub/ivr.menu.wav
```

Les fichiers vont dans `apps/gateway/audio/fub/` (le dossier n'existe pas encore : le créer).

## 5. Déclarer les clips dans l'index

`audio/index.json` est la seule source de vérité — pas la présence d'un WAV. Pour chaque fichier,
ajouter une entrée :

```json
{
  "lang": "fub",
  "key": "ivr.menu",
  "text": "Suɓo: 1. Ceede am 2. Neldu 3. Njoɓdi 4. Daartol 0. Yaltu",
  "file": "fub/ivr.menu.wav",
  "duration_ms": 4200,
  "bytes": 134400,
  "model": "locuteurs",
  "engine": "human",
  "status": "generated"
}
```

Puis, dans l'en-tête de l'index, ajouter `fub` à `models` n'est **pas** correct (ce n'est pas un
modèle) : laisser `models` aux modèles de synthèse et compter les clips humains dans
`clips[].engine`.

## 6. Vérifier (5 min)

```bash
# le clip est servi et l'index le décrit
curl -sI localhost:8080/audio/fub/ivr.menu.wav        # 200, audio/wav
curl -s localhost:8080/audio/index.json | grep fub

# la page d'écoute : un lecteur par clip, par langue
open http://127.0.0.1:8080/voix

# une réponse IVR doit maintenant porter audio + voice.model
curl -s -X POST localhost:8080/ivr -H 'Content-Type: application/json' \
  -d '{"call_id":"test-fub","language":"fub","input":{"digits":""}}' | grep -o '"audio":{[^}]*}'
# attendu : {"url":"/audio/fub/ivr.menu.wav","model":"locuteurs","engine":"human"}
```

Et la non-régression :

```bash
pnpm --filter @nkap/gateway test -- voice
```

## 7. Ce qu'on refuse de faire

- Enregistrer une phrase que les deux locuteurs n'ont pas validée.
- Faire dire un montant par un clip figé (les phrases à emplacement sont écartées du catalogue).
- Publier une voix sans consentement écrit.
- Utiliser un modèle de synthèse pour une langue qu'il ne couvre pas, même « pour la démo ».

## 8. Ordre de travail recommandé

1. `fub` — fiche déjà prête (`docs/relecture/fub.md`), 61 phrases, c'est la langue la plus avancée.
2. `ewo` et `dua` — bases de mots existantes (9 et 5 indices), à étendre avec les locuteurs.
3. `bas`, `bbj`, `byv` — aucune source écrite exploitable : séance de terrain obligatoire avant tout.
