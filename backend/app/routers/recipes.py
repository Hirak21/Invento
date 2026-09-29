from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Query

from app.models.recipe import (
    RecipeCreate,
    RecipeUpdate,
    RecipeWithIngredients,
    RecipeIngredientIn,
    RecipeOut,
    RecipeIngredientOut,
    _recipe_out_from_doc,
)
from app.routers.deps import CurrentUser, DBDep
from app.routers.deps import OwnerUser as OwnerDep
from app.services.recipe_service import (
    add_ingredient,
    create_recipe,
    delete_recipe,
    get_recipe,
    list_recipes,
    remove_ingredient,
    update_recipe,
)
from app.utils.audit import log_audit
from app.utils.errors import NotFoundError


router = APIRouter(prefix="/recipes", tags=["recipes"])


@router.post("", response_model=RecipeWithIngredients, status_code=201)
async def create_recipe_endpoint(
    payload: RecipeCreate,
    db: DBDep,
    user: OwnerDep,
) -> RecipeWithIngredients:
    doc = await create_recipe(
        db,
        payload,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
    )
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="create",
        entity_type="recipe",
        entity_id=str(doc["_id"]),
        after={"name": doc["name"], "business_unit_id": doc["business_unit_id"]},
        business_unit_id=doc["business_unit_id"],
    )
    ingredients: list[RecipeIngredientOut] = []
    return RecipeWithIngredients(recipe=_recipe_out_from_doc(doc), ingredients=ingredients)


@router.get("", response_model=list[RecipeWithIngredients])
async def list_recipes_endpoint(
    db: DBDep,
    user: CurrentUser,
    business_unit_id: str | None = Query(default=None, description="Filter by business unit"),
    active: bool = Query(default=True, description="Filter by active status"),
) -> list[RecipeWithIngredients]:
    recipes = await list_recipes(db, business_unit_id=business_unit_id, active=active)
    result: list[RecipeWithIngredients] = []
    for recipe_doc in recipes:
        # list_recipes returns RecipeOut models, not raw documents.
        recipe_oid = ObjectId(recipe_doc.id)
        ingredients: list[RecipeIngredientOut] = []
        async for ing in db.recipe_ingredients.find({"recipe_id": recipe_oid}):
            item = await db.inventory_items.find_one({"_id": ing["item_id"]})
            if item is None:
                continue
            ingredients.append(RecipeIngredientOut(
                id=str(ing["_id"]),
                recipe_id=str(recipe_oid),
                item_id=str(ing["item_id"]),
                item_name=item["name"],
                quantity=ing["quantity"],
                unit=item["base_unit"],
                notes=ing.get("notes"),
            ))
        result.append(RecipeWithIngredients(
            recipe=recipe_doc,
            ingredients=ingredients,
        ))
    return result


@router.get("/{recipe_id}", response_model=RecipeWithIngredients)
async def get_recipe_endpoint(
    recipe_id: str,
    db: DBDep,
    user: CurrentUser,
) -> RecipeWithIngredients:
    result = await get_recipe(db, recipe_id)
    return RecipeWithIngredients(
        recipe=result["recipe"],
        ingredients=result["ingredients"],
    )


@router.patch("/{recipe_id}", response_model=RecipeWithIngredients)
async def update_recipe_endpoint(
    recipe_id: str,
    payload: RecipeUpdate,
    db: DBDep,
    user: OwnerDep,
) -> RecipeWithIngredients:
    updated = await update_recipe(db, recipe_id, payload)
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="update",
        entity_type="recipe",
        entity_id=recipe_id,
        after={"name": updated.get("name"), "active": updated.get("active")},
        business_unit_id=updated.get("business_unit_id"),
    )
    ingredients: list[RecipeIngredientOut] = []
    async for ing in db.recipe_ingredients.find({"recipe_id": updated["_id"]}):
        item = await db.inventory_items.find_one({"_id": ing["item_id"]})
        if item is None:
            continue
        ingredients.append(RecipeIngredientOut(
            id=str(ing["_id"]),
            recipe_id=recipe_id,
            item_id=str(ing["item_id"]),
            item_name=item["name"],
            quantity=ing["quantity"],
            unit=item["base_unit"],
            notes=ing.get("notes"),
        ))
    return RecipeWithIngredients(
        recipe=_recipe_out_from_doc(updated),
        ingredients=ingredients,
    )


@router.delete("/{recipe_id}", status_code=204)
async def delete_recipe_endpoint(
    recipe_id: str,
    db: DBDep,
    user: OwnerDep,
) -> None:
    if not ObjectId.is_valid(recipe_id):
        raise NotFoundError("Recipe not found")
    recipe = await db.recipes.find_one({"_id": ObjectId(recipe_id)})
    if recipe is None:
        raise NotFoundError("Recipe not found")
    await delete_recipe(db, recipe_id)
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="delete",
        entity_type="recipe",
        entity_id=recipe_id,
        before={"name": recipe["name"]},
        business_unit_id=recipe["business_unit_id"],
    )


@router.post("/{recipe_id}/ingredients", response_model=RecipeWithIngredients, status_code=201)
async def add_ingredient_endpoint(
    recipe_id: str,
    payload: RecipeIngredientIn,
    db: DBDep,
    user: OwnerDep,
) -> RecipeWithIngredients:
    if not ObjectId.is_valid(recipe_id):
        raise NotFoundError("Recipe not found")
    enriched = await add_ingredient(
        db,
        recipe_id,
        payload,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
    )
    recipe = await db.recipes.find_one({"_id": ObjectId(recipe_id)})
    if recipe is None:
        raise NotFoundError("Recipe not found")
    ingredients: list[RecipeIngredientOut] = []
    async for ing in db.recipe_ingredients.find({"recipe_id": recipe["_id"]}):
        item = await db.inventory_items.find_one({"_id": ing["item_id"]})
        if item is None:
            continue
        ingredients.append(RecipeIngredientOut(
            id=str(ing["_id"]),
            recipe_id=recipe_id,
            item_id=str(ing["item_id"]),
            item_name=item["name"],
            quantity=ing["quantity"],
            unit=item["base_unit"],
            notes=ing.get("notes"),
        ))
    return RecipeWithIngredients(
        recipe=_recipe_out_from_doc(recipe),
        ingredients=ingredients,
    )


@router.delete("/{recipe_id}/ingredients/{ingredient_id}", status_code=204)
async def remove_ingredient_endpoint(
    recipe_id: str,
    ingredient_id: str,
    db: DBDep,
    user: OwnerDep,
) -> None:
    if not ObjectId.is_valid(recipe_id):
        raise NotFoundError("Recipe not found")
    recipe = await db.recipes.find_one({"_id": ObjectId(recipe_id)})
    if recipe is None:
        raise NotFoundError("Recipe not found")
    await remove_ingredient(db, recipe_id, ingredient_id)
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="delete",
        entity_type="recipe_ingredient",
        entity_id=ingredient_id,
        business_unit_id=recipe["business_unit_id"],
    )
