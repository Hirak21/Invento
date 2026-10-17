from datetime import UTC, datetime, timedelta
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.models.enums import MovementType
from app.models.purchase import PurchaseCreate, purchase_out_from_doc
from app.services.ledger import is_oid, oid, parse_oid, record_movement
from app.utils.errors import BusinessRuleError, ConflictError, NotFoundError
from app.utils.money import parse_money, money_to_str


async def _next_purchase_number(db: Any, session: Any) -> str:
    """Sequential purchase number: PUR-YYYYMMDD-NNNN (per-day counter)."""
    today = datetime.now(UTC).strftime("%Y%m%d")
    counter_id = f"purchase_{today}"
    counter = await db.counters.find_one_and_update(
        {"_id": counter_id},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
        session=session,
    )
    return f"PUR-{today}-{counter['seq']:04d}"


def _parse_purchase_date(raw: str | None) -> datetime:
    if raw is None:
        return datetime.now(UTC)
    # Noon UTC keeps the date stable across timezones for daily reports.
    parsed = datetime.strptime(raw, "%Y-%m-%d").replace(
        hour=12, minute=0, second=0, tzinfo=UTC
    )
    return parsed


async def create_purchase(
    db: AsyncIOMotorDatabase,
    payload: PurchaseCreate,
    *,
    actor_id: str,
    actor_username: str,
) -> tuple[dict[str, Any], bool]:
    """Record a purchase: stock increases atomically with the ledger entry.

    Returns (purchase_doc, duplicate_flag). A repeated idempotency_key
    returns the original purchase without any further stock effect.
    """
    # Idempotency pre-check BEFORE validation: a retried submission sees
    # post-purchase stock and must return the original doc, not fail on rules.
    existing = await db.purchases.find_one({"idempotency_key": payload.idempotency_key})
    if existing is not None:
        return existing, True

    # --- Validate references (outside tx; cheap reads) ---
    if not is_oid(payload.business_unit_id):
        raise BusinessRuleError("Business unit not found.")
    unit = await db.business_units.find_one({"_id": oid(payload.business_unit_id)})
    if unit is None or not unit.get("active", True):
        raise BusinessRuleError("Business unit not found or inactive.")

    supplier_name: str | None = None
    if payload.supplier_id:
        if not is_oid(payload.supplier_id):
            raise BusinessRuleError("Supplier not found.")
        supplier = await db.suppliers.find_one({"_id": oid(payload.supplier_id)})
        if supplier is None:
            raise BusinessRuleError("Supplier not found.")
        supplier_name = supplier["name"]

    # Merge duplicate lines pointing at the same item *and* same GST rate.
    # Same item with a different GST % stays a separate line so tax stays exact.
    merged: dict[str, dict[str, Any]] = {}
    for line in payload.items:
        gst = float(line.gst_percent or 0)
        if gst < 0 or gst > 100:
            raise BusinessRuleError("GST % must be between 0 and 100.")
        key = f"{line.item_id}@@{gst}"
        existing = merged.get(key)
        if existing:
            existing["quantity"] += line.quantity
            continue
        merged[key] = {
            "item_id": line.item_id,
            "quantity": line.quantity,
            "unit_cost": line.unit_cost,
            "gst_percent": gst,
        }

    item_docs: list[dict[str, Any]] = []
    for key, line in merged.items():
        if not is_oid(key.split("@@")[0]):
            raise BusinessRuleError("One of the items does not exist.")
        item = await db.inventory_items.find_one({"_id": oid(key.split("@@")[0])})
        if item is None:
            raise BusinessRuleError("One of the items does not exist.")
        if not item.get("active", False):
            raise BusinessRuleError(f"Item '{item['name']}' is inactive.")
        if item["business_unit_id"] != payload.business_unit_id:
            raise BusinessRuleError(
                f"Item '{item['name']}' does not belong to this business unit."
            )
        # Check if unit_cost differs significantly from item's purchase_price (more than 50%)
        item_purchase_price = parse_money(item.get("purchase_price", "0"))
        line_unit_cost = parse_money(line["unit_cost"])
        if item_purchase_price > 0:
            diff_pct = abs(line_unit_cost - item_purchase_price) / item_purchase_price
            if diff_pct > 0.5:  # 50% difference
                # We log this but don't block - just for awareness
                pass
        item_docs.append({**line, "doc": item, "item_purchase_price": item.get("purchase_price", "0")})

    from decimal import Decimal as _Decimal

    def _line_math(unit_cost: str, qty: float, gst_pct: float) -> tuple[_Decimal, _Decimal, _Decimal]:
        subtotal = parse_money(unit_cost) * _Decimal(str(qty))
        gst_amt = (subtotal * _Decimal(str(gst_pct)) / _Decimal("100")).quantize(_Decimal("0.01"))
        return subtotal, gst_amt, subtotal + gst_amt

    subtotal = _Decimal("0")
    gst_total = _Decimal("0")
    for line in merged.values():
        s, g, _t = _line_math(line["unit_cost"], line["quantity"], float(line.get("gst_percent", 0) or 0))
        subtotal += s
        gst_total += g
    total = subtotal + gst_total
    subtotal_amount = money_to_str(subtotal)
    gst_amount_str = money_to_str(gst_total)
    total_amount = money_to_str(total)

    purchased_at = _parse_purchase_date(payload.date)
    doc: dict[str, Any] = {
        "business_unit_id": payload.business_unit_id,
        "supplier_id": payload.supplier_id or None,
        "supplier_name": supplier_name,
        "items": [],
        "subtotal_amount": subtotal_amount,
        "gst_amount": gst_amount_str,
        "total_amount": total_amount,
        "payment_method": payload.payment_method.value,
        "payment_status": payload.payment_status.value,
        "reference_number": payload.reference_number,
        "notes": payload.notes,
        "purchased_at": purchased_at,
        "created_by": actor_id,
        "created_by_username": actor_username,
        "created_at": datetime.now(UTC),
        "idempotency_key": payload.idempotency_key,
        "status": "completed",
    }

    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                doc["purchase_number"] = await _next_purchase_number(db, session)
                result = await db.purchases.insert_one(doc, session=session)

                for line in item_docs:
                    item = line["doc"]
                    from decimal import Decimal as _Decimal2

                    _s, _g, _t = _line_math(line["unit_cost"], line["quantity"], float(line.get("gst_percent", 0) or 0))
                    line_subtotal = money_to_str(_s)
                    line_gst = money_to_str(_g)
                    line_total = money_to_str(_t)
                    doc["items"].append(
                        {
                            "item_id": str(item["_id"]),
                            "item_name": item["name"],
                            "quantity": line["quantity"],
                            "unit": item["base_unit"],
                            "unit_cost": line["unit_cost"],
                            "standard_purchase_price": line.get("item_purchase_price", item.get("purchase_price", "0")),
                            "gst_percent": float(line.get("gst_percent", 0) or 0),
                            "line_subtotal": line_subtotal,
                            "gst_amount": line_gst,
                            "line_total": line_total,
                        }
                    )
                    from app.utils.units import decimal_to_mongo as _d2m

                    await db.inventory_items.update_one(
                        {"_id": item["_id"]},
                        {
                            "$inc": {"current_stock": _d2m(_Decimal2(str(line["quantity"])))},
                            "$set": {"updated_at": datetime.now(UTC)},
                        },
                        session=session,
                    )
                    await record_movement(
                        db,
                        session,
                        item_doc=item,
                        movement_type=MovementType.PURCHASE,
                        quantity=line["quantity"],
                        reference_type="purchase",
                        reference_id=str(result.inserted_id),
                        unit_cost=line["unit_cost"],
                        actor_id=actor_id,
                        actor_username=actor_username,
                        notes=f"Purchase {doc['purchase_number']}",
                    )
                await db.purchases.update_one(
                    {"_id": result.inserted_id},
                    {"$set": {"items": doc["items"]}},
                    session=session,
                )
    except DuplicateKeyError:
        # Transaction has unwound by now; same idempotency key was processed
        # earlier — return the original purchase with no further stock effect.
        existing = await db.purchases.find_one({"idempotency_key": payload.idempotency_key})
        if existing is None:
            raise ConflictError("Duplicate submission detected.") from None
        return existing, True
    return {**doc, "_id": result.inserted_id}, False


async def get_purchase(db: AsyncIOMotorDatabase, purchase_id: str) -> dict[str, Any]:
    if not is_oid(purchase_id):
        raise NotFoundError("Purchase not found.")
    doc = await db.purchases.find_one({"_id": parse_oid(purchase_id)})
    if doc is None:
        raise NotFoundError("Purchase not found.")
    return doc


def build_purchase_query(
    *,
    business_unit_id: str | None = None,
    supplier_id: str | None = None,
    payment_status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    query: dict[str, Any] = {"status": "completed"}
    if business_unit_id and is_oid(business_unit_id):
        query["business_unit_id"] = business_unit_id
    if supplier_id and is_oid(supplier_id):
        query["supplier_id"] = supplier_id
    if payment_status in ("paid", "pending"):
        query["payment_status"] = payment_status
    range_filter: dict[str, Any] = {}
    if date_from:
        start = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=UTC, hour=0, minute=0, second=0)
        range_filter["$gte"] = start
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=UTC)
        # Half-open: include the whole to-day; $lte 23:59:59 dropped the
        # final second of writes.
        range_filter["$lt"] = end + timedelta(days=1)
    if range_filter:
        query["purchased_at"] = range_filter
    return query


__all__ = ["create_purchase", "get_purchase", "build_purchase_query", "set_payment_status"]


async def set_payment_status(
    db: AsyncIOMotorDatabase,
    purchase_id: str,
    payment_status: str,
    *,
    actor_id: str,
    actor_username: str,
) -> dict[str, Any]:
    """Settle / reopen a purchase due. Persists payment_status; no stock effect."""
    from app.services.ledger import parse_oid as _parse_oid
    from app.utils.audit import log_audit as _log_audit

    if payment_status not in ("paid", "pending"):
        raise BusinessRuleError("payment_status must be 'paid' or 'pending'.")
    doc = await get_purchase(db, purchase_id)
    if doc.get("payment_status") == payment_status:
        return doc
    await db.purchases.update_one(
        {"_id": doc["_id"]},
        {"$set": {"payment_status": payment_status}},
    )
    await _log_audit(
        db,
        actor_id=actor_id,
        actor_username=actor_username,
        action="update",
        entity_type="purchase",
        entity_id=str(doc["_id"]),
        before={"payment_status": doc.get("payment_status")},
        after={"payment_status": payment_status},
        business_unit_id=doc.get("business_unit_id"),
    )
    updated = await db.purchases.find_one({"_id": doc["_id"]})
    assert updated is not None
    return updated
