"""Encodage mp3 via ffmpeg (l'IVR SAFINUM accepte m4a ou mp3, pas le wav)."""

from __future__ import annotations

import subprocess

import numpy as np

from .engine import Speech

# Bande téléphonique : mono 16 kHz, 32 kb/s. Un clip de 3 s pèse environ 12 Ko.
MP3_ARGS = ["-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "mp3"]


def _ffmpeg(input_args: list[str], data: bytes, timeout: float = 20.0) -> bytes:
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", *input_args, "-i", "pipe:0", *MP3_ARGS, "pipe:1"],
        input=data,
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0 or not proc.stdout:
        raise ValueError(proc.stderr.decode("utf-8", "replace")[:300] or "ffmpeg a échoué")
    return proc.stdout


def speech_to_mp3(speech: Speech) -> bytes:
    peak = float(np.abs(speech.samples).max()) if speech.samples.size else 0.0
    normalized = speech.samples / peak * 0.9 if peak > 0 else speech.samples
    pcm = (np.clip(normalized, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    return _ffmpeg(["-f", "s16le", "-ar", str(speech.sample_rate), "-ac", "1"], pcm)


def transcode_to_mp3(raw: bytes, max_bytes: int = 4_000_000) -> bytes:
    """Enregistrement du studio (webm/opus, mp4/aac, wav...) vers mp3 téléphonique."""
    if len(raw) == 0 or len(raw) > max_bytes:
        raise ValueError("taille d'audio refusée")
    return _ffmpeg([], raw)
