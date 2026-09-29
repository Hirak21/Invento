from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.recipe import MenuItemType, MenuItemOut
from app.models.inventory import item_out_from_doc


async def list_menu_items(
    db: AsyncIOMotorDatabase,
    *,
    business_unit_id: str,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    # (a) Recipes that have selling_price set
    recipe_cursor = db.recipes.find({
        "business_unit_id": business_unit_id,
        "active": True,
    }).sort("name", 1)

    async for recipe in recipe_cursor:
        if not recipe.get("selling_price"):
            continue

        ingredients: list[dict[str, Any]] = []
        async for ing in db.recipe_ingredients.find({"recipe_id": recipe["_id"]}):
            item = await db.inventory_items.find_one({"_id": ing["item_id"]})
            if item is None:
                continue
            ingredients.append({
                "item_name": item["name"],
                "quantity": ing["quantity"],
                "unit": item["base_unit"],
            })

        items.append({
            "id": str(recipe["_id"]),
            "name": recipe["name"],
            "type": MenuItemType.RECIPE.value,
            "recipe_id": str(recipe["_id"]),
            "selling_price": recipe.get("selling_price", "0.00"),
            "business_unit_id": recipe["business_unit_id"],
            "active": recipe.get("active", True),
            "created_at": recipe["created_at"],
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
        items.append({
            "id": str(item["_id"]),
            "name": item["name"],
            "type": MenuItemType.SHOP_PRODUCT.value,
            "recipe_id": None,
            "selling_price": item.get("selling_price", "0.00"),
            "business_unit_id": item["business_unit_id"],
            "active": item.get("active", True),
            "created_at": item["created_at"],
            "ingredient_summary": None,
            "base_unit": item["base_unit"],
        })

    return items
