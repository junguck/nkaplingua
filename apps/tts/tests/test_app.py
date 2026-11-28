import subprocess
from pathlib import Path

from fastapi.testclient import TestClient

from nkap_tts.app import create_app
from nkap_tts.engine import ToneEngine


def client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(ToneEngine(), tmp_path))


def test_synthese_mp3_et_cache(tmp_path: Path) -> None:
    c = client(tmp_path)
    first = c.post("/synthesize", json={"lang": "fr", "text": "Votre solde"})
    assert first.status_code == 200
    assert first.headers["content-type"] == "audio/mpeg"
    assert first.content[:3] == b"ID3" or first.content[0] == 0xFF
    second = c.post("/synthesize", json={"lang": "fr", "text": "Votre solde"})
    assert second.headers["x-cache-key"] == first.headers["x-cache-key"]
    assert len(list((tmp_path / "fr").glob("*.mp3"))) == 1


def test_refuse_les_gabarits(tmp_path: Path) -> None:
    assert client(tmp_path).post("/synthesize", json={"lang": "fr", "text": "Solde {amount}"}).status_code == 422


def test_langue_sans_modele_signalee_jamais_simulee(tmp_path: Path) -> None:
    assert client(tmp_path).post("/synthesize", json={"lang": "dua", "text": "mbolo"}).status_code == 404


def test_transcode_un_enregistrement_du_studio(tmp_path: Path) -> None:
    webm = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "libopus", "-f", "webm", "pipe:1"],
        capture_output=True, check=True,
    ).stdout
    res = client(tmp_path).post("/transcode", content=webm)
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/mpeg"
