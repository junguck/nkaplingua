#!/usr/bin/env python3
"""Inspect and export Ewondo transcripts from the SOREVA test split."""

import csv
import json
from pathlib import Path
from typing import Any

from datasets import Audio, get_dataset_config_names, load_dataset

DATASET = "OlameMend/soreva"
CONFIG = "ewo_cm"
ANNOUNCED_COLUMNS = {
    "path",
    "audio",
    "transcription",
    "raw_transcription",
    "gender",
    "lang_id",
    "language",
}
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "tools" / "out" / "soreva-ewo.tsv"


def display_row(row: dict[str, Any]) -> dict[str, Any]:
    shown = dict(row)
    audio = shown.get("audio")
    if isinstance(audio, dict):
        shown["audio"] = {
            "path": audio.get("path"),
            "sampling_rate": audio.get("sampling_rate"),
            "array_samples": len(audio["array"]) if "array" in audio else None,
        }
    return shown


def is_ewondo(row: dict[str, Any], ewondo_ids: set[Any]) -> bool:
    language = row.get("language")
    language_matches = isinstance(language, str) and language.strip().casefold() in {"ewondo", "ewo"}
    lang_id = row.get("lang_id")
    id_matches = lang_id in ewondo_ids
    if "language" in row and ewondo_ids:
        return language_matches and id_matches
    if "language" in row:
        return language_matches
    return id_matches


def main() -> None:
    configs = get_dataset_config_names(DATASET, trust_remote_code=True)
    bulu_configs = [name for name in configs if "bulu" in name.casefold() or name.casefold().startswith("bul_") or name.casefold().startswith("bum_")]
    if not bulu_configs:
        print("Bulu absent de la fiche/configurations SOREVA (aucune config bulu/bum).")
    else:
        print(f"Configurations susceptibles de contenir du bulu : {bulu_configs}")

    dataset = load_dataset(DATASET, CONFIG, split="test", trust_remote_code=True)
    columns = list(dataset.column_names)
    print(f"Colonnes du split {CONFIG}/test : {columns}")
    missing_columns = ANNOUNCED_COLUMNS.difference(columns)
    if missing_columns:
        raise RuntimeError(f"Schéma SOREVA différent des champs annoncés, colonnes absentes : {sorted(missing_columns)}")

    dataset = dataset.cast_column("audio", Audio(decode=False))
    examples = [dataset[index] for index in range(min(5, len(dataset)))]
    print("Cinq premières lignes (audio limité aux métadonnées, aucun fichier audio exporté) :")
    for row in examples:
        print(json.dumps(display_row(row), ensure_ascii=True, default=str))

    ewondo_ids = {
        row["lang_id"]
        for row in dataset
        if isinstance(row.get("language"), str) and row["language"].strip().casefold() in {"ewondo", "ewo"}
    }
    rows = [row for row in dataset if is_ewondo(row, ewondo_ids)]
    if not rows:
        raise RuntimeError("Aucune ligne ewondo trouvée avec les champs language/lang_id observés.")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["id", "transcription", "raw_transcription"], delimiter="\t")
        writer.writeheader()
        for row in rows:
            path = row.get("path")
            audio = row.get("audio")
            sample_path = path or (audio.get("path") if isinstance(audio, dict) else None)
            if not isinstance(sample_path, str) or not sample_path:
                raise RuntimeError(f"Échantillon sans chemin permettant de construire un id : {row!r}")
            writer.writerow(
                {
                    "id": Path(sample_path).stem,
                    "transcription": row["transcription"],
                    "raw_transcription": row["raw_transcription"],
                }
            )
    print(f"{len(rows)} transcriptions ewondo exportées vers {OUTPUT.relative_to(ROOT)} (sans audio).")


if __name__ == "__main__":
    main()
