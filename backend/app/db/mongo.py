import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import get_settings

log = logging.getLogger("invento")


class MongoState:
    client: AsyncIOMotorClient | None = None


_state = MongoState()


def get_mongo_client() -> AsyncIOMotorClient:
    if _state.client is None:
        _state.client = AsyncIOMotorClient(get_settings().mongo_uri)
    return _state.client


def reset_mongo_client() -> None:
    if _state.client is not None:
        _state.client.close()
    _state.client = None


async def _create_index(collection, keys, **kwargs) -> None:
    """Idempotent index creation that never breaks startup on legacy data.

    If an index cannot be built (e.g. pre-existing duplicate values violate a
    new uniqueness rule), we log a loud warning and continue: the API-level
    pre-checks still return friendly 409s, and a migration can enforce the
    rule once the data is cleaned. A missing performance index must never
    take the whole API down.
    """
    try:
        await collection.create_index(keys, **kwargs)
    except Exception as exc:  # noqa: BLE001 - startup must survive legacy data
        log.warning("Skipping index %r on %s: %s", kwargs.get("name", keys), collection.name, exc)


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Deployment note: this app requires a replica set (local single-node
    ``rs0`` for dev, per AGENTS.md) because sales/purchases/wastage use
    multi-document transactions. Idempotency keys + unique sparse indexes are
    a second layer: a retried POST with the same key returns the original
    document instead of double-applying stock effects — so even if a
    transaction were ever unavailable, duplicates are still impossible.
    """
    await _create_index(db.users, "username", unique=True, name="users_username_unique")
    await _create_index(db.audit_logs, [("created_at", -1)], name="audit_created")
    await _create_index(db.audit_logs, "entity_type", name="audit_entity")
    # SKU unique only when present (nulls exempt via partial filter).
    await _create_index(
        db.inventory_items,
        "sku",
        unique=True,
        partialFilterExpression={"sku": {"$type": "string"}},
        name="items_sku_unique",
    )
    await _create_index(
        db.inventory_items, [("business_unit_id", 1), ("name", 1)], name="items_bu_name"
    )
    await _create_index(
        db.inventory_movements, [("item_id", 1), ("created_at", -1)], name="mov_item_time"
    )
    await _create_index(
        db.inventory_movements,
        [("business_unit_id", 1), ("created_at", -1)],
        name="mov_bu_time",
    )
    await _create_index(
        db.purchases, "idempotency_key", unique=True, sparse=True, name="purch_idem_unique"
    )
    await _create_index(
        db.purchases, [("business_unit_id", 1), ("purchased_at", -1)], name="purch_bu_time"
    )
    await _create_index(db.purchases, "purchase_number", name="purch_number")
    # Recipes: name unique per business unit (exact match; the service also
    # does a case-insensitive pre-check for a friendly 409 message).
    await _create_index(
        db.recipes,
        [("business_unit_id", 1), ("name", 1)],
        unique=True,
        name="recipes_bu_name_unique",
    )
    await _create_index(db.recipes, "name", name="recipes_name")
    # One line per stock item per recipe (duplicate lines rejected with 409).
    await _create_index(
        db.recipe_ingredients,
        [("recipe_id", 1), ("item_id", 1)],
        unique=True,
        name="recipe_ing_unique",
    )
    await _create_index(db.recipe_ingredients, "recipe_id", name="recipe_ing_recipe")
    await _create_index(
        db.sales, "idempotency_key", unique=True, sparse=True, name="sales_idem_unique"
    )
    await _create_index(
        db.sales, [("business_unit_id", 1), ("sold_at", -1)], name="sales_bu_time"
    )
    await _create_index(db.sales, "sale_number", name="sales_number")
    await _create_index(db.wastage, "idempotency_key", unique=True, sparse=True, name="wast_idem_unique")
    await _create_index(
        db.wastage, [("business_unit_id", 1), ("wasted_at", -1)], name="wast_bu_time"
    )
    await _create_index(
        db.stock_adjustments, "idempotency_key", unique=True, sparse=True, name="adj_idem_unique"
    )
    await _create_index(
        db.stock_adjustments,
        [("business_unit_id", 1), ("adjusted_at", -1)],
        name="adj_bu_time",
    )
    await _create_index(
        db.expenses, "idempotency_key", unique=True, sparse=True, name="exp_idem_unique"
    )
    await _create_index(
        db.expenses, [("business_unit_id", 1), ("spent_at", -1)], name="exp_bu_time"
    )
    # Rooms are property-level: a room number is unique across the property
    # (not just its original business unit) so it reads the same from the
    # Restaurant and the Shop. The legacy per-unit index is kept for
    # backwards compatibility; the property-wide rule is enforced by the
    # service pre-check (409) plus this index when the data allows it.
    await _create_index(
        db.rooms,
        [("business_unit_id", 1), ("room_number", 1)],
        unique=True,
        partialFilterExpression={"active": True},
        name="rooms_bu_number_unique",
    )
    await _create_index(
        db.rooms,
        "room_number",
        unique=True,
        partialFilterExpression={"active": True},
        name="rooms_number_property_unique",
    )
    await _create_index(
        db.rooms, [("status", 1)], name="rooms_status"
    )
    await _create_index(
        db.stays,
        [("room_id", 1), ("status", 1)],
        unique=True,
        partialFilterExpression={"status": "open"},
        name="stays_one_open_per_room",
    )
    await _create_index(
        db.stays, [("business_unit_id", 1), ("checked_in_at", -1)], name="stays_bu_time"
    )
    await _create_index(db.stays, [("status", 1), ("checked_in_at", -1)], name="stays_status_time")
    await _create_index(db.sales, "stay_id", sparse=True, name="sales_stay")
    await _create_index(
        db.sales, [("stay_id", 1), ("sold_at", 1)], sparse=True, name="sales_stay_time"
    )
    # Business settings: singleton global doc (_id "global") + one per unit.
    await _create_index(
        db.business_settings, [("business_unit_id", 1)], name="bset_bu"
    )


def get_db(request_db_name: str | None = None) -> AsyncIOMotorDatabase:
    """Return a database handle.

    Used both as a FastAPI dependency (routers pass it into services)
    and directly by scripts/tests. ``request_db_name`` lets tests point
    at an isolated database without touching app state.
    """
    db_name = request_db_name or get_settings().mongo_db
    return get_mongo_client()[db_name]
