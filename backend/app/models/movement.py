from datetime import datetime

from pydantic import BaseModel


class MovementOut(BaseModel):
    id: str
    item_id: str
    business_unit_id: str
    movement_type: str
    quantity: str
    unit: str
    unit_cost: str | None
    reference_type: str | None
    reference_id: str | None
    notes: str | None
    created_by_username: str | None
    created_at: datetime


class MovementListResponse(BaseModel):
    movements: list[MovementOut]
    total: int
