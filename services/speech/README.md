# Service vocal Ewondo / Bulu

Service Python séparé du processus Node. Les modèles sont chargés à la demande dans ce service uniquement.

## Installation et lancement

```bash
cd services/speech
python -m venv .venv
# Windows : .venv\Scripts\activate
# Linux/macOS : source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

Le gateway reste désactivé si `SPEECH_BACKEND_URL` n’est pas défini. Pour le connecter :

```bash
SPEECH_BACKEND_URL=http://127.0.0.1:8000 pnpm dev:gateway
```

Sous PowerShell :

```powershell
$env:SPEECH_BACKEND_URL = "http://127.0.0.1:8000"
pnpm dev:gateway
```

Le proxy Next.js de l’application web relaie `/v1/*` vers `http://127.0.0.1:8080` par défaut. Pour une autre
adresse gateway, définir `NKAP_GATEWAY_URL` avant de lancer Next.js.

`POST /v1/stt?lang=ewo` ou `lang=bul` reçoit le fichier audio brut et renvoie `{ "text": "...", "confidence": 0.0 }`.
`POST /v1/tts` reçoit `{ "text": "...", "lang": "ewo" }` ou `"bul"` et renvoie du WAV avec le statut `draft`.
Le modèle MMS ASR utilise les adaptateurs `ewo` et `bum` respectivement.

## Licences et statut linguistique

**Avant tout usage commercial, vérifier les licences de chacun des modèles et de leurs adaptateurs. Les modèles
MMS d’origine sont sous CC-BY-NC-4.0 (usage non commercial) ; la licence propre aux checkpoints TTS
OlameMend doit également être vérifiée.** La sortie vocale est une synthèse machine de statut `draft`, jamais une
traduction validée. Une phrase complète ne doit pas être présentée comme une traduction avant relecture humaine.
