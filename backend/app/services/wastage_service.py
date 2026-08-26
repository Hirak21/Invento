from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.config import get_settings
from app.models.enums import MovementType
from app.models.wastage import (
    AdjustmentCreate,
    WastageCreate,
    adjustment_out_from_doc,  # noqa: F401
    wastage_out_from_doc,  # noqa: F401
)
from app.services.ledger import is_oid, oid, record_movement
from app.utils.errors import BusinessRuleError, ConflictError, ForbiddenError, NotFoundError
from app.utils.money import money_to_str, parse_money


def _parse_date(raw: str | None) -> datetime:
    if raw is None:
        return datetime.now(UTC)
    return datetime.strptime(raw, "%Y-%m-%d").replace(hour=12, minute=0, second=0, tzinfo=UTC)


async def _load_item(db: AsyncIOMotorDatabase, session: Any, item_id: str, business_unit_id: str) -> dict[str, Any]:
    if not is_oid(item_id):
        raise BusinessRuleError("Item not found.")
    item = await db.inventory_items.find_one({"_id": oid(item_id)}, session=session)
    if item is None:
        raise BusinessRuleError("Item not found.")
    if item["business_unit_id"] != business_unit_id:
        raise BusinessRuleError(f"Item '{item['name']}' does not belong to this business unit.")
    return item


async def create_wastage(
    db: AsyncIOMotorDatabase,
    payload: WastageCreate,
    *,
    actor_id: str,
    actor_username: str,
) -> tuple[dict[str, Any], bool]:
    existing = await db.wastage.find_one({"idempotency_key": payload.idempotency_key})
    if existing is not None:
        return existing, True

    doc: dict[str, Any] = {
        "business_unit_id": payload.business_unit_id,
        "item_id": payload.item_id,
        "quantity": payload.quantity,
        "reason": payload.reason.value,
        "notes": payload.notes,
        "wasted_at": _parse_date(payload.date),
        "created_by": actor_id,
        "created_by_username": actor_username,
        "created_at": datetime.now(UTC),
        "idempotency_key": payload.idempotency_key,
    }

    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                item = await _load_item(db, session, payload.item_id, payload.business_unit_id)
                available = int(item.get("current_stock", 0))
                if available < payload.quantity:
                    raise BusinessRuleError(
                        f"Insufficient stock for '{item['name']}': "
                        f"have {available} {item['base_unit']}, cannot waste {payload.quantity}."
                    )
                unit_cost = item.get("purchase_price")
                doc.update(
                    {
                        "item_name": item["name"],
                        "unit": item["base_unit"],
                        "unit_cost": unit_cost,
                        "estimated_value": money_to_str(
                            parse_money(unit_cost or "0.00") * payload.quantity
                        ),
                    }
                )
                result = await db.wastage.insert_one(doc, session=session)
                await db.inventory_items.update_one(
                    {"_id": item["_id"]},
                    {
                        "$inc": {"current_stock": -payload.quantity},
                        "$set": {"updated_at": datetime.now(UTC)},
                    },
                    session=session,
                )
                await record_movement(
                    db,
                    session,
                    item_doc=item,
                    movement_type=MovementType.WASTAGE,
                    quantity=payload.quantity,
                    reference_type="wastage",
                    reference_id=str(result.inserted_id),
                    unit_cost=unit_cost,
                    actor_id=actor_id,
                    actor_username=actor_username,
                    notes=payload.reason.value,
                )
    except DuplicateKeyError:
        existing = await db.wastage.find_one({"idempotency_key": payload.idempotency_key})
        if existing is None:
            raise ConflictError("Duplicate submission detected.") from None
        return existing, True
    return {**doc, "_id": result.inserted_id}, False


async def create_adjustment(
    db: AsyncIOMotorDatabase,
    payload: AdjustmentCreate,
    *,
    actor_role: str,
    actor_id: str,
    actor_username: str,
) -> tuple[dict[str, Any], bool]:
    # Idempotency pre-check must come BEFORE business validation: a retried
    # adjustment sees post-adjustment stock and would otherwise fail with
    # "nothing to adjust" instead of returning the original record.
    existing = await db.stock_adjustments.find_one(
        {"idempotency_key": payload.idempotency_key}
    )
    if existing is not None:
        return existing, True

    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                item = await _load_item(db, session, payload.item_id, payload.business_unit_id)
                previous = int(item.get("current_stock", 0))
                delta = payload.new_quantity - previous
                if delta == 0:
                    raise BusinessRuleError(
                        "New quantity equals current stock — nothing to adjust."
                    )

                # Visible policy: staff corrections capped; owner unlimited.
                if actor_role != "owner" and abs(delta) > get_settings().staff_adjustment_limit:
                    raise ForbiddenError(
                        f"Staff may only adjust up to {get_settings().staff_adjustment_limit} "
                        f"{item['base_unit']} per correction. Ask an owner for larger changes."
                    )

                doc: dict[str, Any] = {
                    "business_unit_id": payload.business_unit_id,
                    "item_id": str(item["_id"]),
                    "item_name": item["name"],
                    "previous_quantity": previous,
                    "new_quantity": payload.new_quantity,
                    "delta": delta,
                    "unit": item["base_unit"],
                    "reason": payload.reason.value,
                    "notes": payload.notes,
                    "adjusted_at": _parse_date(payload.date),
                    "created_by": actor_id,
                    "created_by_username": actor_username,
                    "created_at": datetime.now(UTC),
                    "idempotency_key": payload.idempotency_key,
                }
                result = await db.stock_adjustments.insert_one(doc, session=session)
                await db.inventory_items.update_one(
                    {"_id": item["_id"]},
                    {"$set": {"current_stock": payload.new_quantity, "updated_at": datetime.now(UTC)}},
                    session=session,
                )
                movement_type = MovementType.ADJUSTMENT_IN if delta > 0 else MovementType.ADJUSTMENT_OUT
                # Movement rows always carry a positive quantity.
                await record_movement(
                    db,
                    session,
                    item_doc=item,
                    movement_type=movement_type,
                    quantity=abs(delta),
                    reference_type="adjustment",
                    reference_id=str(result.inserted_id),
                    unit_cost=item.get("purchase_price"),
                    actor_id=actor_id,
                    actor_username=actor_username,
                    notes=payload.reason.value,
                )
    except DuplicateKeyError:
        existing = await db.stock_adjustments.find_one(
            {"idempotency_key": payload.idempotency_key}
        )
        if existing is None:
            raise ConflictError("Duplicate submission detected.") from None
        return existing, True
    return {**doc, "_id": result.inserted_id}, False


def build_wastage_query(
    *, business_unit_id: str | None = None, item_id: str | None = None,
    date_from: str | None = None, date_to: str | None = None,
) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if business_unit_id and is_oid(business_unit_id):
        query["business_unit_id"] = business_unit_id
    if item_id and is_oid(item_id):
        query["item_id"] = item_id
    range_filter: dict[str, Any] = {}
    if date_from:
        range_filter["$gte"] = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=UTC)
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=UTC)
        range_filter["$lte"] = end.replace(hour=23, minute=59, second=59)
    if range_filter:
        query["wasted_at"] = range_filter
    return query


def build_adjustment_query(
    *, business_unit_id: str | None = None, item_id: str | None = None,
    date_from: str | None = None, date_to: str | None = None,
) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if business_unit_id and is_oid(business_unit_id):
        query["business_unit_id"] = business_unit_id
    if item_id and is_oid(item_id):
        query["item_id"] = item_id
    range_filter: dict[str, Any] = {}
    if date_from:
        range_filter["$gte"] = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=UTC)
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=UTC)
        range_filter["$lte"] = end.replace(hour=23, minute=59, second=59)
    if range_filter:
        query["adjusted_at"] = range_filter
    return query
