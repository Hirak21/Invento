from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.models.recipe import (
    RecipeCreate,
    RecipeUpdate,
    RecipeOut,
    RecipeIngredientIn,
    RecipeIngredientOut,
    _recipe_out_from_doc,
    _ingredient_out_from_doc,
)
from app.services.ledger import is_oid, oid
from app.utils.errors import BusinessRuleError, NotFoundError, ConflictError
from app.models.user import utc_now


def _escape_regex(text: str) -> str:
    import re

    return re.escape(text)


async def create_recipe(
    db: AsyncIOMotorDatabase,
    payload: RecipeCreate,
    *,
    actor_id: str,
    actor_username: str,
) -> dict[str, Any]:
    if not is_oid(payload.business_unit_id):
        raise BusinessRuleError("Business unit not found.")
    unit = await db.business_units.find_one({"_id": oid(payload.business_unit_id)})
    if unit is None or not unit.get("active", True):
        raise BusinessRuleError("Business unit not found or inactive.")

    # Case-insensitive name uniqueness so "Dosa" and " dosa " collide.
    name_dup = await db.recipes.find_one({
        "name": {"$regex": f"^{_escape_regex(payload.name.strip())}$", "$options": "i"},
        "business_unit_id": payload.business_unit_id,
    })
    if name_dup:
        raise ConflictError(
            f"A recipe named '{payload.name.strip()}' already exists in this business unit."
        )

    now = utc_now()
    doc = {
        "name": payload.name.strip(),
        "business_unit_id": payload.business_unit_id,
        "description": payload.description,
        "active": payload.active,
        "selling_price": payload.selling_price,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.recipes.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


async def get_recipe(
    db: AsyncIOMotorDatabase,
    recipe_id: str,
) -> dict[str, Any]:
    if not is_oid(recipe_id):
        raise NotFoundError("Recipe not found.")
    recipe = await db.recipes.find_one({"_id": oid(recipe_id)})
    if recipe is None:
        raise NotFoundError("Recipe not found.")

    ingredients: list[dict[str, Any]] = []
    item_ids: list[str] = []
    async for ing_doc in db.recipe_ingredients.find({"recipe_id": oid(recipe_id)}):
        item_ids.append(str(ing_doc["item_id"]))
        ingredients.append(ing_doc)

    item_lookup: dict[str, dict[str, Any]] = {}
    if item_ids:
        for item_doc in await db.inventory_items.find(
            {"_id": {"$in": [oid(iid) for iid in item_ids]}}
        ).to_list(length=None):
            item_lookup[str(item_doc["_id"])] = item_doc

    enriched_ingredients: list[dict[str, Any]] = []
    for ing in ingredients:
        item = item_lookup.get(str(ing["item_id"]))
        if item is None:
            raise NotFoundError(f"Ingredient item not found.")
        enriched_ingredients.append({
            "_id": ing["_id"],
            "recipe_id": recipe_id,
            "item_id": ing["item_id"],
            "item_name": item["name"],
            "quantity": ing["quantity"],
            "unit": item["base_unit"],
            "notes": ing.get("notes"),
        })

    return {
        "recipe": _recipe_out_from_doc(recipe),
        "ingredients": [
            _ingredient_out_from_doc(ing, recipe_id) for ing in enriched_ingredients
        ],
    }


async def list_recipes(
    db: AsyncIOMotorDatabase,
    *,
    business_unit_id: str | None = None,
    active: bool = True,
) -> list[dict[str, Any]]:
    query: dict[str, Any] = {"active": active}
    if business_unit_id and is_oid(business_unit_id):
        query["business_unit_id"] = business_unit_id
    return [_recipe_out_from_doc(doc) async for doc in db.recipes.find(query).sort("name", 1)]


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
        updates["name"] = payload.name.strip()
    if payload.business_unit_id is not None:
        if not is_oid(payload.business_unit_id):
            raise BusinessRuleError("Business unit not found.")
        unit = await db.business_units.find_one({"_id": oid(payload.business_unit_id)})
        if unit is None or not unit.get("active", True):
            raise BusinessRuleError("Business unit not found or inactive.")
        updates["business_unit_id"] = payload.business_unit_id
    if payload.description is not None:
        updates["description"] = payload.description
    if payload.active is not None:
        updates["active"] = payload.active

    if not updates:
        return recipe

    updates["updated_at"] = utc_now()
    await db.recipes.update_one({"_id": recipe["_id"]}, {"$set": updates})
    updated = await db.recipes.find_one({"_id": recipe["_id"]})
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

    if not is_oid(payload.item_id):
        raise BusinessRuleError("Item not found.")
    item = await db.inventory_items.find_one({"_id": oid(payload.item_id)})
    if item is None:
        raise NotFoundError("Item not found.")
    if item.get("active", True) is False:
        raise BusinessRuleError(f"Item '{item['name']}' is inactive.")
    if item["business_unit_id"] != recipe["business_unit_id"]:
        raise BusinessRuleError(
            f"Item '{item['name']}' does not belong to the same business unit as the recipe."
        )

    ing_doc = {
        "recipe_id": oid(recipe_id),
        "item_id": oid(payload.item_id),
        "quantity": payload.quantity,
        "notes": payload.notes,
        "created_at": utc_now(),
    }
    try:
        result = await db.recipe_ingredients.insert_one(ing_doc)
        ing_doc["_id"] = result.inserted_id
    except DuplicateKeyError:
        raise ConflictError("Duplicate ingredient entry.")

    enriched = {
        "_id": result.inserted_id,
        "recipe_id": recipe_id,
        "item_id": payload.item_id,
        "item_name": item["name"],
        "quantity": payload.quantity,
        "unit": item["base_unit"],
        "notes": payload.notes,
    }
    return enriched


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
