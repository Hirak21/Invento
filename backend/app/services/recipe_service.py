from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.models.recipe import (
    RecipeCreate,
    RecipeUpdate,
    RecipeOut,
    RecipeIngredientIn,
    RecipeIngredientOut,
    RecipeWithIngredients,
    _recipe_out_from_doc,
    _ingredient_out_from_doc,
    recipe_cost_from_lines,
)
from app.services.ledger import is_oid, oid
from app.utils.errors import BusinessRuleError, NotFoundError, ConflictError
from app.models.user import utc_now
from app.utils.money import parse_money
from app.utils.units import (
    IncompatibleUnitError,
    compatible_units,
    decimal_to_mongo,
    quantize_qty,
    to_base_quantity,
    to_decimal_number,
)


def _escape_regex(text: str) -> str:
    import re

    return re.escape(text)


async def _require_unit(db: AsyncIOMotorDatabase, business_unit_id: str) -> dict[str, Any]:
    if not is_oid(business_unit_id):
        raise BusinessRuleError("Business unit not found.")
    unit = await db.business_units.find_one({"_id": oid(business_unit_id)})
    if unit is None:
        raise NotFoundError("Business unit not found.")
    if not unit.get("active", True):
        raise BusinessRuleError("Business unit is inactive.")
    return unit


async def _require_item_in_bu(
    db: AsyncIOMotorDatabase, item_id: str, business_unit_id: str
) -> dict[str, Any]:
    if not is_oid(item_id):
        raise BusinessRuleError("Item not found.")
    item = await db.inventory_items.find_one({"_id": oid(item_id)})
    if item is None:
        raise NotFoundError("Item not found.")
    if item.get("active", True) is False:
        raise BusinessRuleError(f"Item '{item['name']}' is inactive.")
    if item["business_unit_id"] != business_unit_id:
        raise BusinessRuleError(
            f"Item '{item['name']}' does not belong to the same business unit as the recipe."
        )
    return item


def _validate_ingredient_payload(
    payload: RecipeIngredientIn, *, index: int | None = None
) -> tuple[Decimal, str]:
    """Return (entered_qty quantized, entered_unit or '')."""
    prefix = f"Ingredient {index + 1}: " if index is not None else ""
    try:
        entered_qty = quantize_qty(payload.quantity)
    except ValueError:
        raise BusinessRuleError(
            f"{prefix}Quantity must be a positive number greater than zero."
        ) from None
    entered_unit = (payload.unit or "").strip() or ""
    return entered_qty, entered_unit


async def _ingredient_doc(
    db: AsyncIOMotorDatabase,
    recipe_id: Any,
    business_unit_id: str,
    payload: RecipeIngredientIn,
    *,
    index: int | None = None,
) -> dict[str, Any]:
    item = await _require_item_in_bu(db, payload.item_id, business_unit_id)
    entered_qty, entered_unit = _validate_ingredient_payload(payload, index=index)
    base_unit = item["base_unit"]
    effective_unit = entered_unit or base_unit
    try:
        canonical = to_base_quantity(entered_qty, effective_unit, base_unit)
    except IncompatibleUnitError as exc:
        raise BusinessRuleError(str(exc)) from None
    except ValueError as exc:
        raise BusinessRuleError(str(exc)) from None
    return {
        "recipe_id": recipe_id,
        "item_id": oid(payload.item_id),
        "quantity": decimal_to_mongo(canonical),
        "entered_quantity": decimal_to_mongo(entered_qty),
        "entered_unit": effective_unit,
        "notes": payload.notes,
        "created_at": utc_now(),
    }


async def _recipe_cost(db: AsyncIOMotorDatabase, recipe_oid: Any) -> str:
    lines: list[dict[str, Any]] = []
    async for ing in db.recipe_ingredients.find({"recipe_id": recipe_oid}):
        item = await db.inventory_items.find_one({"_id": ing["item_id"]})
        if item is None:
            continue
        lines.append({
            "quantity": to_decimal_number(ing["quantity"]),
            "purchase_price": item.get("purchase_price") or "0.00",
        })
    return recipe_cost_from_lines(lines)


async def _full_recipe(db: AsyncIOMotorDatabase, recipe: dict[str, Any]) -> RecipeWithIngredients:
    ingredients: list[RecipeIngredientOut] = []
    async for ing in db.recipe_ingredients.find({"recipe_id": recipe["_id"]}):
        item = await db.inventory_items.find_one({"_id": ing["item_id"]})
        if item is None:
            continue
        ingredients.append(_ingredient_out_from_doc(ing, item, str(recipe["_id"])))
    cost = await _recipe_cost(db, recipe["_id"])
    return RecipeWithIngredients(
        recipe=_recipe_out_from_doc(recipe, estimated_cost=cost),
        ingredients=ingredients,
    )


async def create_recipe(
    db: AsyncIOMotorDatabase,
    payload: RecipeCreate,
    *,
    actor_id: str,
    actor_username: str,
) -> dict[str, Any]:
    await _require_unit(db, payload.business_unit_id)

    # Case-insensitive name uniqueness so "Dosa" and " dosa " collide.
    name_dup = await db.recipes.find_one({
        "name": {"$regex": f"^{_escape_regex(payload.name.strip())}$", "$options": "i"},
        "business_unit_id": payload.business_unit_id,
    })
    if name_dup:
        raise ConflictError(
            f"A recipe named '{payload.name.strip()}' already exists in this business unit."
        )

    if payload.category_id is not None:
        if not is_oid(payload.category_id):
            raise BusinessRuleError("Category not found.")
        category = await db.categories.find_one({"_id": oid(payload.category_id)})
        if category is None:
            raise BusinessRuleError("Category not found.")

    if payload.ingredients is not None:
        seen: set[str] = set()
        for idx, line in enumerate(payload.ingredients):
            if not is_oid(line.item_id):
                raise BusinessRuleError(f"Ingredient {idx + 1}: item not found.")
            key = str(oid(line.item_id))
            if key in seen:
                raise ConflictError(
                    "Duplicate ingredient lines are not allowed: "
                    "each stock item may appear only once per recipe."
                )
            seen.add(key)

    now = utc_now()
    doc = {
        "name": payload.name.strip(),
        "business_unit_id": payload.business_unit_id,
        "description": payload.description,
        "active": payload.active,
        "selling_price": payload.selling_price,
        "category_id": payload.category_id,
        "created_at": now,
        "updated_at": now,
    }
    try:
        async with await db.client.start_session() as session:
            async with session.start_transaction():
                result = await db.recipes.insert_one(doc, session=session)
                doc["_id"] = result.inserted_id
                if payload.ingredients:
                    ing_docs = [
                        await _ingredient_doc(
                            db, result.inserted_id, payload.business_unit_id, line, index=idx
                        )
                        for idx, line in enumerate(payload.ingredients)
                    ]
                    try:
                        await db.recipe_ingredients.insert_many(ing_docs, session=session)
                    except DuplicateKeyError:
                        raise ConflictError(
                            "Duplicate ingredient lines are not allowed: "
                            "each stock item may appear only once per recipe."
                        ) from None
    except DuplicateKeyError:
        raise ConflictError(
            f"A recipe named '{payload.name.strip()}' already exists in this business unit."
        ) from None
    return doc


async def get_recipe(
    db: AsyncIOMotorDatabase,
    recipe_id: str,
) -> dict[str, Any]:
    """Full recipe for API + BOM consumers.

    Returns ``{"recipe": RecipeOut, "ingredients": [RecipeIngredientOut]}``
    (pydantic models, matching the response schema). Legacy ingredient docs
    without ``entered_*`` fields read as base-unit quantities — no migration.
    """
    if not is_oid(recipe_id):
        raise NotFoundError("Recipe not found.")
    recipe = await db.recipes.find_one({"_id": oid(recipe_id)})
    if recipe is None:
        raise NotFoundError("Recipe not found.")
    full = await _full_recipe(db, recipe)
    return {"recipe": full.recipe, "ingredients": full.ingredients}


async def list_recipes(
    db: AsyncIOMotorDatabase,
    *,
    business_unit_id: str | None = None,
    active: bool = True,
) -> list[dict[str, Any]]:
    query: dict[str, Any] = {"active": active}
    if business_unit_id and is_oid(business_unit_id):
        query["business_unit_id"] = business_unit_id
    out: list[dict[str, Any]] = []
    async for doc in db.recipes.find(query).sort("name", 1):
        cost = await _recipe_cost(db, doc["_id"])
        out.append(_recipe_out_from_doc(doc, estimated_cost=cost))
    return out


async def update_recipe(
    db: AsyncIOMotorDatabase,
    recipe_id: str,
    payload: RecipeUpdate,
) -> dict[str, Any]:
    if not is_oid(recipe_id):
        raise NotFoundError("Recipe not found.")
    recipe = await db.recipes.find_one({"_id": oid(recipe_id)})
    if recipe is None:
        raise NotFoundError("Recipe not found.")

    updates: dict[str, Any] = {}
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise BusinessRuleError("Recipe name is required.")
        dup = await db.recipes.find_one({
            "name": {"$regex": f"^{_escape_regex(name)}$", "$options": "i"},
            "business_unit_id": recipe["business_unit_id"],
            "_id": {"$ne": recipe["_id"]},
        })
        if dup:
            raise ConflictError(
                f"A recipe named '{name}' already exists in this business unit."
            )
        updates["name"] = name
    if payload.business_unit_id is not None:
        await _require_unit(db, payload.business_unit_id)
        updates["business_unit_id"] = payload.business_unit_id
    if payload.description is not None:
        updates["description"] = payload.description
    if payload.active is not None:
        updates["active"] = payload.active
    if payload.selling_price is not None:
        updates["selling_price"] = payload.selling_price
    if payload.category_id is not None:
        if not is_oid(payload.category_id):
            raise BusinessRuleError("Category not found.")
        category = await db.categories.find_one({"_id": oid(payload.category_id)})
        if category is None:
            raise BusinessRuleError("Category not found.")
        updates["category_id"] = payload.category_id

    if not updates:
        return recipe

    updates["updated_at"] = utc_now()
    try:
        await db.recipes.update_one({"_id": recipe["_id"]}, {"$set": updates})
    except DuplicateKeyError:
        raise ConflictError(
            "A recipe with that name already exists in this business unit."
        ) from None
    updated = await db.recipes.find_one({"_id": recipe["_id"]})
    assert updated is not None
    return updated


async def delete_recipe(
    db: AsyncIOMotorDatabase,
    recipe_id: str,
) -> None:
    if not is_oid(recipe_id):
        raise NotFoundError("Recipe not found.")
    recipe = await db.recipes.find_one({"_id": oid(recipe_id)})
    if recipe is None:
        raise NotFoundError("Recipe not found.")

    # sales store recipe_id as a string; querying an ObjectId here silently
    # matched nothing and let referenced recipes be deleted.
    sale_refs = await db.sales.count_documents({"recipe_id": recipe_id})
    if sale_refs > 0:
        raise BusinessRuleError(
            "Cannot delete a recipe that has been referenced by sales."
        )

    await db.recipe_ingredients.delete_many({"recipe_id": oid(recipe_id)})
    await db.recipes.delete_one({"_id": oid(recipe_id)})


async def add_ingredient(
    db: AsyncIOMotorDatabase,
    recipe_id: str,
    payload: RecipeIngredientIn,
    *,
    actor_id: str,
    actor_username: str,
) -> dict[str, Any]:
    if not is_oid(recipe_id):
        raise NotFoundError("Recipe not found.")
    recipe = await db.recipes.find_one({"_id": oid(recipe_id)})
    if recipe is None:
        raise NotFoundError("Recipe not found.")

    if is_oid(payload.item_id):
        dup = await db.recipe_ingredients.find_one({
            "recipe_id": oid(recipe_id),
            "item_id": oid(payload.item_id),
        })
        if dup:
            item = await db.inventory_items.find_one({"_id": oid(payload.item_id)})
            label = item["name"] if item else "This item"
            raise ConflictError(
                f"{label} is already an ingredient of this recipe. "
                "Edit the existing line instead of adding a duplicate."
            )

    ing_doc = await _ingredient_doc(db, oid(recipe_id), recipe["business_unit_id"], payload)
    try:
        result = await db.recipe_ingredients.insert_one(ing_doc)
        ing_doc["_id"] = result.inserted_id
    except DuplicateKeyError:
        raise ConflictError(
            "Duplicate ingredient lines are not allowed: "
            "each stock item may appear only once per recipe."
        ) from None

    item = await db.inventory_items.find_one({"_id": ing_doc["item_id"]})
    assert item is not None
    enriched = _ingredient_out_from_doc(ing_doc, item, recipe_id)
    return enriched.model_dump()


async def remove_ingredient(
    db: AsyncIOMotorDatabase,
    recipe_id: str,
    ingredient_id: str,
) -> None:
    if not is_oid(recipe_id):
        raise NotFoundError("Recipe not found.")
    if not is_oid(ingredient_id):
        raise NotFoundError("Ingredient not found.")
    result = await db.recipe_ingredients.delete_one({
        "_id": oid(ingredient_id),
        "recipe_id": oid(recipe_id),
    })
    if result.deleted_count == 0:
        raise NotFoundError("Ingredient not found.")


async def compatible_units_for_item(db: AsyncIOMotorDatabase, item_id: str) -> list[str]:
    """Units the client may offer for an ingredient line on this item."""
    if not is_oid(item_id):
        raise NotFoundError("Item not found.")
    item = await db.inventory_items.find_one({"_id": oid(item_id)})
    if item is None:
        raise NotFoundError("Item not found.")
    return compatible_units(item["base_unit"])
