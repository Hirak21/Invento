"""Idempotent migration (2026-10-06): price normalisation + plate/cup units.

Adapted to this repo (FastAPI + Pydantic + Motor — there are no Mongoose
schemas): model changes live in ``backend/app/models/enums.py`` (Unit enum),
``backend/app/utils/units.py`` (conversion families) and the Pydantic
quantity fields. This script only normalises *data* on the connected
MongoDB cluster:

  - inventory_items with a missing/undefined/empty-string ``selling_price``
    get ``selling_price: None`` (null, NOT 0) so "has a price" filters behave
    consistently. Existing 0/"0.00" values are LEFT untouched (the display
    filter already excludes them; changing money silently would be wrong).
  - Reports unknown ``base_unit`` values outside the extended enum
    (pcs, kg, g, litre, l, ml, box, packet, plate, cup). plate/cup need no
    backfill — they are additive. Unknown values are LISTED ONLY, never
    overwritten. Existing documents stay valid.

Nothing is deleted. Re-runs are no-ops (filters only match unmigrated docs).

URI is read from the environment (MONGO_URI/MONGO_DB) or backend/.env;
credentials are never printed — logs show only host + db name.

Usage:
    PYTHONPATH=backend backend/.venv/bin/python scripts/migrate-2026-10-06.py --dry-run
    PYTHONPATH=backend backend/.venv/bin/python scripts/migrate-2026-10-06.py --apply
"""

import argparse
import asyncio
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import motor.motor_asyncio  # noqa: E402

ALLOWED_UNITS = {"pcs", "kg", "g", "litre", "l", "ml", "box", "packet", "plate", "cup"}
SAMPLE_LIMIT = 10


def _load_dotenv(path: str) -> None:
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                key, val = key.strip(), val.strip().strip("'\"")
                os.environ.setdefault(key, val)
    except FileNotFoundError:
        pass


def _masked_host(uri: str) -> str:
    try:
        without_scheme = uri.split("://", 1)[1]
        hostpart = without_scheme.split("@")[-1]
        return hostpart.split("/")[0].split("?")[0] or "?"
    except Exception:
        return "?"


async def collect(db):
    """Read-only scan. Returns (actions, notes)."""
    actions: list[tuple[str, dict, dict]] = []  # (coll, filter, update)
    notes: dict[str, object] = {}

    missing = await db.inventory_items.count_documents({"selling_price": {"$exists": False}})
    empty = await db.inventory_items.count_documents({"selling_price": ""})
    if missing:
        actions.append((
            "inventory_items",
            {"selling_price": {"$exists": False}},
            {"$set": {"selling_price": None}},
        ))
    if empty:
        actions.append((
            "inventory_items",
            {"selling_price": ""},
            {"$set": {"selling_price": None}},
        ))
    notes["selling_price_missing"] = missing
    notes["selling_price_empty_string"] = empty

    hidden_zero = await db.inventory_items.count_documents(
        {"selling_price": {"$in": [0, 0.0, "0", "0.0", "0.00"]}}
    )
    hidden_null = await db.inventory_items.count_documents({"selling_price": None})
    notes["selling_price_zero_left_untouched"] = hidden_zero
    notes["selling_price_null_already"] = hidden_null

    unknown_units: list[str] = []
    async for doc in db.inventory_items.find(
        {"base_unit": {"$nin": sorted(ALLOWED_UNITS)}}, {"base_unit": 1, "name": 1}
    ).limit(200):
        unknown_units.append(f"{doc.get('name', '?')} (base_unit={doc.get('base_unit')!r})")
    notes["unknown_base_units"] = unknown_units
    notes["unknown_base_unit_count_capped_at_200"] = len(unknown_units)

    unit_counts: dict[str, int] = {}
    for unit in sorted(ALLOWED_UNITS):
        unit_counts[unit] = await db.inventory_items.count_documents({"base_unit": unit})
    notes["base_unit_counts"] = unit_counts

    return actions, notes


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Print what would change (default).")
    ap.add_argument("--apply", action="store_true", help="Write changes to the database.")
    args = ap.parse_args()
    do_apply = args.apply and not args.dry_run

    repo_root = os.path.join(os.path.dirname(__file__), "..")
    _load_dotenv(os.path.join(repo_root, "backend", ".env"))
    _load_dotenv(os.path.join(repo_root, ".env"))

    uri = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/?replicaSet=rs0")
    db_name = os.environ.get("MONGO_DB", "invento")
    client = motor.motor_asyncio.AsyncIOMotorClient(uri)
    db = client[db_name]

    print(f"Target: host={_masked_host(uri)} db={db_name} mode={'APPLY' if do_apply else 'DRY-RUN'}")
    try:
        actions, notes = await collect(db)
    except Exception as exc:
        print(
            f"Cannot reach MongoDB (host={_masked_host(uri)} db={db_name}): "
            f"{type(exc).__name__}. Start mongod or set MONGO_URI/MONGO_DB and retry."
        )
        raise SystemExit(2)

    print(f"selling_price missing (would set null): {notes['selling_price_missing']}")
    print(f"selling_price empty-string (would set null): {notes['selling_price_empty_string']}")
    print(f"selling_price zero/\"0.00\" (left untouched, hidden by filter): {notes['selling_price_zero_left_untouched']}")
    print(f"selling_price already null: {notes['selling_price_null_already']}")
    print(f"base_unit counts: {notes['base_unit_counts']}")
    unknowns = notes["unknown_base_units"]
    print(f"unknown base_unit docs (listed only, never overwritten): {len(unknowns)}")
    for sample in unknowns[:SAMPLE_LIMIT]:
        print(f"  - {sample}")

    if not actions:
        print("Nothing to change — database already migrated (idempotent no-op).")
    elif not do_apply:
        total = 0
        for coll, filt, upd in actions:
            n = await db[coll].count_documents(filt)
            total += n
            print(f"  WOULD update {coll} filter={filt} update={upd} -> {n} doc(s)")
        print(f"Dry run complete: {total} doc(s) would change. Re-run with --apply to write.")
    else:
        total = 0
        for coll, filt, upd in actions:
            res = await db[coll].update_many(filt, upd)
            total += res.modified_count
            print(f"  Updated {coll}: matched={res.matched_count} modified={res.modified_count}")
        print(f"Apply complete: {total} doc(s) changed. Re-run is a no-op (verify with --dry-run).")

    client.close()


asyncio.run(main())
