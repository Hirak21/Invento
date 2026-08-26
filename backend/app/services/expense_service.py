from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.models.expense import ExpenseCreate, expense_out_from_doc  # noqa: F401
from app.services.ledger import is_oid
from app.utils.errors import BusinessRuleError


async def _next_expense_number(db: Any, session: Any) -> str:
    today = datetime.now(UTC).strftime("%Y%m%d")
    counter = await db.counters.find_one_and_update(
        {"_id": f"expense_{today}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
        session=session,
    )
    return f"EXP-{today}-{counter['seq']:04d}"


def _parse_date(raw: str | None) -> datetime:
    if raw is None:
        return datetime.now(UTC)
    return datetime.strptime(raw, "%Y-%m-%d").replace(hour=12, minute=0, second=0, tzinfo=UTC)


async def create_expense(
    db: AsyncIOMotorDatabase,
    payload: ExpenseCreate,
    *,
    actor_id: str,
    actor_username: str,
) -> tuple[dict[str, Any], bool]:
    existing = await db.expenses.find_one({"idempotency_key": payload.idempotency_key})
    if existing is not None:
        return existing, True

    if not is_oid(payload.business_unit_id):
        raise BusinessRuleError("Business unit not found.")
    unit = await db.business_units.find_one({"_id": ObjectId(payload.business_unit_id)})
    if unit is None or not unit.get("active", True):
        raise BusinessRuleError("Business unit not found or inactive.")

    doc: dict[str, Any] = {
        "business_unit_id": payload.business_unit_id,
        "category": payload.category.value,
        "amount": payload.amount,
        "payment_method": payload.payment_method.value,
        "payment_status": payload.payment_status.value,
        "description": payload.description.strip(),
        "payee": (payload.payee.strip() or None) if payload.payee else None,
        "reference_number": payload.reference_number,
        "notes": payload.notes,
        "spent_at": _parse_date(payload.date),
        "created_by": actor_id,
        "created_by_username": actor_username,
        "created_at": datetime.now(UTC),
        "idempotency_key": payload.idempotency_key,
    }

    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                doc["expense_number"] = await _next_expense_number(db, session)
                result = await db.expenses.insert_one(doc, session=session)
    except DuplicateKeyError:
        existing = await db.expenses.find_one({"idempotency_key": payload.idempotency_key})
        if existing is None:
            raise BusinessRuleError("Duplicate submission detected.") from None
        return existing, True
    return {**doc, "_id": result.inserted_id}, False


def build_expense_query(
    *,
    business_unit_id: str | None = None,
    category: str | None = None,
    payment_method: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if business_unit_id and ObjectId.is_valid(business_unit_id):
        query["business_unit_id"] = business_unit_id
    if category:
        query["category"] = category
    if payment_method:
        query["payment_method"] = payment_method
    range_filter: dict[str, Any] = {}
    if date_from:
        range_filter["$gte"] = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=UTC)
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=UTC)
        range_filter["$lte"] = end.replace(hour=23, minute=59, second=59)
    if range_filter:
        query["spent_at"] = range_filter
    return query
