"""API HTTP du service audio. Cache disque par empreinte (langue, texte) : on ne synthétise qu'une fois."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .audio import speech_to_mp3, transcode_to_mp3
from .engine import Engine

MAX_TEXT = 400  # limite d'un tour IVR


class SynthesisRequest(BaseModel):
    lang: str = Field(pattern=r"^[a-z]{2,3}$")
    text: str = Field(min_length=1, max_length=MAX_TEXT)


def create_app(engine: Engine, cache_dir: Path) -> FastAPI:
    app = FastAPI(title="NkapLingua audio", docs_url=None, redoc_url=None)
    cache_dir.mkdir(parents=True, exist_ok=True)

    @app.get("/health")
    def health() -> dict[str, object]:
        failures = getattr(engine, "failures", lambda: {})()
        return {"ok": True, "languages": engine.languages(), "unavailable": sorted(failures)}

    @app.post("/synthesize")
    def synthesize(body: SynthesisRequest) -> Response:
        if "{" in body.text:
            # Jamais de gabarit à trous : « {amount} » serait prononcé littéralement.
            raise HTTPException(422, "texte avec emplacement : synthèse refusée")
        digest = hashlib.sha256(f"{body.lang}\x00{body.text}".encode()).hexdigest()
        path = cache_dir / body.lang / f"{digest}.mp3"
        if not path.exists():
            try:
                speech = engine.synthesize(body.lang, body.text)
            except LookupError as error:
                raise HTTPException(404, str(error)) from error
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            tmp.write_bytes(speech_to_mp3(speech))
            os.replace(tmp, path)  # écriture atomique : jamais de fichier à moitié servi
        return Response(path.read_bytes(), media_type="audio/mpeg", headers={"x-cache-key": digest})

    @app.post("/transcode")
    async def transcode(request: Request) -> Response:
        raw = await request.body()
        try:
            return Response(transcode_to_mp3(raw), media_type="audio/mpeg")
        except ValueError as error:
            raise HTTPException(422, str(error)) from error

    return app


def build() -> FastAPI:
    """Point d'entrée uvicorn : `uvicorn nkap_tts.app:build --factory`."""
    if os.environ.get("TTS_ENGINE", "mms") == "tone":
        from .engine import ToneEngine

        engine: Engine = ToneEngine()
    else:
        from .engine import MmsEngine

        engine = MmsEngine()
    return create_app(engine, Path(os.environ.get("TTS_CACHE", ".cache/tts")))
