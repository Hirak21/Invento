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
from app.utils.tx_retry import run_in_transaction
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
    return _check_item_in_bu(item, business_unit_id)


def _check_item_in_bu(item: dict[str, Any], business_unit_id: str) -> dict[str, Any]:
    """Item eligibility checks shared by lookup and pre-batched paths."""
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
    item: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if item is None:
        item = await _require_item_in_bu(db, payload.item_id, business_unit_id)
    else:
        _check_item_in_bu(item, business_unit_id)
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


async def _ingredients_with_items(
    db: AsyncIOMotorDatabase, recipe_oids: list[Any]
) -> dict[Any, list[tuple[dict[str, Any], dict[str, Any]]]]:
    """Batch-load (ingredient, item) pairs for many recipes in two queries.

    Replaces the per-ingredient ``find_one`` on inventory_items (N+1) that
    previously ran once per line per recipe. Ingredients whose item no
    longer exists are dropped, matching the old skip-if-missing behaviour.
    """
    grouped: dict[Any, list[tuple[dict[str, Any], dict[str, Any]]]] = {
        roid: [] for roid in recipe_oids
    }
    if not recipe_oids:
        return grouped
    ings = await db.recipe_ingredients.find({"recipe_id": {"$in": recipe_oids}}).to_list(None)
    if not ings:
        return grouped
    item_ids = {ing["item_id"] for ing in ings}
    items = await db.inventory_items.find({"_id": {"$in": list(item_ids)}}).to_list(None)
    items_by_id = {item["_id"]: item for item in items}
    for ing in ings:
        item = items_by_id.get(ing["item_id"])
        if item is not None:
            grouped[ing["recipe_id"]].append((ing, item))
    return grouped


def _cost_lines(pairs: list[tuple[dict[str, Any], dict[str, Any]]]) -> list[dict[str, Any]]:
    return [
        {
            "quantity": to_decimal_number(ing["quantity"]),
            "purchase_price": item.get("purchase_price") or "0.00",
        }
        for ing, item in pairs
    ]


async def _recipe_cost(db: AsyncIOMotorDatabase, recipe_oid: Any) -> str:
    pairs = (await _ingredients_with_items(db, [recipe_oid]))[recipe_oid]
    return recipe_cost_from_lines(_cost_lines(pairs))


async def _full_recipe(db: AsyncIOMotorDatabase, recipe: dict[str, Any]) -> RecipeWithIngredients:
    pairs = (await _ingredients_with_items(db, [recipe["_id"]]))[recipe["_id"]]
    ingredients = [
        _ingredient_out_from_doc(ing, item, str(recipe["_id"])) for ing, item in pairs
    ]
    cost = recipe_cost_from_lines(_cost_lines(pairs))
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
) -> list[RecipeWithIngredients]:
    """All matching recipes with full BOMs, batched (no per-recipe queries)."""
    query: dict[str, Any] = {"active": active}
    if business_unit_id and is_oid(business_unit_id):
        query["business_unit_id"] = business_unit_id
    docs = await db.recipes.find(query).sort("name", 1).to_list(None)
    grouped = await _ingredients_with_items(db, [doc["_id"] for doc in docs])
    out: list[RecipeWithIngredients] = []
    for doc in docs:
        pairs = grouped.get(doc["_id"], [])
        ingredients = [
            _ingredient_out_from_doc(ing, item, str(doc["_id"])) for ing, item in pairs
        ]
        cost = recipe_cost_from_lines(_cost_lines(pairs))
        out.append(
            RecipeWithIngredients(
                recipe=_recipe_out_from_doc(doc, estimated_cost=cost),
                ingredients=ingredients,
            )
        )
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

    # New BOM (optional): validate every line BEFORE the transaction so a
    # bad line can never leave a half-replaced recipe behind.
    new_ing_docs: list[dict[str, Any]] | None = None
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
        target_bu = payload.business_unit_id or recipe["business_unit_id"]
        found = await db.inventory_items.find(
            {"_id": {"$in": [oid(k) for k in seen]}}
        ).to_list(len(seen))
        found_by_id = {item["_id"]: item for item in found}
        new_ing_docs = []
        for idx, line in enumerate(payload.ingredients):
            item = found_by_id.get(oid(line.item_id))
            if item is None:
                raise NotFoundError("Item not found.")
            new_ing_docs.append(
                await _ingredient_doc(
                    db, recipe["_id"], target_bu, line, index=idx, item=item
                )
            )

    if not updates and new_ing_docs is None:
        return recipe

    updates["updated_at"] = utc_now()

    async def _apply(session: Any) -> None:
        try:
            await db.recipes.update_one(
                {"_id": recipe["_id"]}, {"$set": updates}, session=session
            )
        except DuplicateKeyError:
            raise ConflictError(
                "A recipe with that name already exists in this business unit."
            ) from None
        if new_ing_docs is not None:
            # Atomic BOM swap: old lines out, new lines in, same transaction.
            await db.recipe_ingredients.delete_many(
                {"recipe_id": recipe["_id"]}, session=session
            )
            try:
                await db.recipe_ingredients.insert_many(new_ing_docs, session=session)
            except DuplicateKeyError:
                raise ConflictError(
                    "Duplicate ingredient lines are not allowed: "
                    "each stock item may appear only once per recipe."
                ) from None

    await run_in_transaction(db, _apply)

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
