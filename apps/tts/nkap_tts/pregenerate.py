"""Pré-génère au démarrage les clips des phrases FIXES validées, pour les langues qui ont un modèle.

Priorité à la voix humaine : une traduction qui a déjà un enregistrement validé n'est jamais
écrasée. Les gabarits à emplacements sont ignorés (le montant est lu par la synthèse SAFINUM).

    python -m nkap_tts.pregenerate
"""

from __future__ import annotations

import json
import os

import gridfs
import redis
from pymongo import MongoClient

from .audio import speech_to_mp3
from .engine import MmsEngine


def main() -> int:
    mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017"))
    db = mongo[os.environ.get("MONGO_DB", "nkaplingua")]
    fs = gridfs.GridFS(db, collection="audio")
    cache = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://127.0.0.1:6379"))
    engine = MmsEngine()
    done, skipped, failed = 0, 0, 0
    for doc in db.translations.find({"audioId": None, "key": {"$not": {"$regex": r"^ui\."}}}):
        if "{" in doc["text"] or doc["lang"] not in engine.languages():
            skipped += 1
            continue
        try:
            mp3 = speech_to_mp3(engine.synthesize(doc["lang"], doc["text"]))
        except LookupError:
            failed += 1
            continue
        file_id = fs.put(mp3, filename=f"{doc['lang']}/{doc['key']}.mp3", metadata={"contentType": "audio/mpeg", "source": "tts"})
        db.translations.update_one({"_id": doc["_id"], "audioId": None}, {"$set": {"audioId": str(file_id), "audioSource": "tts"}})
        cache.hset(f"i18n:t:{doc['lang']}", doc["key"], json.dumps({"t": doc["text"], "a": str(file_id)}))
        cache.publish("i18n:changed", json.dumps({"kind": "upsert", "lang": doc["lang"], "key": doc["key"]}))
        done += 1
    print(json.dumps({"generated": done, "skipped": skipped, "failed": failed, "unavailable": engine.failures()}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
