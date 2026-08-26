from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import get_settings


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


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    await db.users.create_index("username", unique=True)
    await db.audit_logs.create_index([("created_at", -1)])
    await db.audit_logs.create_index("entity_type")
    # SKU unique only when present (nulls exempt via partial filter).
    await db.inventory_items.create_index(
        "sku",
        unique=True,
        partialFilterExpression={"sku": {"$type": "string"}},
    )
    await db.inventory_items.create_index([("business_unit_id", 1), ("name", 1)])
    await db.inventory_movements.create_index([("item_id", 1), ("created_at", -1)])
    await db.inventory_movements.create_index([("business_unit_id", 1), ("created_at", -1)])
    await db.purchases.create_index("idempotency_key", unique=True, sparse=True)
    await db.purchases.create_index([("business_unit_id", 1), ("purchased_at", -1)])
    await db.purchases.create_index("purchase_number")


def get_db(request_db_name: str | None = None) -> AsyncIOMotorDatabase:
    """Return a database handle.

    Used both as a FastAPI dependency (routers pass it into services)
    and directly by scripts/tests. ``request_db_name`` lets tests point
    at an isolated database without touching app state.
    """
    db_name = request_db_name or get_settings().mongo_db
    return get_mongo_client()[db_name]
