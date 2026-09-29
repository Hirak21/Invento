from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class RecipeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    business_unit_id: str
    description: str | None = Field(default=None, max_length=500)
    active: bool = True
    selling_price: str | None = Field(default=None)


class RecipeUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    business_unit_id: str | None = None
    description: str | None = Field(default=None, max_length=500)
    active: bool | None = None


class RecipeOut(BaseModel):
    id: str
    name: str
    business_unit_id: str
    description: str | None
    active: bool
    selling_price: str | None = None
    created_at: datetime
    updated_at: datetime


class RecipeIngredientIn(BaseModel):
    item_id: str
    quantity: int = Field(gt=0)
    notes: str | None = Field(default=None, max_length=200)


class RecipeIngredientOut(BaseModel):
    id: str
    recipe_id: str
    item_id: str
    item_name: str
    quantity: int
    unit: str
    notes: str | None


class RecipeWithIngredients(BaseModel):
    recipe: RecipeOut
    ingredients: list[RecipeIngredientOut]


class MenuItemType(str, Enum):
    RECIPE = "recipe"
    SHOP_PRODUCT = "shop_product"


class MenuItemOut(BaseModel):
    id: str
    name: str
    type: MenuItemType
    recipe_id: str | None = None
    selling_price: str
    business_unit_id: str
    active: bool
    created_at: datetime


def _recipe_out_from_doc(doc: dict) -> RecipeOut:
    return RecipeOut(
        id=str(doc["_id"]),
        name=doc["name"],
        business_unit_id=doc["business_unit_id"],
        description=doc.get("description"),
        active=doc.get("active", True),
        selling_price=doc.get("selling_price"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


def _ingredient_out_from_doc(doc: dict, recipe_id: str) -> RecipeIngredientOut:
    return RecipeIngredientOut(
        id=str(doc["_id"]),
        recipe_id=recipe_id,
        item_id=str(doc["item_id"]),
        item_name=doc["item_name"],
        quantity=doc["quantity"],
        unit=doc["unit"],
        notes=doc.get("notes"),
    )
