#!/usr/bin/env python3
"""Clear all operational data from Invento Lite database for fresh start.

Usage: python scripts/clear_all_data.py [--confirm]
"""
import asyncio
import sys
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import get_settings


async def clear_all_data(confirm: bool = False) -> None:
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongo_uri)
    db = client[settings.mongo_db]

    collections_to_clear = [
        "inventory_movements",
        "purchases",
        "sales",
        "wastage",
        "stock_adjustments",
        "expenses",
        "audit_logs",
        "counters",
        "inventory_items",
        "categories",
        "suppliers",
        "business_units",
        "users",  # This will require re-bootstrap
    ]

    print("This will DELETE ALL DATA from the following collections:")
    for col in collections_to_clear:
        count = await db[col].count_documents({})
        print(f"  - {col}: {count} documents")

    if not confirm:
        response = input("\nType 'YES' to confirm: ")
        if response.strip() != "YES":
            print("Aborted.")
            return

    print("\nClearing data...")
    for col in collections_to_clear:
        await db[col].delete_many({})
        print(f"  Cleared {col}")

    print("\n✅ All data cleared. Database is ready for fresh start.")
    print("Note: You'll need to bootstrap a new owner account on first login.")


if __name__ == "__main__":
    confirm = "--confirm" in sys.argv
    asyncio.run(clear_all_data(confirm=confirm))