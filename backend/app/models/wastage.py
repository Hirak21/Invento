from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from app.utils.money import MoneyAmount


class WastageReason(str, Enum):
    SPOILED = "spoiled"
    EXPIRED = "expired"
    DAMAGED = "damaged"
    COOKING_LOSS = "cooking_loss"
    OTHER = "other"


WASTAGE_REASON_LABELS = {
    WastageReason.SPOILED: "Spoiled",
    WastageReason.EXPIRED: "Expired",
    WastageReason.DAMAGED: "Damaged",
    WastageReason.COOKING_LOSS: "Cooking/handling loss",
    WastageReason.OTHER: "Other",
}


class AdjustmentReason(str, Enum):
    PHYSICAL_COUNT = "physical_count"
    DAMAGED_FOUND = "damaged_found"
    EXPIRED_FOUND = "expired_found"
    DATA_ENTRY_ERROR = "data_entry_error"
    OTHER = "other"


ADJUSTMENT_REASON_LABELS = {
    AdjustmentReason.PHYSICAL_COUNT: "Physical count correction",
    AdjustmentReason.DAMAGED_FOUND: "Damaged found during count",
    AdjustmentReason.EXPIRED_FOUND: "Expired found during count",
    AdjustmentReason.DATA_ENTRY_ERROR: "Data entry error",
    AdjustmentReason.OTHER: "Other",
}


class WastageCreate(BaseModel):
    business_unit_id: str
    item_id: str
    quantity: int = Field(gt=0)
    reason: WastageReason
    notes: str | None = Field(default=None, max_length=500)
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    idempotency_key: str = Field(min_length=8, max_length=64)


class WastageOut(BaseModel):
    id: str
    business_unit_id: str
    item_id: str
    item_name: str
    quantity: int
    unit: str
    reason: WastageReason
    estimated_value: str
    notes: str | None
    wasted_at: datetime
    created_by_username: str | None


class WastageListResponse(BaseModel):
    records: list[WastageOut]
    total: int


def wastage_out_from_doc(doc: dict) -> WastageOut:
    return WastageOut(
        id=str(doc["_id"]),
        business_unit_id=doc["business_unit_id"],
        item_id=doc["item_id"],
        item_name=doc.get("item_name", ""),
        quantity=doc["quantity"],
        unit=doc["unit"],
        reason=WastageReason(doc["reason"]),
        estimated_value=doc.get("estimated_value", "0.00"),
        notes=doc.get("notes"),
        wasted_at=doc["wasted_at"],
        created_by_username=doc.get("created_by_username"),
    )


class AdjustmentCreate(BaseModel):
    business_unit_id: str
    item_id: str
    new_quantity: int = Field(ge=0)
    reason: AdjustmentReason
    notes: str | None = Field(default=None, max_length=500)
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    idempotency_key: str = Field(min_length=8, max_length=64)


class AdjustmentOut(BaseModel):
    id: str
    business_unit_id: str
    item_id: str
    item_name: str
    previous_quantity: int
    new_quantity: int
    delta: int
    unit: str
    reason: AdjustmentReason
    notes: str | None
    adjusted_at: datetime
    created_by_username: str | None


class AdjustmentListResponse(BaseModel):
    records: list[AdjustmentOut]
    total: int


def adjustment_out_from_doc(doc: dict) -> AdjustmentOut:
    return AdjustmentOut(
        id=str(doc["_id"]),
        business_unit_id=doc["business_unit_id"],
        item_id=doc["item_id"],
        item_name=doc.get("item_name", ""),
        previous_quantity=doc["previous_quantity"],
        new_quantity=doc["new_quantity"],
        delta=doc["delta"],
        unit=doc["unit"],
        reason=AdjustmentReason(doc["reason"]),
        notes=doc.get("notes"),
        adjusted_at=doc["adjusted_at"],
        created_by_username=doc.get("created_by_username"),
    )
