#!/usr/bin/env python
"""Synthèse vocale avec les modèles `facebook/mms-tts-*` (VITS, licence CC-BY-NC 4.0).

Lit un catalogue de phrases (JSON) et écrit un WAV par phrase plus un `index.json`.

    python scripts/tts_mms.py audio/_jobs.json audio

Le catalogue est produit par `pnpm --filter @nkap/gateway tts` (voir `src/tools/tts-cli.ts`) :
il ne contient que des phrases SANS emplacement `{montant}` (on ne synthétise jamais un
gabarit à trous) et seulement pour les langues qui ont réellement un modèle publié.

Aucune dépendance hors `torch` + `transformers` : le WAV est écrit avec le module standard
`wave`, donc pas d'audioop/ffmpeg à installer.

Codes de sortie : 0 = tout est écrit, 1 = au moins un échec (le détail est dans l'index).
"""

from __future__ import annotations

import json
import os
import sys
import time
import wave

import torch
from transformers import AutoTokenizer, VitsModel

ENGINE = "facebook/mms-tts"


def write_wav(path: str, samples, sampling_rate: int) -> tuple[int, int]:
    """Écrit un WAV PCM 16 bits mono normalisé en crête ; renvoie (octets, durée_ms)."""
    tensor = samples.detach().to(torch.float32).flatten()
    peak = float(tensor.abs().max()) if tensor.numel() else 0.0
    if peak > 0:
        tensor = tensor / peak * 0.9
    pcm = (tensor.clamp(-1.0, 1.0) * 32767.0).to(torch.int16).numpy()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sampling_rate)
        handle.writeframes(pcm.tobytes())
    duration_ms = int(round(len(pcm) / sampling_rate * 1000))
    return os.path.getsize(path), duration_ms


def main() -> int:
    if len(sys.argv) < 3:
        print("usage : python scripts/tts_mms.py <catalogue.json> <dossier-audio>", file=sys.stderr)
        return 2

    jobs_path, audio_dir = sys.argv[1], sys.argv[2]
    with open(jobs_path, encoding="utf-8") as handle:
        jobs = json.load(handle)

    loaded: dict[str, tuple] = {}
    clips = []
    failures = []
    started = time.time()

    for index, job in enumerate(jobs, start=1):
        model_id = job["model"]
        label = f"[{index}/{len(jobs)}] {job['lang']}/{job['key']}"
        try:
            if model_id not in loaded:
                print(f"{label} : chargement de {model_id}…", flush=True)
                tokenizer = AutoTokenizer.from_pretrained(model_id)
                model = VitsModel.from_pretrained(model_id)
                model.eval()
                loaded[model_id] = (tokenizer, model)
            tokenizer, model = loaded[model_id]

            inputs = tokenizer(job["text"], return_tensors="pt")
            with torch.no_grad():
                waveform = model(**inputs).waveform

            relative = os.path.join(job["lang"], f"{job['key']}.wav")
            absolute = os.path.join(audio_dir, relative)
            size, duration_ms = write_wav(absolute, waveform[0], model.config.sampling_rate)
            clips.append(
                {
                    "lang": job["lang"],
                    "key": job["key"],
                    "text": job["text"],
                    "file": relative.replace(os.sep, "/"),
                    "duration_ms": duration_ms,
                    "bytes": size,
                    "model": model_id,
                    "engine": ENGINE,
                    "status": "generated",
                }
            )
            print(f"{label} : {duration_ms} ms, {size // 1024} Ko", flush=True)
        except Exception as error:  # on continue : un échec ne doit pas jeter les autres clips
            failures.append({"lang": job["lang"], "key": job["key"], "error": str(error)})
            print(f"{label} : ÉCHEC {error}", flush=True)

    index = {
        "engine": ENGINE,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "elapsed_s": round(time.time() - started, 1),
        "sampling_rate": next(
            (loaded[job["model"]][1].config.sampling_rate for job in jobs if job["model"] in loaded),
            None,
        ),
        "models": sorted(loaded.keys()),
        "clips": clips,
        "failures": failures,
        "licence": "facebook/mms-tts — CC-BY-NC 4.0 (démo / recherche, pas d'usage commercial)",
    }
    os.makedirs(audio_dir, exist_ok=True)
    with open(os.path.join(audio_dir, "index.json"), "w", encoding="utf-8") as handle:
        json.dump(index, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(f"\n{len(clips)} clip(s), {len(failures)} échec(s), {index['elapsed_s']} s")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
