"""Backup local `invento` DB to JSON files before running migrations.

Usage (from backend/):
    PYTHONPATH=/home/hrk/Projects/Invento/backend .venv/bin/python /home/hrk/Projects/Invento/scripts/backup_before_migration.py

Additive-safe: read-only, never writes to Mongo. Prints per-collection counts.
"""
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import motor.motor_asyncio  # noqa: E402


def _json_default(v):
    from bson import ObjectId
    from datetime import datetime as dt

    if isinstance(v, ObjectId):
        return {"$oid": str(v)}
    if isinstance(v, dt):
        return {"$date": v.isoformat()}
    return str(v)


async def main() -> None:
    uri = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/?replicaSet=rs0")
    db_name = os.environ.get("MONGO_DB", "invento")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = Path(__file__).resolve().parent / f"backup_{db_name}_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=False)
    client = motor.motor_asyncio.AsyncIOMotorClient(uri)
    db = client[db_name]
    names = sorted(await db.list_collection_names())
    total = 0
    for name in names:
        docs = await db[name].find().to_list(None)
        total += len(docs)
        (out_dir / f"{name}.json").write_text(
            json.dumps(docs, default=_json_default, indent=1), encoding="utf-8"
        )
        print(f"  {name}: {len(docs)} docs")
    print(f"Backup of '{db_name}' complete: {total} docs -> {out_dir}")
    client.close()


asyncio.run(main())
