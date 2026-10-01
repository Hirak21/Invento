"""Additive, idempotent migration: backfill ``unit_type`` on business_units.

Rule (data-driven, no hardcoded names):
  - unit has any rooms, stays, or recipes  -> "restaurant"
  - otherwise                               -> "retail" (safe default: Items tab)

Only touches docs MISSING ``unit_type`` (re-runs are no-ops).
Rollback: db.business_units.updateMany({migrated_unit_type:true},
            {$unset:{unit_type:"", migrated_unit_type:""}})
            (only removes values THIS migration wrote — it tags them).

Usage:
    # 1) dry run on the real DB (read-only):
    PYTHONPATH=backend backend/.venv/bin/python scripts/migrate_unit_types.py --dry-run
    # 2) test on a COPY first (script clones each collection):
    PYTHONPATH=backend backend/.venv/bin/python scripts/migrate_unit_types.py --test-on-copy
    # 3) apply for real (take a backup first: scripts/backup_before_migration.py):
    PYTHONPATH=backend backend/.venv/bin/python scripts/migrate_unit_types.py --apply
"""
import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import motor.motor_asyncio  # noqa: E402


async def infer_unit_type(db, bu_id: str) -> str:
    for coll in ("rooms", "stays", "recipes"):
        if await db[coll].count_documents({"business_unit_id": bu_id}, limit=1):
            return "restaurant"
    return "retail"


async def run(db, *, dry_run: bool) -> dict:
    stats = {"examined": 0, "restaurant": 0, "retail": 0, "skipped": 0}
    async for bu in db.business_units.find():
        stats["examined"] += 1
        if bu.get("unit_type") in ("restaurant", "retail"):
            stats["skipped"] += 1
            continue
        inferred = await infer_unit_type(db, str(bu["_id"]))
        stats[inferred] += 1
        print(f"  {bu['name']} ({str(bu['_id'])[:8]}...) -> {inferred}")
        if not dry_run:
            await db.business_units.update_one(
                {"_id": bu["_id"], "unit_type": {"$exists": False}},
                {"$set": {"unit_type": inferred, "migrated_unit_type": True}},
            )
    return stats


async def copy_db(client, src: str, dest: str) -> None:
    await client.drop_database(dest)
    for name in await client[src].list_collection_names():
        docs = await client[src][name].find().to_list(None)
        if docs:
            await client[dest][name].insert_many(docs)
    print(f"Copied '{src}' -> '{dest}'.")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--test-on-copy", action="store_true")
    args = ap.parse_args()
    uri = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/?replicaSet=rs0")
    db_name = os.environ.get("MONGO_DB", "invento")
    client = motor.motor_asyncio.AsyncIOMotorClient(uri)

    if args.test_on_copy:
        copy_name = f"{db_name}_migrate_copy"
        await copy_db(client, db_name, copy_name)
        db = client[copy_name]
        print(f"Dry run on COPY '{copy_name}':")
        stats = await run(db, dry_run=True)
        print("Copy dry-run:", stats)
        print(f"Applying on COPY '{copy_name}':")
        stats = await run(db, dry_run=False)
        print("Copy apply:", stats)
        print(f"Re-run (must be all skipped): {await run(db, dry_run=False)}")
        client.close()
        return

    db = client[db_name]
    if args.apply:
        print(f"Applying migration on '{db_name}':")
        print(await run(db, dry_run=False))
    else:
        print(f"Dry run on '{db_name}' (use --apply to write, --test-on-copy first):")
        print(await run(db, dry_run=True))
    client.close()


asyncio.run(main())
