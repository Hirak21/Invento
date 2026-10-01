from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.utils.money import MoneyAmount, money_to_str, parse_money
from app.utils.units import to_decimal_number


class RecipeIngredientIn(BaseModel):
    item_id: str
    # Entered quantity in ``unit`` (may be fractional, e.g. 0.5 kg or 500 g).
    quantity: float = Field(gt=0)
    # Entered unit; must be compatible with the stock item's base unit
    # (kg<->g, litre<->ml; pcs/box/packet only self-compatible).
    # Defaults to the item's base unit when omitted (backwards compatible).
    unit: str | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=200)


class RecipeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    business_unit_id: str
    description: str | None = Field(default=None, max_length=500)
    active: bool = True
    selling_price: MoneyAmount | None = Field(default=None)
    category_id: str | None = Field(default=None)
    # Optional inline BOM: when supplied it must contain >= 1 valid line.
    # (Two-step creation — POST recipe then POST ingredients — is still
    # supported; a recipe becomes sellable once it has >= 1 ingredient.)
    ingredients: list[RecipeIngredientIn] | None = Field(default=None)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Recipe name is required.")
        return v

    @field_validator("ingredients")
    @classmethod
    def _ingredients_non_empty(
        cls, v: list[RecipeIngredientIn] | None
    ) -> list[RecipeIngredientIn] | None:
        if v is not None and len(v) == 0:
            raise ValueError("A recipe needs at least one ingredient.")
        return v


class RecipeUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    business_unit_id: str | None = None
    description: str | None = Field(default=None, max_length=500)
    active: bool | None = None
    selling_price: MoneyAmount | None = None
    category_id: str | None = None


class RecipeOut(BaseModel):
    id: str
    name: str
    business_unit_id: str
    description: str | None
    active: bool
    selling_price: str | None = None
    category_id: str | None = None
    # Server-computed ingredient cost (canonical qty x purchase price), "0.00"
    # when the recipe has no ingredients.
    estimated_cost: str | None = None
    created_at: datetime
    updated_at: datetime


class RecipeIngredientOut(BaseModel):
    id: str
    recipe_id: str
    item_id: str
    item_name: str
    # Canonical quantity in the stock item's base unit (exact to 3 decimals).
    quantity: float
    unit: str
    # What the user entered (for display); equals quantity/unit for legacy docs.
    entered_quantity: float
    entered_unit: str
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
    # Sellable-menu extras (additive; None for shop products where N/A).
    category: str | None = None
    available: bool | None = None
    estimated_cost: str | None = None
    # BOM summary for recipe items (kept in the response so the POS can show
    # "500 g Flour"; None for shop products).
    ingredient_summary: list[dict[str, Any]] | None = None
    base_unit: str | None = None


def _recipe_out_from_doc(doc: dict, estimated_cost: str | None = None) -> RecipeOut:
    return RecipeOut(
        id=str(doc["_id"]),
        name=doc["name"],
        business_unit_id=doc["business_unit_id"],
        description=doc.get("description"),
        active=doc.get("active", True),
        selling_price=doc.get("selling_price"),
        category_id=doc.get("category_id"),
        estimated_cost=estimated_cost,
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


def _ingredient_out_from_doc(ing: dict, item: dict, recipe_id: str) -> RecipeIngredientOut:
    """Enrich a raw recipe_ingredients doc (legacy or converted) for the API.

    Legacy docs: ``quantity`` is a number in the item's base unit with no
    ``entered_*`` fields -> entered mirrors canonical (no data change needed).
    Converted docs: ``quantity`` is the canonical base-unit Decimal plus
    ``entered_quantity`` / ``entered_unit`` for display.
    """
    base_unit = item["base_unit"]
    canonical = to_decimal_number(ing["quantity"])
    entered_qty = ing.get("entered_quantity")
    entered_unit = ing.get("entered_unit")
    if entered_qty is None or entered_unit is None:
        entered_qty, entered_unit = canonical, base_unit
    else:
        entered_qty = to_decimal_number(entered_qty)
    return RecipeIngredientOut(
        id=str(ing["_id"]),
        recipe_id=recipe_id,
        item_id=str(ing["item_id"]),
        item_name=item["name"],
        quantity=float(canonical),
        unit=base_unit,
        entered_quantity=float(entered_qty),
        entered_unit=str(entered_unit),
        notes=ing.get("notes"),
    )


def recipe_cost_from_lines(lines: list[dict[str, Any]]) -> str:
    """Sum canonical-qty x purchase-price lines -> money string (2 decimals)."""
    total = Decimal("0.00")
    for line in lines:
        qty = to_decimal_number(line["quantity"])
        price = parse_money(line.get("purchase_price") or "0.00")
        total += qty * price
    return money_to_str(total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
