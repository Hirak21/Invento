from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.utils.money import MoneyAmount


class SalePaymentMethod(str, Enum):
    CASH = "cash"
    CARD = "card"
    UPI = "upi"
    BANK_TRANSFER = "bank_transfer"
    CREDIT = "credit"
    ROOM_CHARGE = "room_charge"


class SaleLineIn(BaseModel):
    item_id: str
    quantity: int = Field(gt=0)
    unit_price: MoneyAmount


class SaleLineOut(BaseModel):
    item_id: str
    item_name: str
    quantity: int
    unit: str
    unit_price: str
    unit_cost: str | None
    line_total: str


class SaleCreate(BaseModel):
    business_unit_id: str
    items: list[SaleLineIn] = Field(min_length=1)
    discount: MoneyAmount | None = None
    payment_method: SalePaymentMethod = SalePaymentMethod.CASH
    reference_number: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=500)
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    recipe_id: str | None = None
    # Charge-to-room: open stay id. Required when payment_method=room_charge.
    stay_id: str | None = None
    idempotency_key: str = Field(min_length=8, max_length=64)


class SaleStatusUpdate(BaseModel):
    status: str = Field(pattern="^(PREPARING|READY|SERVED|CANCELLED)$")


class SaleOut(BaseModel):
    id: str
    sale_number: str
    business_unit_id: str
    items: list[SaleLineOut]
    subtotal: str
    discount: str
    total_amount: str
    payment_method: SalePaymentMethod
    reference_number: str | None
    notes: str | None
    sold_at: datetime
    created_by_username: str | None
    recipe_id: str | None = None
    recipe_name: str | None = None
    stay_id: str | None = None
    room_number: str | None = None
    order_status: str = "PENDING"
    status_history: list[dict[str, Any]] = []
    charge_settled: bool | None = None


class SaleListResponse(BaseModel):
    sales: list[SaleOut]
    total: int


def sale_out_from_doc(doc: dict) -> SaleOut:
    return SaleOut(
        id=str(doc["_id"]),
        sale_number=doc["sale_number"],
        business_unit_id=doc["business_unit_id"],
        items=[
            SaleLineOut(
                item_id=line["item_id"],
                item_name=line["item_name"],
                quantity=line["quantity"],
                unit=line["unit"],
                unit_price=line["unit_price"],
                unit_cost=line.get("unit_cost"),
                line_total=line["line_total"],
            )
            for line in doc["items"]
        ],
        subtotal=doc["subtotal"],
        discount=doc.get("discount", "0.00"),
        total_amount=doc["total_amount"],
        payment_method=SalePaymentMethod(doc["payment_method"]),
        reference_number=doc.get("reference_number"),
        notes=doc.get("notes"),
        sold_at=doc["sold_at"],
        created_by_username=doc.get("created_by_username"),
        recipe_id=doc.get("recipe_id"),
        recipe_name=doc.get("recipe_name"),
        stay_id=doc.get("stay_id"),
        room_number=doc.get("room_number"),
        order_status=doc.get("order_status", "SERVED"),
        status_history=[
            {
                "status": entry.get("status", ""),
                "at": entry.get("at"),
                "by_username": entry.get("by_username", ""),
            }
            for entry in (doc.get("status_history") or [])
        ],
        charge_settled=doc.get("charge_settled"),
    )
