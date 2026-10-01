from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.enums import ItemType, StockStatus, Unit
from app.utils.money import MoneyAmount


class ItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    sku: str | None = Field(default=None, max_length=40)
    category_id: str
    business_unit_id: str
    item_type: ItemType
    base_unit: Unit
    purchase_price: MoneyAmount
    selling_price: MoneyAmount | None = None
    min_stock_level: int = Field(default=0, ge=0)
    opening_stock: int = Field(default=0, ge=0)
    supplier_id: str | None = None
    notes: str | None = Field(default=None, max_length=500)


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    sku: str | None = Field(default=None, max_length=40)
    category_id: str | None = None
    business_unit_id: str | None = None
    item_type: ItemType | None = None
    base_unit: Unit | None = None
    purchase_price: MoneyAmount | None = None
    selling_price: MoneyAmount | None = None
    min_stock_level: int | None = Field(default=None, ge=0)
    supplier_id: str | None = None
    notes: str | None = Field(default=None, max_length=500)
    active: bool | None = None


class ItemOut(BaseModel):
    id: str
    name: str
    sku: str | None
    category_id: str
    business_unit_id: str
    item_type: ItemType
    base_unit: Unit
    purchase_price: str
    selling_price: str | None
    min_stock_level: int
    # Decimal-safe: whole for legacy integer stocks, fractional once recipe
    # conversions deduct sub-base-unit amounts (e.g. 0.5 kg). Serialized as a
    # JSON number; clients must not assume integrality.
    current_stock: float
    supplier_id: str | None
    notes: str | None
    active: bool
    status: StockStatus
    created_at: datetime


def compute_status(current_stock: float, min_stock_level: int) -> StockStatus:
    if current_stock <= 0:
        return StockStatus.OUT
    if current_stock <= min_stock_level:
        return StockStatus.LOW
    return StockStatus.HEALTHY


def item_out_from_doc(doc: dict) -> ItemOut:
    from app.utils.units import to_decimal_number

    current = float(to_decimal_number(doc.get("current_stock", 0) or 0))
    minimum = doc.get("min_stock_level", 0) or 0
    return ItemOut(
        id=str(doc["_id"]),
        name=doc["name"],
        sku=doc.get("sku"),
        category_id=doc["category_id"],
        business_unit_id=doc["business_unit_id"],
        item_type=ItemType(doc["item_type"]),
        base_unit=Unit(doc["base_unit"]),
        purchase_price=doc["purchase_price"],
        selling_price=doc.get("selling_price"),
        min_stock_level=minimum,
        current_stock=current,
        supplier_id=doc.get("supplier_id"),
        notes=doc.get("notes"),
        active=doc.get("active", True),
        status=compute_status(current, minimum),
        created_at=doc["created_at"],
    )


class ItemListResponse(BaseModel):
    items: list[ItemOut]
    total: int
