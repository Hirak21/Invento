from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase


async def get_low_stock_items(
    db: AsyncIOMotorDatabase,
    *,
    business_unit_id: str | None = None,
    include_out: bool = True,
) -> list[dict[str, Any]]:
    """Return inventory items at or below their min_stock_level.

    Items with current_stock <= 0 are marked 'out'; the rest are 'low'.
    When include_out is False, out-of-stock items are excluded entirely.
    """
    query: dict[str, Any] = {
        "$expr": {"$lte": ["$current_stock", "$min_stock_level"]},
        "active": True,
    }
    if business_unit_id:
        query["business_unit_id"] = business_unit_id

    cursor = db.inventory_items.find(query).sort("current_stock", 1)

    results: list[dict[str, Any]] = []
    async for doc in cursor:
        current = int(doc.get("current_stock", 0))
        min_level = int(doc.get("min_stock_level", 0))

        if current <= 0 and not include_out:
            continue

        suggested = max(min_level * 2 - current, 0)

        results.append({
            "item_id": str(doc["_id"]),
            "item_name": doc.get("name", ""),
            "current_stock": current,
            "min_stock_level": min_level,
            "base_unit": doc.get("base_unit", "pcs"),
            "suggested_reorder_qty": suggested,
            "status": "out" if current <= 0 else "low",
        })

    return results
