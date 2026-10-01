from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.models.sale import SaleCreate, SalePaymentMethod, sale_out_from_doc
from app.models.enums import MovementType
from app.services.ledger import is_oid, oid, record_movement
from app.services.recipe_service import get_recipe as get_recipe_full
from app.utils.audit import log_audit
from app.utils.errors import BusinessRuleError, ConflictError, NotFoundError
from app.utils.money import money_to_str, parse_money
from app.utils.units import decimal_to_mongo, to_decimal_number


async def _next_sale_number(db: Any, session: Any) -> str:
    today = datetime.now(UTC).strftime("%Y%m%d")
    counter = await db.counters.find_one_and_update(
        {"_id": f"sale_{today}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
        session=session,
    )
    return f"SAL-{today}-{counter['seq']:04d}"


def _parse_sale_date(raw: str | None) -> datetime:
    if raw is None:
        return datetime.now(UTC)
    return datetime.strptime(raw, "%Y-%m-%d").replace(hour=12, minute=0, second=0, tzinfo=UTC)


async def create_sale(
    db: AsyncIOMotorDatabase,
    payload: SaleCreate,
    *,
    actor_id: str,
    actor_username: str,
) -> tuple[dict[str, Any], bool]:
    """Complete a sale: stock decreases exactly once, atomically with the ledger.

    Rejects the whole sale when any line would push stock negative — no partial
    effects ever persist.

    Lines whose ``item_id`` references a recipe are expanded as a BOM
    (bill-of-materials): every ingredient is deducted by
    ``ingredient.quantity * line.quantity`` inside the same transaction, and the
    recipe itself becomes the billable line (name/price snapshotted on the sale
    so later menu edits never change past bills). Non-recipe lines sell
    inventory items directly. Mixing both kinds in one sale is supported.
    """
    if not is_oid(payload.business_unit_id):
        raise BusinessRuleError("Business unit not found.")
    unit = await db.business_units.find_one({"_id": oid(payload.business_unit_id)})
    if unit is None or not unit.get("active", True):
        raise BusinessRuleError("Business unit not found or inactive.")

    # Charge-to-room: validate the stay BEFORE the transaction, then enforce
    # it is still open INSIDE the transaction (guest may check out between the
    # two). Charges attach to the sale once - no duplicate billing records.
    stay_doc: dict[str, Any] | None = None
    if payload.payment_method == "room_charge":
        if not payload.stay_id or not is_oid(payload.stay_id):
            raise BusinessRuleError("An open stay is required to charge to a room.")
        stay_doc = await db.stays.find_one({"_id": oid(payload.stay_id)})
        if stay_doc is None or stay_doc.get("status") != "open":
            raise BusinessRuleError("This stay is not open. The guest may have checked out.")
        if stay_doc["business_unit_id"] != payload.business_unit_id:
            raise BusinessRuleError("The stay does not belong to this business unit.")
    elif payload.stay_id is not None:
        raise BusinessRuleError("stay_id can only be used with the room_charge payment method.")

    # Backwards-compatible single-recipe payload (recipe_id field).
    if payload.recipe_id is not None:
        if not is_oid(payload.recipe_id):
            raise BusinessRuleError("Recipe not found.")
        recipe_doc = await db.recipes.find_one({"_id": oid(payload.recipe_id)})
        if recipe_doc is None:
            raise BusinessRuleError("Recipe not found.")
        if recipe_doc["business_unit_id"] != payload.business_unit_id:
            raise BusinessRuleError(
                "The recipe does not belong to the sale's business unit."
            )
        if len(payload.items) != 1:
            raise BusinessRuleError(
                "When recipe_id is given, the sale must contain exactly that recipe line."
            )
        if payload.items[0].item_id != payload.recipe_id:
            raise BusinessRuleError(
                "The sale line must reference the given recipe_id."
            )

    # Resolve recipe demand BEFORE opening the transaction: merge duplicate
    # lines per item so stock checks see total demand. Demand from recipes is
    # scaled by the sale quantity of the recipe line (BOM explosion).
    # Ingredient demand is Decimal in each item's BASE unit (unit conversion:
    # e.g. 500 g of a kg-based item becomes 0.500 kg) — never floats.
    # Two dicts per item id: sale demand (billable) and ingredient demand
    # (stock-only, non-billable).
    sale_demand: dict[str, dict[str, Any]] = {}
    ingredient_demand: dict[str, Decimal] = {}

    candidate_ids = {line.item_id for line in payload.items}
    valid_candidates = [cid for cid in candidate_ids if is_oid(cid)]
    recipes_by_id: dict[str, dict[str, Any]] = {}
    if valid_candidates:
        recipe_docs = await db.recipes.find(
            {"_id": {"$in": [oid(cid) for cid in valid_candidates]}}
        ).to_list(len(valid_candidates))
        for recipe_doc in recipe_docs:
            if recipe_doc["business_unit_id"] != payload.business_unit_id:
                raise BusinessRuleError(
                    f"The recipe '{recipe_doc['name']}' does not belong to the sale's business unit."
                )
            if not recipe_doc.get("active", True):
                raise BusinessRuleError(f"The recipe '{recipe_doc['name']}' is inactive.")
            recipes_by_id[str(recipe_doc["_id"])] = recipe_doc

    recipe_refs: dict[str, dict[str, Any]] = {}
    for line in payload.items:
        if line.item_id in recipes_by_id:
            existing = recipe_refs.get(line.item_id)
            if existing:
                existing["quantity"] += line.quantity
            else:
                recipe_refs[line.item_id] = {
                    "item_id": line.item_id,
                    "quantity": line.quantity,
                    "unit_price": line.unit_price,
                }
        else:
            existing = sale_demand.get(line.item_id)
            if existing:
                existing["quantity"] += line.quantity
            else:
                sale_demand[line.item_id] = {
                    "item_id": line.item_id,
                    "quantity": line.quantity,
                    "unit_price": line.unit_price,
                }

    # BOM explosion: accumulate ingredient demand per recipe line quantity.
    # get_recipe_full returns pydantic models (RecipeIngredientOut), not dicts.
    # ing.quantity is the CANONICAL base-unit quantity (Decimal-safe).
    for rid, ref in recipe_refs.items():
        recipe_full_data: dict[str, Any] = await get_recipe_full(db, rid)
        for ing in recipe_full_data["ingredients"]:
            ing_key = str(ing.item_id)
            per_portion = to_decimal_number(ing.quantity)
            ingredient_demand[ing_key] = (
                ingredient_demand.get(ing_key, Decimal("0"))
                + per_portion * ref["quantity"]
            )

    # Items that are BOTH sold directly and consumed as ingredients get their
    # demands combined for the stock guard.
    total_demand: dict[str, Decimal] = {
        key: Decimal(entry["quantity"]) for key, entry in sale_demand.items()
    }
    for ing_key, qty in ingredient_demand.items():
        total_demand[ing_key] = total_demand.get(ing_key, Decimal("0")) + qty

    subtotal = Decimal("0.00")
    for rid, ref in recipe_refs.items():
        recipe = recipes_by_id[rid]
        subtotal += parse_money(ref["unit_price"]) * ref["quantity"]
        # Keep the recipe name for the billable line snapshot.
        ref["_recipe_name"] = recipe["name"]
    for entry in sale_demand.values():
        subtotal += parse_money(entry["unit_price"]) * entry["quantity"]

    discount = parse_money(payload.discount) if payload.discount else parse_money("0.00")
    if discount > subtotal:
        raise BusinessRuleError("Discount cannot exceed the sale subtotal.")
    total_amount = money_to_str(subtotal - discount)

    sold_at = _parse_sale_date(payload.date)

    primary_recipe_id: str | None = payload.recipe_id
    if primary_recipe_id is None and len(recipe_refs) == 1:
        primary_recipe_id = next(iter(recipe_refs))
    primary_recipe_name: str | None = None
    if primary_recipe_id is not None:
        primary_recipe_name = recipes_by_id[primary_recipe_id]["name"]

    doc: dict[str, Any] = {
        "business_unit_id": payload.business_unit_id,
        "items": [],
        "subtotal": money_to_str(subtotal),
        "discount": money_to_str(discount),
        "total_amount": total_amount,
        "payment_method": payload.payment_method.value,
        "reference_number": payload.reference_number,
        "notes": payload.notes,
        "sold_at": sold_at,
        "stay_id": str(stay_doc["_id"]) if stay_doc is not None else None,
        "room_number": stay_doc.get("room_number") if stay_doc is not None else None,
        "charge_settled": False if stay_doc is not None else None,
        "created_by": actor_id,
        "created_by_username": actor_username,
        "created_at": datetime.now(UTC),
        "idempotency_key": payload.idempotency_key,
        "status": "completed",
        # Room charges are open orders until delivered to the room (board);
        # paid counter sales are complete at the till.
        "order_status": "PENDING" if payload.payment_method == SalePaymentMethod.ROOM_CHARGE else "SERVED",
        "status_history": [],
        "recipe_id": primary_recipe_id,
        "recipe_name": primary_recipe_name,
        # Exact BOM consumption snapshot (canonical base-unit quantities as
        # strings) so a later cancellation restores precisely what was
        # deducted, even if the recipe is edited in between.
        "ingredient_consumption": [],
    }

    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                if stay_doc is not None:
                    fresh = await db.stays.find_one(
                        {"_id": stay_doc["_id"]}, session=session
                    )
                    if fresh is None or fresh.get("status") != "open":
                        raise BusinessRuleError(
                            "This stay is not open. The guest may have checked out."
                        )

                # Stock guard + item validation INSIDE the transaction so
                # concurrent sales cannot both pass against stale balances.
                # 1) Billable inventory lines (direct sale demand).
                for key, line in sale_demand.items():
                    if not is_oid(key):
                        raise BusinessRuleError("One of the items does not exist.")
                    item = await db.inventory_items.find_one(
                        {"_id": oid(key)}, session=session
                    )
                    if item is None:
                        raise BusinessRuleError("One of the items does not exist.")
                    if not item.get("active", False):
                        raise BusinessRuleError(f"Item '{item['name']}' is inactive.")
                    if item["business_unit_id"] != payload.business_unit_id:
                        raise BusinessRuleError(
                            f"Item '{item['name']}' does not belong to this business unit."
                        )
                    available = int(item.get("current_stock", 0))
                    if available < line["quantity"]:
                        raise BusinessRuleError(
                            f"Insufficient stock for '{item['name']}': "
                            f"have {available} {item['base_unit']}, need {line['quantity']}."
                        )
                    line_total = parse_money(line["unit_price"]) * line["quantity"]
                    doc["items"].append(
                        {
                            "item_id": str(item["_id"]),
                            "item_name": item["name"],
                            "quantity": line["quantity"],
                            "unit": item["base_unit"],
                            "unit_price": line["unit_price"],
                            "unit_cost": item.get("purchase_price"),
                            "line_total": money_to_str(line_total),
                            "recipe_line": False,
                            "is_recipe": False,
                        }
                    )

                # 2) Billable recipe lines (menu items). Item name/price are
                # snapshotted so later menu edits never change past bills.
                for rid, ref in recipe_refs.items():
                    recipe = recipes_by_id[rid]
                    line_total = parse_money(ref["unit_price"]) * ref["quantity"]
                    doc["items"].append(
                        {
                            "item_id": rid,
                            "item_name": recipe["name"],
                            "quantity": ref["quantity"],
                            "unit": "pcs",
                            "unit_price": ref["unit_price"],
                            "unit_cost": None,
                            "line_total": money_to_str(line_total),
                            "recipe_line": False,
                            "is_recipe": True,
                        }
                    )

                # 3) Stock guard for TOTAL demand (sale + ingredients) so an
                # item both sold directly and consumed as an ingredient cannot
                # pass each check separately and oversell combined.
                # Decimal-safe: fractional canonical quantities (e.g. 0.500 kg
                # converted from 500 g) compare exactly; no float drift.
                for ing_key, needed in total_demand.items():
                    if not is_oid(ing_key):
                        raise BusinessRuleError("One of the items does not exist.")
                    item = await db.inventory_items.find_one(
                        {"_id": oid(ing_key)}, session=session
                    )
                    if item is None:
                        raise BusinessRuleError("One of the items does not exist.")
                    if not item.get("active", False):
                        raise BusinessRuleError(f"Item '{item['name']}' is inactive.")
                    if item["business_unit_id"] != payload.business_unit_id:
                        raise BusinessRuleError(
                            f"Item '{item['name']}' does not belong to this business unit."
                        )
                    available = to_decimal_number(item.get("current_stock", 0))
                    if available < needed:
                        raise BusinessRuleError(
                            f"Insufficient stock for '{item['name']}': "
                            f"have {available} {item['base_unit']}, need {needed}."
                        )
                    # Snapshot the BOM-only portion (direct sale lines restore
                    # via their own path) for exact cancel-restore later.
                    if ing_key in ingredient_demand:
                        doc["ingredient_consumption"].append({
                            "item_id": ing_key,
                            "quantity": str(
                                ingredient_demand[ing_key].quantize(Decimal("0.001"))
                            ),
                            "unit": item["base_unit"],
                        })

                doc["sale_number"] = await _next_sale_number(db, session)
                initial_status = doc["order_status"]
                if initial_status == "PENDING":
                    doc["status_history"] = [
                        {"status": "PENDING", "at": sold_at, "by": actor_id, "by_username": actor_username}
                    ]
                result = await db.sales.insert_one(doc, session=session)

                # 4) Deduct direct sale demand and record one movement per line.
                for line in doc["items"]:
                    if line.get("is_recipe"):
                        continue  # ingredients carry the stock effect for recipes
                    await db.inventory_items.update_one(
                        {"_id": oid(line["item_id"])},
                        {
                            "$inc": {"current_stock": -line["quantity"]},
                            "$set": {"updated_at": datetime.now(UTC)},
                        },
                        session=session,
                    )
                    item_for_movement = {
                        "_id": oid(line["item_id"]),
                        "business_unit_id": payload.business_unit_id,
                        "base_unit": line["unit"],
                    }
                    await record_movement(
                        db,
                        session,
                        item_doc=item_for_movement,
                        movement_type=MovementType.SALE,
                        quantity=line["quantity"],
                        reference_type="sale",
                        reference_id=str(result.inserted_id),
                        unit_cost=line.get("unit_cost"),
                        actor_id=actor_id,
                        actor_username=actor_username,
                        notes=f"Sale {doc['sale_number']}",
                    )

                # 5) Deduct BOM ingredient demand (recipe sales) with movements.
                # Exact-decimal $inc (Decimal128, never float) in base units.
                for ing_key, needed in ingredient_demand.items():
                    ing_item = await db.inventory_items.find_one(
                        {"_id": oid(ing_key)}, session=session
                    )
                    if ing_item is None:  # re-validated above; belt and braces
                        raise BusinessRuleError("One of the items does not exist.")
                    dec = -needed.quantize(Decimal("0.001"))
                    await db.inventory_items.update_one(
                        {"_id": oid(ing_key)},
                        {
                            "$inc": {"current_stock": decimal_to_mongo(dec)},
                            "$set": {"updated_at": datetime.now(UTC)},
                        },
                        session=session,
                    )
                    await record_movement(
                        db,
                        session,
                        item_doc=ing_item,
                        movement_type=MovementType.SALE,
                        quantity=needed,
                        reference_type="sale",
                        reference_id=str(result.inserted_id),
                        unit_cost=ing_item.get("purchase_price"),
                        actor_id=actor_id,
                        actor_username=actor_username,
                        notes=(
                            f"Sale {doc['sale_number']} (recipe: {doc['recipe_name']})"
                            if doc.get("recipe_name")
                            else f"Sale {doc['sale_number']}"
                        ),
                    )
    except DuplicateKeyError:
        existing = await db.sales.find_one({"idempotency_key": payload.idempotency_key})
        if existing is None:
            raise ConflictError("Duplicate submission detected.") from None
        return existing, True
    return {**doc, "_id": result.inserted_id}, False


async def get_sale(db: AsyncIOMotorDatabase, sale_id: str) -> dict[str, Any]:
    if not is_oid(sale_id):
        raise NotFoundError("Sale not found.")
    doc = await db.sales.find_one({"_id": oid(sale_id)})
    if doc is None:
        raise NotFoundError("Sale not found.")
    return sale_out_from_doc(doc)


ORDER_STATUS_FLOW: dict[str, str | None] = {
    "PENDING": "PREPARING",
    "PREPARING": "READY",
    "READY": "SERVED",
    "SERVED": None,
    "CANCELLED": None,
}


def _serialize_status_history(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "status": e.get("status", ""),
            "at": e.get("at"),
            "by_username": e.get("by_username", ""),
        }
        for e in entries
    ]


async def update_sale_status(
    db: AsyncIOMotorDatabase,
    sale_id: str,
    new_status: str,
    *,
    actor_id: str,
    actor_username: str,
    actor_role: str,
) -> dict[str, Any]:
    """Advance a sale through the order lifecycle.

    PENDING -> PREPARING -> READY -> SERVED. CANCELLED is allowed from any
    pre-SERVED status by owner or staff and restores stock exactly once via
    ADJUSTMENT_IN movements (operation records are never deleted).
    """
    from app.models.enums import MovementType

    if not is_oid(sale_id):
        raise NotFoundError("Sale not found.")
    sale = await db.sales.find_one({"_id": oid(sale_id)})
    if sale is None:
        raise NotFoundError("Sale not found.")

    current = sale.get("order_status", "PENDING")
    if current == "CANCELLED":
        raise BusinessRuleError("This order was cancelled.")
    if current == "SERVED":
        raise BusinessRuleError("This order is already served.")
    if new_status not in ("PREPARING", "READY", "SERVED", "CANCELLED"):
        raise BusinessRuleError("Invalid order status.")
    if new_status != "CANCELLED":
        expected = ORDER_STATUS_FLOW.get(current)
        if expected != new_status:
            raise BusinessRuleError(
                f"Invalid status change: {current} can only move to {expected or 'nothing'}."
            )
    if current == "PENDING" and new_status == "SERVED":
        raise BusinessRuleError("Invalid status change: PENDING cannot jump to SERVED.")

    now = datetime.now(UTC)
    history = list(sale.get("status_history") or [])
    history.append({"status": new_status, "at": now, "by": actor_id, "by_username": actor_username})

    updates: dict[str, Any] = {
        "order_status": new_status,
        "status_history": history,
        "updated_at": now,
    }

    if new_status == "CANCELLED":
        if sale.get("stay_id") and sale.get("payment_method") == "room_charge":
            if sale.get("charge_settled", False):
                raise BusinessRuleError(
                    "This charge is already settled on a room bill and cannot be cancelled."
                )
        updates["cancelled_at"] = now
        updates["cancelled_by"] = actor_id
        updates["cancelled_by_username"] = actor_username

    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                result = await db.sales.find_one_and_update(
                    {"_id": sale["_id"], "order_status": current},
                    {"$set": updates},
                    return_document=ReturnDocument.AFTER,
                    session=session,
                )
                if result is None:
                    raise BusinessRuleError("Order status changed concurrently. Retry.")

                if new_status == "CANCELLED":
                    # Restore stock exactly once for every non-recipe line.
                    for line in result.get("items", []):
                        if line.get("is_recipe"):
                            continue
                        item = await db.inventory_items.find_one(
                            {"_id": oid(line["item_id"])}, session=session
                        )
                        if item is None:
                            continue
                        await db.inventory_items.update_one(
                            {"_id": item["_id"]},
                            {
                                "$inc": {"current_stock": int(line["quantity"])},
                                "$set": {"updated_at": now},
                            },
                            session=session,
                        )
                        await record_movement(
                            db,
                            session,
                            item_doc=item,
                            movement_type=MovementType.ADJUSTMENT_IN,
                            quantity=int(line["quantity"]),
                            reference_type="sale_cancel",
                            reference_id=str(result["_id"]),
                            unit_cost=item.get("purchase_price"),
                            actor_id=actor_id,
                            actor_username=actor_username,
                            notes=f"Cancelled order {result.get('sale_number', '')}",
                        )
                    # Restore BOM consumption from the sale-time snapshot so a
                    # cancelled recipe order returns exactly what was deducted,
                    # even if the recipe was edited afterwards. Pre-conversion
                    # sales have no snapshot — their ingredients stay consumed
                    # (documented limitation, never silently rewritten).
                    for consumed in result.get("ingredient_consumption", []):
                        qty = to_decimal_number(consumed["quantity"])
                        item = await db.inventory_items.find_one(
                            {"_id": oid(consumed["item_id"])}, session=session
                        )
                        if item is None:
                            continue
                        await db.inventory_items.update_one(
                            {"_id": item["_id"]},
                            {
                                "$inc": {"current_stock": decimal_to_mongo(qty)},
                                "$set": {"updated_at": now},
                            },
                            session=session,
                        )
                        await record_movement(
                            db,
                            session,
                            item_doc=item,
                            movement_type=MovementType.ADJUSTMENT_IN,
                            quantity=qty,
                            reference_type="sale_cancel",
                            reference_id=str(result["_id"]),
                            unit_cost=item.get("purchase_price"),
                            actor_id=actor_id,
                            actor_username=actor_username,
                            notes=f"Cancelled order {result.get('sale_number', '')} (recipe ingredient)",
                        )
    except DuplicateKeyError:
        raise ConflictError("Duplicate submission detected.") from None

    await log_audit(
        db,
        actor_id=actor_id,
        actor_username=actor_username,
        action="cancel" if new_status == "CANCELLED" else "status_change",
        entity_type="sale",
        entity_id=sale_id,
        before={"order_status": current},
        after={"order_status": new_status},
        business_unit_id=result.get("business_unit_id"),
    )
    return result


def build_sale_query(
    *,
    business_unit_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    status: str | None = None,
    payment_method: str | None = None,
) -> dict[str, Any]:
    """Build the Mongo query for sale listings.

    ``status`` is the order lifecycle filter: "active" (not SERVED/
    CANCELLED), a specific status, or "all" (everything, including
    cancelled). Legacy documents without order_status count as SERVED for
    lifecycle filters but are always included in "all".
    """
    from datetime import timedelta

    query: dict[str, Any] = {"status": "completed"}
    if business_unit_id and is_oid(business_unit_id):
        query["business_unit_id"] = business_unit_id
    if payment_method:
        query["payment_method"] = payment_method

    if status and status != "all":
        if status == "active":
            query["order_status"] = {"$nin": ["SERVED", "CANCELLED"]}
        else:
            query["order_status"] = status

    range_filter: dict[str, Any] = {}
    if date_from:
        range_filter["$gte"] = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=UTC)
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=UTC) + timedelta(days=1)
        range_filter["$lt"] = end
    if range_filter:
        query["sold_at"] = range_filter
    return query
