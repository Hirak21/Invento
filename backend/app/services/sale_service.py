from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.models.sale import SaleCreate, sale_out_from_doc
from app.models.enums import MovementType
from app.services.ledger import is_oid, oid, record_movement
from app.services.recipe_service import get_recipe as get_recipe_full
from app.utils.errors import BusinessRuleError, ConflictError, NotFoundError
from app.utils.money import money_to_str, parse_money


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

    When `payload.recipe_id` is set the sale is run as a BOM (bill-of-materials)
    explosion: each ingredient of the recipe is deducted by
    `ingredient.quantity * sale_quantity` in the same transaction.  The recipe
    business unit must match the sale business unit.  The `recipe_id` and
    `recipe_name` fields are attached to the resulting sale document for
    traceability.
    """
    if not is_oid(payload.business_unit_id):
        raise BusinessRuleError("Business unit not found.")
    unit = await db.business_units.find_one({"_id": oid(payload.business_unit_id)})
    if unit is None or not unit.get("active", True):
        raise BusinessRuleError("Business unit not found or inactive.")

    recipe_id_oid: ObjectId | None = None
    recipe_name: str | None = None
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
        recipe_id_oid = oid(payload.recipe_id)
        recipe_name = recipe_doc["name"]

        recipe_full: dict[str, Any] = await get_recipe_full(db, payload.recipe_id)
        recipe_ingredients: list[dict[str, Any]] = recipe_full["ingredients"]
    else:
        recipe_ingredients = []

    # Merge duplicate lines per item so stock checks see total demand.
    merged: dict[str, dict[str, Any]] = {}
    for line in payload.items:
        existing = merged.get(line.item_id)
        if existing:
            existing["quantity"] += line.quantity
        else:
            merged[line.item_id] = {
                "item_id": line.item_id,
                "quantity": line.quantity,
                "unit_price": line.unit_price,
            }

    # Include recipe ingredient demand in the merged map so the stock guard
    # sees the total requirement inside the transaction.
    for ing in recipe_ingredients:
        key = str(ing["item_id"])
        existing = merged.get(key)
        if existing:
            existing["quantity"] += ing["quantity"]
        else:
            merged[key] = {
                "item_id": key,
                "quantity": ing["quantity"],
                "unit_price": "0.00",
                "_is_recipe_ingredient": True,
            }

    subtotal = sum(
        (parse_money(line["unit_price"]) * line["quantity"] for line in merged.values()),
        start=parse_money("0.00"),
    )
    discount = parse_money(payload.discount) if payload.discount else parse_money("0.00")
    if discount > subtotal:
        raise BusinessRuleError("Discount cannot exceed the sale subtotal.")
    total_amount = money_to_str(subtotal - discount)

    sold_at = _parse_sale_date(payload.date)

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
        "created_by": actor_id,
        "created_by_username": actor_username,
        "created_at": datetime.now(UTC),
        "idempotency_key": payload.idempotency_key,
        "status": "completed",
        "recipe_id": str(recipe_id_oid) if recipe_id_oid is not None else None,
        "recipe_name": recipe_name,
    }

    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                # Stock guard + item validation INSIDE the transaction so
                # concurrent sales cannot both pass against stale balances.
                for key, line in merged.items():
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

                    is_recipe_ingredient = line.get("_is_recipe_ingredient", False)
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
                            "recipe_line": is_recipe_ingredient,
                        }
                    )

                doc["sale_number"] = await _next_sale_number(db, session)
                result = await db.sales.insert_one(doc, session=session)

                for line in doc["items"]:
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
                        notes=f"Sale {doc['sale_number']}" + (
                            f" (recipe: {doc['recipe_name']})" if doc.get("recipe_name") else ""
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


def build_sale_query(
    *,
    business_unit_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    from datetime import timedelta

    query: dict[str, Any] = {"status": "completed"}
    if business_unit_id and is_oid(business_unit_id):
        query["business_unit_id"] = business_unit_id
    range_filter: dict[str, Any] = {}
    if date_from:
        range_filter["$gte"] = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=UTC)
    if date_to:
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(tzinfo=UTC) + timedelta(days=1)
        range_filter["$lt"] = end
    if range_filter:
        query["sold_at"] = range_filter
    return query
