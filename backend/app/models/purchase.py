from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from app.utils.money import MoneyAmount


class PaymentMethod(str, Enum):
    CASH = "cash"
    CARD = "card"
    UPI = "upi"
    BANK_TRANSFER = "bank_transfer"
    CREDIT = "credit"


class PaymentStatus(str, Enum):
    PAID = "paid"
    PENDING = "pending"


class PurchaseLineIn(BaseModel):
    item_id: str
    quantity: int = Field(gt=0)
    unit_cost: MoneyAmount


class PurchaseCreate(BaseModel):
    business_unit_id: str
    supplier_id: str | None = None
    items: list[PurchaseLineIn] = Field(min_length=1)
    payment_method: PaymentMethod = PaymentMethod.CASH
    payment_status: PaymentStatus = PaymentStatus.PAID
    reference_number: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=500)
    # ISO date (YYYY-MM-DD). Omit => recorded "now".
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    idempotency_key: str = Field(min_length=8, max_length=64)


class PurchaseLineOut(BaseModel):
    item_id: str
    item_name: str
    quantity: int
    unit: str
    unit_cost: str
    line_total: str


class PurchaseOut(BaseModel):
    id: str
    purchase_number: str
    business_unit_id: str
    supplier_id: str | None
    supplier_name: str | None = None
    items: list[PurchaseLineOut]
    total_amount: str
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    reference_number: str | None
    notes: str | None
    purchased_at: datetime
    created_by_username: str | None


def purchase_out_from_doc(doc: dict) -> PurchaseOut:
    return PurchaseOut(
        id=str(doc["_id"]),
        purchase_number=doc["purchase_number"],
        business_unit_id=doc["business_unit_id"],
        supplier_id=doc.get("supplier_id"),
        supplier_name=doc.get("supplier_name"),
        items=[
            PurchaseLineOut(
                item_id=line["item_id"],
                item_name=line["item_name"],
                quantity=line["quantity"],
                unit=line["unit"],
                unit_cost=line["unit_cost"],
                line_total=line["line_total"],
            )
            for line in doc["items"]
        ],
        total_amount=doc["total_amount"],
        payment_method=PaymentMethod(doc["payment_method"]),
        payment_status=PaymentStatus(doc["payment_status"]),
        reference_number=doc.get("reference_number"),
        notes=doc.get("notes"),
        purchased_at=doc["purchased_at"],
        created_by_username=doc.get("created_by_username"),
    )


class PurchaseListResponse(BaseModel):
    purchases: list[PurchaseOut]
    total: int
