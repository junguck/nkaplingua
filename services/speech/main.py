from __future__ import annotations

import io
import threading
from functools import lru_cache
from typing import Literal

import av
import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from transformers import AutoModelForCTC, AutoProcessor, AutoTokenizer, VitsModel

SpeechLanguage = Literal["ewo", "bul"]
ASR_ADAPTERS = {"ewo": "ewo", "bul": "bum"}
TTS_MODELS = {
    "ewo": "OlameMend/mms-tts-ewo",
    "bul": "OlameMend/mms-tts-bum",
}

app = FastAPI(title="NkapLingua speech service")


class TtsRequest(BaseModel):
    text: str
    lang: SpeechLanguage


class AsrRuntime:
    def __init__(self) -> None:
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.processor = AutoProcessor.from_pretrained("facebook/mms-1b-all")
        self.model = AutoModelForCTC.from_pretrained("facebook/mms-1b-all").to(self.device)
        self.loaded_adapters: set[str] = set()
        self.lock = threading.Lock()

    def transcribe(self, audio: np.ndarray, language: SpeechLanguage) -> tuple[str, float]:
        adapter = ASR_ADAPTERS[language]
        with self.lock:
            self.processor.tokenizer.set_target_lang(adapter)
            if adapter not in self.loaded_adapters:
                self.model.load_adapter(adapter, force_load=True)
                self.loaded_adapters.add(adapter)
            self.model.set_active_adapters(adapter)
            inputs = self.processor(audio, sampling_rate=16000, return_tensors="pt", padding=True)
            inputs = {name: tensor.to(self.device) for name, tensor in inputs.items()}
            with torch.inference_mode():
                logits = self.model(**inputs).logits
            probabilities = logits.softmax(dim=-1)
            confidence = float(probabilities.max(dim=-1).values.mean().cpu())
            tokens = logits.argmax(dim=-1)
            text = self.processor.batch_decode(tokens)[0].strip()
        return text, confidence


class TtsRuntime:
    def __init__(self, model_name: str) -> None:
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = VitsModel.from_pretrained(model_name).to(self.device)

    def synthesize(self, text: str) -> bytes:
        tokens = self.tokenizer(text, return_tensors="pt")
        tokens = {name: tensor.to(self.device) for name, tensor in tokens.items()}
        with torch.inference_mode():
            waveform = self.model(**tokens).waveform.squeeze().cpu().numpy()
        output = io.BytesIO()
        sf.write(output, waveform, self.model.config.sampling_rate, format="WAV")
        return output.getvalue()


@lru_cache(maxsize=1)
def asr_runtime() -> AsrRuntime:
    return AsrRuntime()


@lru_cache(maxsize=2)
def tts_runtime(language: SpeechLanguage) -> TtsRuntime:
    return TtsRuntime(TTS_MODELS[language])


def decode_audio(data: bytes) -> np.ndarray:
    try:
        container = av.open(io.BytesIO(data))
        audio_stream = next((stream for stream in container.streams if stream.type == "audio"), None)
        if audio_stream is None:
            raise ValueError("Aucune piste audio trouvée.")
        resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
        frames: list[np.ndarray] = []
        for frame in container.decode(audio_stream):
            for converted in resampler.resample(frame):
                frames.append(converted.to_ndarray().reshape(-1))
        for converted in resampler.resample(None):
            frames.append(converted.to_ndarray().reshape(-1))
        if not frames:
            raise ValueError("Audio vide.")
        return np.concatenate(frames).astype(np.float32) / 32768.0
    except (av.error.FFmpegError, StopIteration, ValueError) as error:
        raise HTTPException(status_code=400, detail=f"Audio illisible : {error}") from error


def transcribe_audio(data: bytes, lang: SpeechLanguage) -> dict[str, str | float]:
    samples = decode_audio(data)
    text, confidence = asr_runtime().transcribe(samples, lang)
    return {"text": text, "confidence": confidence}


@app.post("/v1/stt")
async def transcribe(request: Request, lang: SpeechLanguage = Query(...)) -> dict[str, str | float]:
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Audio vide.")
    return await run_in_threadpool(transcribe_audio, data, lang)


@app.post("/v1/tts")
def synthesize(request: TtsRequest) -> Response:
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Le texte ne peut pas être vide.")
    wav = tts_runtime(request.lang).synthesize(request.text)
    return Response(content=wav, media_type="audio/wav", headers={"X-Translation-Status": "draft"})
