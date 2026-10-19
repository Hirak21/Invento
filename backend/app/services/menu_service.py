from decimal import Decimal
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.recipe import MenuItemType, MenuItemOut, recipe_cost_from_lines
from app.models.inventory import item_out_from_doc
from app.utils.units import to_decimal_number


async def list_menu_items(
    db: AsyncIOMotorDatabase,
    *,
    business_unit_id: str,
) -> list[dict[str, Any]]:
    """Active, saved, sellable menu items for a unit.

    Sellable = active recipe with a selling price AND at least one resolvable
    ingredient (recipes with zero ingredients are never sellable and are
    excluded). Menu = recipes only; shop products / raw ingredients are
    excluded here by design. Availability is computed live from current
    stock (one portion).

    Ingredients, stock items, and categories are each fetched in a single
    ``$in`` query for the whole menu — never one find_one per ingredient.
    """
    recipes: list[dict[str, Any]] = await db.recipes.find({
        "business_unit_id": business_unit_id,
        "active": True,
        "selling_price": {"$ne": None},
    }).sort("name", 1).to_list(None)
    if not recipes:
        return []

    recipe_oids = [recipe["_id"] for recipe in recipes]
    ings: list[dict[str, Any]] = await db.recipe_ingredients.find(
        {"recipe_id": {"$in": recipe_oids}}
    ).to_list(None)

    item_ids = {ing["item_id"] for ing in ings}
    items: list[dict[str, Any]] = (
        await db.inventory_items.find({"_id": {"$in": list(item_ids)}}).to_list(None)
        if item_ids
        else []
    )
    items_by_id = {item["_id"]: item for item in items}

    # Recipes store category_id as an oid-shaped string; the categories
    # collection keys by ObjectId — convert once, map back by str(_id).
    from app.services.ledger import is_oid, oid

    cat_ids = {recipe["category_id"] for recipe in recipes if recipe.get("category_id")}
    cat_oids = {oid(cat_id) for cat_id in cat_ids if is_oid(cat_id)}
    cats: list[dict[str, Any]] = (
        await db.categories.find({"_id": {"$in": list(cat_oids)}}).to_list(None)
        if cat_oids
        else []
    )
    cat_names = {str(cat["_id"]): cat["name"] for cat in cats}

    ings_by_recipe: dict[Any, list[dict[str, Any]]] = {roid: [] for roid in recipe_oids}
    for ing in ings:
        ings_by_recipe[ing["recipe_id"]].append(ing)

    items_out: list[dict[str, Any]] = []
    for recipe in recipes:
        ingredients: list[dict[str, Any]] = []
        cost_lines: list[dict[str, Any]] = []
        available = True
        for ing in ings_by_recipe.get(recipe["_id"], ()):
            item = items_by_id.get(ing["item_id"])
            if item is None:
                available = False
                continue
            canonical = to_decimal_number(ing["quantity"])
            entered = ing.get("entered_quantity")
            ingredients.append({
                "item_name": item["name"],
                "qty": float(canonical),
                "unit": item["base_unit"],
                "entered_qty": float(to_decimal_number(entered)) if entered is not None else float(canonical),
                "entered_unit": ing.get("entered_unit") or item["base_unit"],
            })
            cost_lines.append({
                "quantity": canonical,
                "purchase_price": item.get("purchase_price") or "0.00",
            })
            if not item.get("active", True):
                available = False
            elif to_decimal_number(item.get("current_stock", 0)) < canonical:
                available = False

        if not ingredients:
            # No BOM -> not sellable; keep it out of the menu (it still
            # exists under Recipes where the BOM can be completed).
            continue

        category_id = recipe.get("category_id")
        items_out.append({
            "id": str(recipe["_id"]),
            "name": recipe["name"],
            "type": MenuItemType.RECIPE.value,
            "recipe_id": str(recipe["_id"]),
            "selling_price": recipe.get("selling_price", "0.00"),
            "business_unit_id": recipe["business_unit_id"],
            "active": recipe.get("active", True),
            "created_at": recipe["created_at"],
            "category": cat_names.get(str(category_id)) if category_id else None,
            "available": available,
            "estimated_cost": recipe_cost_from_lines(cost_lines),
            "ingredient_summary": ingredients,
            "base_unit": None,
        })

    # (b) Removed: Sell/Menu shows ONLY recipes (dishes). Raw inventory
    # ingredients and shop products must not appear here (task 1). They
    # remain sellable via the Items tab / direct item lines, and still exist
    # in the database — only excluded from menu display.
    return items_out
