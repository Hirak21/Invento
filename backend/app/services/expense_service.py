from datetime import UTC, datetime, timedelta
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.models.expense import (
    BUILT_IN_EXPENSE_CATEGORIES,
    ExpenseCreate,
    expense_out_from_doc,  # noqa: F401
    normalize_expense_category,
)
from app.services.ledger import is_oid
from app.utils.errors import BusinessRuleError, ConflictError, NotFoundError


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


async def resolve_expense_category(db: AsyncIOMotorDatabase, raw: str) -> str:
    """Validate a category slug: built-in or an active custom category."""
    slug = normalize_expense_category(raw)
    if not slug:
        raise BusinessRuleError("Expense category is required.")
    if slug in BUILT_IN_EXPENSE_CATEGORIES:
        return slug
    custom = await db.expense_categories.find_one({"slug": slug, "active": True})
    if custom is None:
        raise BusinessRuleError(f"Unknown expense category '{raw}'.")
    return slug


async def list_expense_categories(db: AsyncIOMotorDatabase) -> list[dict[str, Any]]:
    """Built-ins (with Staff Salary) + active custom categories, seeded lazily."""
    from app.models.expense import EXPENSE_CATEGORY_LABELS, ExpenseCategory
    from app.models.user import utc_now

    existing = await db.expense_categories.find({}).to_list(None)
    if not existing:
        seeds = [
            {"slug": c.value, "name": EXPENSE_CATEGORY_LABELS[c], "built_in": True, "active": True, "created_at": utc_now()}
            for c in ExpenseCategory
        ]
        if seeds:
            await db.expense_categories.insert_many(seeds)
            existing = await db.expense_categories.find({}).to_list(None)
    else:
        # Self-heal: ensure Staff Salary exists for older deployments.
        slugs = {d.get("slug") for d in existing}
        if "staff_salary" not in slugs:
            await db.expense_categories.insert_one(
                {"slug": "staff_salary", "name": "Staff Salary", "built_in": True, "active": True, "created_at": utc_now()}
            )
            existing = await db.expense_categories.find({}).to_list(None)
    # Merge any built-ins missing from the collection (forward-compat).
    known = {d.get("slug") for d in existing}
    missing = [
        {"slug": c.value, "name": EXPENSE_CATEGORY_LABELS[c], "built_in": True, "active": True, "created_at": utc_now()}
        for c in ExpenseCategory
        if c.value not in known
    ]
    if missing:
        await db.expense_categories.insert_many(missing)
        existing = await db.expense_categories.find({}).to_list(None)
    existing.sort(key=lambda d: (not d.get("built_in", False), str(d.get("name", ""))))
    return [
        {
            "slug": d["slug"],
            "name": d.get("name") or str(d["slug"]).replace("_", " ").title(),
            "built_in": bool(d.get("built_in", False)),
            "active": bool(d.get("active", True)),
        }
        for d in existing
        if d.get("active", True)
    ]


async def create_expense_category(db: AsyncIOMotorDatabase, name: str) -> dict[str, Any]:
    from app.models.user import utc_now

    slug = normalize_expense_category(name)
    if not slug:
        raise BusinessRuleError("Category name is required.")
    if slug in BUILT_IN_EXPENSE_CATEGORIES:
        raise ConflictError(f"Category '{name.strip()}' already exists.")
    dupe = await db.expense_categories.find_one({"slug": slug})
    if dupe is not None:
        raise ConflictError(f"Category '{name.strip()}' already exists.")
    doc = {"slug": slug, "name": name.strip()[:60], "built_in": False, "active": True, "created_at": utc_now()}
    await db.expense_categories.insert_one(doc)
    return {"slug": slug, "name": doc["name"], "built_in": False, "active": True}


async def update_expense_category(db: AsyncIOMotorDatabase, slug: str, name: str) -> dict[str, Any]:
    slug = normalize_expense_category(slug)
    doc = await db.expense_categories.find_one({"slug": slug})
    if doc is None:
        raise NotFoundError("Expense category not found.")
    clean = name.strip()
    if not clean:
        raise BusinessRuleError("Category name is required.")
    await db.expense_categories.update_one({"slug": slug}, {"$set": {"name": clean[:60]}})
    updated = await db.expense_categories.find_one({"slug": slug})
    assert updated is not None
    return {"slug": slug, "name": updated["name"], "built_in": bool(updated.get("built_in", False)), "active": bool(updated.get("active", True))}


async def delete_expense_category(db: AsyncIOMotorDatabase, slug: str) -> None:
    """Deactivate custom categories; never hard-delete when records reference them.

    Built-ins are never deletable. A custom category with existing expense
    records is deactivated (kept for history) instead of removed.
    """
    slug = normalize_expense_category(slug)
    if slug in BUILT_IN_EXPENSE_CATEGORIES:
        raise BusinessRuleError("Built-in categories cannot be deleted.")
    doc = await db.expense_categories.find_one({"slug": slug})
    if doc is None:
        raise NotFoundError("Expense category not found.")
    in_use = await db.expenses.count_documents({"category": slug})
    if in_use > 0:
        # Soft-delete: keeps historical records intact and readable.
        await db.expense_categories.update_one({"slug": slug}, {"$set": {"active": False}})
        return
    await db.expense_categories.delete_one({"slug": slug})


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

    category = await resolve_expense_category(db, payload.category)

    doc: dict[str, Any] = {
        "business_unit_id": payload.business_unit_id,
        "category": category,
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
    payment_status: str | None = None,
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
    if payment_status in ("paid", "pending"):
        query["payment_status"] = payment_status
    range_filter: dict[str, Any] = {}
    if date_from:
        range_filter["$gte"] = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=UTC)
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=UTC)
        # Half-open: whole to-day included (no 23:59:59 second-loss).
        range_filter["$lt"] = end + timedelta(days=1)
    if range_filter:
        query["spent_at"] = range_filter
    return query


async def get_expense(db: AsyncIOMotorDatabase, expense_id: str) -> dict[str, Any]:
    if not ObjectId.is_valid(expense_id):
        raise NotFoundError("Expense not found.")
    doc = await db.expenses.find_one({"_id": ObjectId(expense_id)})
    if doc is None:
        raise NotFoundError("Expense not found.")
    return doc


async def set_expense_payment_status(
    db: AsyncIOMotorDatabase,
    expense_id: str,
    payment_status: str,
    *,
    actor_id: str,
    actor_username: str,
) -> dict[str, Any]:
    """Settle / reopen an expense due. Persists payment_status; no other effect."""
    from app.utils.audit import log_audit as _log_audit

    if payment_status not in ("paid", "pending"):
        raise BusinessRuleError("payment_status must be 'paid' or 'pending'.")
    doc = await get_expense(db, expense_id)
    if doc.get("payment_status", "paid") == payment_status:
        return doc
    await db.expenses.update_one(
        {"_id": doc["_id"]},
        {"$set": {"payment_status": payment_status}},
    )
    await _log_audit(
        db,
        actor_id=actor_id,
        actor_username=actor_username,
        action="update",
        entity_type="expense",
        entity_id=str(doc["_id"]),
        before={"payment_status": doc.get("payment_status", "paid")},
        after={"payment_status": payment_status},
        business_unit_id=doc.get("business_unit_id"),
    )
    updated = await db.expenses.find_one({"_id": doc["_id"]})
    assert updated is not None
    return updated
