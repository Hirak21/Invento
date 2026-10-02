from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.enums import MovementType
from app.models.inventory import ItemCreate, ItemUpdate, item_out_from_doc
from app.models.user import utc_now
from app.services.ledger import oid, record_movement
from app.utils.errors import BusinessRuleError, NotFoundError


async def _validate_references(db: AsyncIOMotorDatabase, payload: ItemCreate) -> None:
    if not ObjectId.is_valid(payload.category_id):
        raise BusinessRuleError("Category not found.")
    category = await db.categories.find_one({"_id": oid(payload.category_id)})
    if category is None or not category.get("active", True):
        raise BusinessRuleError("Category not found or inactive.")

    if not ObjectId.is_valid(payload.business_unit_id):
        raise BusinessRuleError("Business unit not found.")
    unit = await db.business_units.find_one({"_id": oid(payload.business_unit_id)})
    if unit is None or not unit.get("active", True):
        raise BusinessRuleError("Business unit not found or inactive.")

    if payload.supplier_id is not None:
        if not ObjectId.is_valid(payload.supplier_id):
            raise BusinessRuleError("Supplier not found.")
        supplier = await db.suppliers.find_one({"_id": oid(payload.supplier_id)})
        if supplier is None:
            raise BusinessRuleError("Supplier not found.")


async def create_item(
    db: AsyncIOMotorDatabase,
    payload: ItemCreate,
    *,
    actor_id: str,
    actor_username: str,
) -> dict[str, Any]:
    await _validate_references(db, payload)

    # Check for duplicate item name within the same business unit (case-insensitive)
    name_duplicate = await db.inventory_items.find_one({
        "name": {"$regex": f"^{payload.name.strip()}$", "$options": "i"},
        "business_unit_id": payload.business_unit_id,
    })
    if name_duplicate:
        raise BusinessRuleError(
            f"An item named '{payload.name.strip()}' already exists in this business unit."
        )

    duplicate = None
    if payload.sku:
        duplicate = await db.inventory_items.find_one({"sku": payload.sku})
        if duplicate:
            raise BusinessRuleError(f"SKU '{payload.sku}' is already in use.")

    doc = {
        "name": payload.name.strip(),
        "sku": (payload.sku.strip() or None) if payload.sku else None,
        "category_id": payload.category_id,
        "business_unit_id": payload.business_unit_id,
        "item_type": payload.item_type.value,
        "base_unit": payload.base_unit.value,
        "purchase_price": payload.purchase_price,
        "selling_price": payload.selling_price if payload.selling_price else None,
        "min_stock_level": payload.min_stock_level,
        "current_stock": payload.opening_stock,
        "supplier_id": payload.supplier_id,
        "notes": payload.notes,
        "active": True,
        "created_at": utc_now(),
        "updated_at": utc_now(),
    }

    async with await db.client.start_session() as session:
        async with session.start_transaction():
            result = await db.inventory_items.insert_one(doc, session=session)
            item_doc = {**doc, "_id": result.inserted_id}
            if payload.opening_stock > 0:
                # Integrity rule 1: opening stock is a stock change → movement row.
                await record_movement(
                    db,
                    session,
                    item_doc=item_doc,
                    movement_type=MovementType.ADJUSTMENT_IN,
                    quantity=payload.opening_stock,
                    reference_type="opening",
                    reference_id=str(result.inserted_id),
                    actor_id=actor_id,
                    actor_username=actor_username,
                    notes="Opening stock",
                )
    return {**doc, "_id": result.inserted_id}


async def update_item(
    db: AsyncIOMotorDatabase,
    item_id: str,
    payload: ItemUpdate,
) -> dict[str, Any]:
    if not ObjectId.is_valid(item_id):
        raise NotFoundError("Item not found.")
    item = await db.inventory_items.find_one({"_id": oid(item_id)})
    if item is None:
        raise NotFoundError("Item not found.")

    updates: dict[str, Any] = {}
    for field in ("name", "sku", "category_id", "business_unit_id", "item_type", "base_unit", "min_stock_level", "supplier_id", "notes"):
        value = getattr(payload, field)
        if value is not None:
            if field == "name":
                value = value.strip()
            if field == "sku":
                value = value.strip() or None
            if field in ("category_id", "business_unit_id"):
                if not ObjectId.is_valid(value):
                    raise BusinessRuleError(f"Invalid {field.replace('_', ' ')}.")
            if field in ("item_type", "base_unit") and hasattr(value, "value"):
                # Store the plain string value so reads never depend on
                # enum-vs-str equality quirks.
                value = value.value
            updates[field] = value
    for field in ("purchase_price", "selling_price"):
        money_value = getattr(payload, field)
        if money_value is not None:
            updates[field] = money_value
    if payload.active is not None:
        updates["active"] = payload.active

    if not updates:
        return item

    # Validate business_unit_id change
    if "business_unit_id" in updates:
        new_bu_id = updates["business_unit_id"]
        if new_bu_id != item["business_unit_id"]:
            # Check if new business unit exists and is active
            unit = await db.business_units.find_one({"_id": oid(new_bu_id)})
            if unit is None or not unit.get("active", True):
                raise BusinessRuleError("Business unit not found or inactive.")
            # Check for duplicate name in new business unit
            check_name = updates.get("name", item["name"])
            name_duplicate = await db.inventory_items.find_one({
                "name": {"$regex": f"^{check_name}$", "$options": "i"},
                "business_unit_id": new_bu_id,
                "_id": {"$ne": item["_id"]},
            })
            if name_duplicate:
                raise BusinessRuleError(
                    f"An item named '{check_name}' already exists in the target business unit."
                )

    # Validate category_id change
    if "category_id" in updates:
        new_cat_id = updates["category_id"]
        category = await db.categories.find_one({"_id": oid(new_cat_id)})
        if category is None or not category.get("active", True):
            raise BusinessRuleError("Category not found or inactive.")

    # Validate base_unit change. A base-unit edit reinterprets every stored
    # quantity (100 kg would read as 100 g), so it is only safe on a
    # zero-stock item with no recipe lines referencing it.
    if "base_unit" in updates:
        new_unit = updates["base_unit"]
        if new_unit != item["base_unit"]:
            from app.utils.units import to_decimal_number as _to_dec

            if _to_dec(item.get("current_stock", 0) or 0) != 0:
                raise BusinessRuleError(
                    "Cannot change the base unit while stock is on hand "
                    f"({item.get('current_stock', 0)} {item['base_unit']}). "
                    "Adjust stock to zero first."
                )
            ref_count = await db.recipe_ingredients.count_documents(
                {"item_id": item["_id"]}
            )
            if ref_count:
                raise BusinessRuleError(
                    "Cannot change the base unit: recipes use this item "
                    "as an ingredient. Create a new item instead."
                )

    # Check for duplicate item name within the same business unit (case-insensitive)
    target_bu = updates.get("business_unit_id", item["business_unit_id"])
    if updates.get("name"):
        check_name = updates["name"]
    else:
        check_name = item["name"]
    name_duplicate = await db.inventory_items.find_one({
        "name": {"$regex": f"^{check_name}$", "$options": "i"},
        "business_unit_id": target_bu,
        "_id": {"$ne": item["_id"]},
    })
    if name_duplicate:
        raise BusinessRuleError(
            f"An item named '{check_name}' already exists in this business unit."
        )

    if updates.get("sku"):
        duplicate = await db.inventory_items.find_one(
            {"sku": updates["sku"], "_id": {"$ne": item["_id"]}}
        )
        if duplicate:
            raise BusinessRuleError(f"SKU '{updates['sku']}' is already in use.")

    updates["updated_at"] = utc_now()
    await db.inventory_items.update_one({"_id": item["_id"]}, {"$set": updates})
    return await db.inventory_items.find_one({"_id": item["_id"]})


async def delete_item(
    db: AsyncIOMotorDatabase,
    item_id: str,
) -> dict[str, Any]:
    """Delete an inventory item. Only allowed if no stock movements exist (except opening)."""
    if not ObjectId.is_valid(item_id):
        raise NotFoundError("Item not found.")
    item = await db.inventory_items.find_one({"_id": oid(item_id)})
    if item is None:
        raise NotFoundError("Item not found.")

    # Check if item has stock movements (other than opening stock) - prevent deletion if so
    movements_count = await db.inventory_movements.count_documents({
        "item_id": item_id,
        "reference_type": {"$ne": "opening"}
    })
    if movements_count > 0:
        raise BusinessRuleError("Cannot delete item with stock movements. Deactivate instead.")

    await db.inventory_items.delete_one({"_id": item["_id"]})
    return item


def build_item_query(
    *,
    business_unit_id: str | None = None,
    category_id: str | None = None,
    supplier_id: str | None = None,
    search: str | None = None,
    status: str | None = None,
    active: bool | None = True,
) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if business_unit_id and ObjectId.is_valid(business_unit_id):
        query["business_unit_id"] = business_unit_id
    if category_id and ObjectId.is_valid(category_id):
        query["category_id"] = category_id
    if supplier_id and ObjectId.is_valid(supplier_id):
        query["supplier_id"] = supplier_id
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"sku": {"$regex": search, "$options": "i"}},
        ]
    if status == "out":
        query["current_stock"] = {"$lte": 0}
    elif status == "low":
        query["$expr"] = {
            "$and": [
                {"$gt": ["$current_stock", 0]},
                {"$lte": ["$current_stock", "$min_stock_level"]},
            ]
        }
    elif status == "healthy":
        query["$expr"] = {"$gt": ["$current_stock", "$min_stock_level"]}
    if active is not None:
        query["active"] = active
    return query
