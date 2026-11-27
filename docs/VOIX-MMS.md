# Voix du canal téléphonique — `facebook/mms-tts`

Le canal IVR renvoie du texte (`say`). Cette couche y ajoute **un fichier audio par phrase**,
synthétisé hors ligne avec les modèles MMS-TTS de Meta, et le sert au central téléphonique.

## 1. Ce que MMS-TTS couvre réellement (vérifié le 27/11/2026)

MMS-TTS est une famille de modèles VITS par langue (`facebook/mms-tts-<code>`). Tous ne sont pas
publiés : voici le résultat de la sonde sur les codes qui nous intéressent.

| Langue | Code MMS | Modèle publié | Conséquence |
| --- | --- | --- | --- |
| Français | `fra` | ✅ `facebook/mms-tts-fra` | 56 clips générés |
| Anglais | `eng` | ✅ `facebook/mms-tts-eng` | 56 clips générés |
| Fulfulde | `fub`, `fuv`, `fuf`, `ffm` | ❌ (401) | **aucune voix de synthèse** : enregistrement humain |
| Duala, Ewondo, Basaa, Ghomala, Medumba, Pidgin | `dua`, `ewo`, `bas`, `bbj`, `byv`, `wes` | ❌ (401) | idem |
| Haoussa, Bulu | `hau`, `bul` | ✅ | publiés, mais ces langues n'ont pas encore de catalogue de réponses |

**Règle appliquée** : on ne fait jamais lire du fulfulde par une voix française. Une langue sans
modèle garde `audio: null` et `voice.model: null` dans la réponse IVR ; le texte reste prononçable
par un humain ou par le central. C'est vérifié par un test.

> Licence : **CC-BY-NC 4.0**. Les clips sont utilisables pour la démonstration et la recherche,
> pas pour un service commercial. Pour une mise en production, remplacer le moteur
> (voix sous licence commerciale, ou enregistrements de locuteurs) — le format de sortie ne change pas.

## 2. Produire les clips

```bash
# une fois : Python 3 + torch + transformers (CPU suffit)
python -m pip install --upgrade torch transformers

cd nkaplingua
pnpm --filter @nkap/gateway tts              # catalogue + synthèse + index.json
pnpm --filter @nkap/gateway tts catalogue    # seulement le catalogue (aucun téléchargement)
```

Le premier lancement télécharge ~150 Mo par modèle dans le cache Hugging Face
(`~/.cache/huggingface`), puis la synthèse prend environ une demi-seconde par phrase.

Sortie :

```
apps/gateway/audio/
├── index.json              # moteur, date, modèles, licence, clips[], échecs[]
├── _jobs.json              # travail envoyé à Python (reproductible)
├── fr/<cle>.wav           # 56 clips
└── en/<cle>.wav           # 56 clips
```

`index.json` décrit chaque clip : `lang`, `key`, `text` (texte exact prononcé), `file`,
`duration_ms`, `bytes`, `model`, `status`. C'est ce fichier qui fait foi — pas la présence d'un WAV.

## 3. Ce qui n'est **pas** synthétisé, volontairement

- Les phrases à emplacement (`{amount}`, `{recipient}`, `{ref}`, `{balance}`) : un clip figé dirait
  un faux montant. Le catalogue les écarte et le dit (`28 ignorée(s) : phrase à emplacement`).
  L'IVR les affiche/lit par le texte ; l'assemblage audio + montant épelé est le travail suivant.
- Les messages composés (récapitulatif + question) : aucun clip ne correspond exactement, donc
  `audio: null`. On préfère pas d'audio à un audio qui ne dit pas tout.

## 4. Ce que le middleware expose

| Route | Rôle |
| --- | --- |
| `GET /voix` | page d'écoute : un lecteur par clip, par langue, avec la licence et la limite fulfulde |
| `GET /audio/index.json` | l'index complet (404 si `pnpm tts` n'a jamais tourné) |
| `GET /audio/<langue>/<cle>.wav` | le fichier, `audio/wav`, cache 1 h ; 404 sinon |
| `GET /health` | `voice: { engine, available, languages, withoutModel, licence }` |
| `POST /ivr` | chaque réponse porte `audio: {url, duration_ms, model, engine, status} \| null` et `voice: {model}` |

Les routes sont en lecture seule et ne demandent aucune clé : un clip est public par nature.
L'administration des langues, elle, reste locale (403 hors boucle locale).

Exemple de réponse IVR :

```json
{
  "channel": "ivr",
  "language": "fr",
  "say": "Choisissez:\n1. Solde\n2. Envoyer\n3. Frais\n4. Historique\n0. Quitter",
  "audio": { "url": "/audio/fr/ivr.menu.wav", "duration_ms": 5200, "model": "facebook/mms-tts-fra" },
  "voice": { "model": "facebook/mms-tts-fra" }
}
```

## 5. Tests

`apps/gateway/test/voice.test.ts` (8 tests) vérifie sans réseau ni modèle :

- la correspondance texte ↔ clip (espaces et retours à la ligne normalisés) ;
- le refus d'une langue sans modèle (`fub` → `audio: null`, `voice.model: null`) ;
- le service d'un WAV et de l'index, le 404 sur un clip absent, la tentative de traversée de chemin ;
- la page `/voix` ;
- l'attachement du clip à la réponse IVR ;
- un clip **humain** déclaré (`status: "human"`, `model: "locuteurs"`) sort dans `POST /ivr` et
  `voice.model` vaut `locuteurs`, jamais `null` ni un modèle de synthèse.

## 6. Passer aux enregistrements humains (fulfulde)

Le format est déjà celui qu'attend le serveur : il suffit de déposer `audio/fub/<cle>.wav` et
d'ajouter l'entrée correspondante dans `index.json` (même schéma, `engine: "human"`,
`model: "locuteurs"`, `status: "human"`). Le serveur retrouve le clip par le **texte exact** de la
phrase (comme pour la synthèse) et répond `voice.model: "locuteurs"` : c'est l'enregistrement qui
parle, pas une voix française déguisée. `GET /health` compte alors la langue avec son vrai modèle.
La fiche `docs/relecture/fub.md` fournit les phrases exactes, dans l'ordre, avec les deux colonnes
de verdict. Tant que la séance n'a pas eu lieu, le fulfulde reste sans audio — et le dit :
`audio: null`, `voice.model: null`, texte fulfulde servi en clair (vérifié en direct le 27/11 via
la sandbox : « Suɓo: 1. Ceede am keddiiɗe… », aucun audio).
