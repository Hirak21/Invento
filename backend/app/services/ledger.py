from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

from app.models.enums import MovementType


def parse_oid(value: str) -> ObjectId:
    """Convert hex id to ObjectId; ValueError on garbage."""
    try:
        return ObjectId(value)
    except Exception:
        raise ValueError("Invalid id format.") from None


# Backwards-compatible alias used across services/routers.
oid = parse_oid


def is_oid(value: str) -> bool:
    return ObjectId.is_valid(value)


async def record_movement(
    db: AsyncIOMotorDatabase,
    session: AsyncIOMotorClientSession | None,
    *,
    item_doc: dict[str, Any],
    movement_type: MovementType,
    quantity: int,
    reference_type: str,
    reference_id: str | None = None,
    unit_cost: str | None = None,
    actor_id: str,
    actor_username: str,
    notes: str | None = None,
) -> str:
    """Insert an inventory movement row. Every stock change must go through this."""
    doc = {
        "item_id": str(item_doc["_id"]),
        "business_unit_id": item_doc["business_unit_id"],
        "movement_type": movement_type.value,
        "quantity": quantity,
        "unit": item_doc["base_unit"],
        "unit_cost": unit_cost,
        "reference_type": reference_type,
        "reference_id": reference_id,
        "notes": notes,
        "created_by": actor_id,
        "created_by_username": actor_username,
        "created_at": datetime.now(UTC),
    }
    result = await db.inventory_movements.insert_one(doc, session=session)
    return str(result.inserted_id)
