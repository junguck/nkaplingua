"""Moteurs de synthèse. Le moteur torch est chargé paresseusement, une fois par langue."""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from typing import Protocol

import numpy as np


@dataclass(frozen=True)
class Speech:
    samples: np.ndarray  # float32 mono, [-1, 1]
    sample_rate: int


class Engine(Protocol):
    def languages(self) -> list[str]: ...
    def synthesize(self, lang: str, text: str) -> Speech: ...


# Codes SAFINUM (ISO 639-3) vers dépôts MMS. Liste à confirmer sur huggingface.co/facebook :
# une langue absente du hub est simplement signalée « sans modèle » par /health, jamais simulée.
DEFAULT_MODELS: dict[str, str] = {
    "fr": "facebook/mms-tts-fra",
    "en": "facebook/mms-tts-eng",
    "hau": "facebook/mms-tts-hau",
    "ewo": "facebook/mms-tts-ewo",
    "bum": "facebook/mms-tts-bum",
    "bas": "facebook/mms-tts-bas",
    "fub": "facebook/mms-tts-fub",
}


class MmsEngine:
    """facebook/mms-tts-* (VITS, CC-BY-NC 4.0 : usage commercial à négocier, voir le dossier)."""

    def __init__(self, models: dict[str, str] | None = None, device: str | None = None) -> None:
        import torch  # import tardif : les tests et le transcodage n'en ont pas besoin

        self._torch = torch
        self._models = dict(models or DEFAULT_MODELS)
        self._device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self._loaded: dict[str, tuple[object, object]] = {}
        self._failed: dict[str, str] = {}
        self._lock = threading.Lock()
        torch.set_num_threads(max(1, int(os.environ.get("TTS_THREADS", "2"))))

    def languages(self) -> list[str]:
        return [lang for lang in self._models if lang not in self._failed]

    def failures(self) -> dict[str, str]:
        return dict(self._failed)

    def _load(self, lang: str) -> tuple[object, object]:
        with self._lock:
            if lang in self._loaded:
                return self._loaded[lang]
            if lang in self._failed:
                raise LookupError(self._failed[lang])
            repo = self._models.get(lang)
            if repo is None:
                raise LookupError(f"aucun modèle déclaré pour {lang}")
            try:
                from transformers import AutoTokenizer, VitsModel

                tokenizer = AutoTokenizer.from_pretrained(repo)
                model = VitsModel.from_pretrained(repo).to(self._device).eval()
            except Exception as error:  # dépôt absent, réseau coupé : on le dit
                self._failed[lang] = f"{repo}: {error}"
                raise LookupError(self._failed[lang]) from error
            self._loaded[lang] = (tokenizer, model)
            return self._loaded[lang]

    def synthesize(self, lang: str, text: str) -> Speech:
        tokenizer, model = self._load(lang)
        inputs = tokenizer(text, return_tensors="pt").to(self._device)  # type: ignore[operator]
        with self._torch.inference_mode():
            waveform = model(**inputs).waveform  # type: ignore[operator]
        samples = waveform.squeeze().detach().to("cpu", self._torch.float32).numpy()
        return Speech(samples=samples, sample_rate=int(model.config.sampling_rate))  # type: ignore[attr-defined]


class NullEngine:
    """Image sans PyTorch : aucune synthèse, jamais de voix inventée. Le transcodage reste disponible."""

    def __init__(self, reason: str) -> None:
        self._reason = reason

    def languages(self) -> list[str]:
        return []

    def failures(self) -> dict[str, str]:
        return {"*": self._reason}

    def synthesize(self, lang: str, text: str) -> Speech:
        raise LookupError(f"synthèse indisponible : {self._reason}")


class ToneEngine:
    """Moteur de test : un bip par mot. Ne sert jamais en production."""

    def languages(self) -> list[str]:
        return ["fr", "en"]

    def synthesize(self, lang: str, text: str) -> Speech:
        if lang not in self.languages():
            raise LookupError(f"aucun modèle pour {lang}")
        rate = 16_000
        words = max(1, len(text.split()))
        t = np.arange(int(rate * 0.12)) / rate
        beep = 0.3 * np.sin(2 * np.pi * 660 * t).astype(np.float32)
        gap = np.zeros(int(rate * 0.06), dtype=np.float32)
        return Speech(samples=np.concatenate([np.concatenate([beep, gap]) for _ in range(words)]), sample_rate=rate)
