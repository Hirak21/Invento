from decimal import Decimal
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.recipe import MenuItemType, MenuItemOut, recipe_cost_from_lines
from app.models.inventory import item_out_from_doc
from app.utils.units import to_decimal_number


async def _category_name(db: AsyncIOMotorDatabase, category_id: str | None) -> str | None:
    if not category_id:
        return None
    from app.services.ledger import is_oid, oid

    if not is_oid(category_id):
        return None
    cat = await db.categories.find_one({"_id": oid(category_id)})
    return cat["name"] if cat else None


async def list_menu_items(
    db: AsyncIOMotorDatabase,
    *,
    business_unit_id: str,
) -> list[dict[str, Any]]:
    """Active, saved, sellable menu items for a unit.

    Sellable = active recipe with a selling price AND at least one resolvable
    ingredient (recipes with zero ingredients arenever sellable and are
    excluded). Shop products need a selling price. Availability is computed
    live from current stock (one portion).
    """
    items: list[dict[str, Any]] = []

    # (a) Recipes that are actually sellable.
    recipe_cursor = db.recipes.find({
        "business_unit_id": business_unit_id,
        "active": True,
        "selling_price": {"$ne": None},
    }).sort("name", 1)

    async for recipe in recipe_cursor:
        ingredients: list[dict[str, Any]] = []
        cost_lines: list[dict[str, Any]] = []
        available = True
        async for ing in db.recipe_ingredients.find({"recipe_id": recipe["_id"]}):
            item = await db.inventory_items.find_one({"_id": ing["item_id"]})
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

        items.append({
            "id": str(recipe["_id"]),
            "name": recipe["name"],
            "type": MenuItemType.RECIPE.value,
            "recipe_id": str(recipe["_id"]),
            "selling_price": recipe.get("selling_price", "0.00"),
            "business_unit_id": recipe["business_unit_id"],
            "active": recipe.get("active", True),
            "created_at": recipe["created_at"],
            "category": await _category_name(db, recipe.get("category_id")),
            "available": available,
            "estimated_cost": recipe_cost_from_lines(cost_lines),
            "ingredient_summary": ingredients,
            "base_unit": None,
        })

    # (b) Shop products (inventory items) with selling_price set
    item_cursor = db.inventory_items.find({
        "business_unit_id": business_unit_id,
        "active": True,
        "selling_price": {"$ne": None},
    }).sort("name", 1)

    async for item in item_cursor:
        stock = to_decimal_number(item.get("current_stock", 0))
        items.append({
            "id": str(item["_id"]),
            "name": item["name"],
            "type": MenuItemType.SHOP_PRODUCT.value,
            "recipe_id": None,
            "selling_price": item.get("selling_price", "0.00"),
            "business_unit_id": item["business_unit_id"],
            "active": item.get("active", True),
            "created_at": item["created_at"],
            "category": await _category_name(db, item.get("category_id")),
            "available": stock > 0,
            "estimated_cost": None,
            "ingredient_summary": None,
            "base_unit": item["base_unit"],
        })

    return items
