from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class RoomStatus(str, Enum):
    FREE = "free"
    OCCUPIED = "occupied"


class RoomCreate(BaseModel):
    business_unit_id: str
    room_number: str = Field(min_length=1, max_length=20)


class RoomOut(BaseModel):
    id: str
    business_unit_id: str
    room_number: str
    status: RoomStatus
    active: bool
    created_at: datetime


def room_out_from_doc(doc: dict) -> RoomOut:
    return RoomOut(
        id=str(doc["_id"]),
        business_unit_id=doc["business_unit_id"],
        room_number=doc["room_number"],
        status=RoomStatus(doc.get("status", RoomStatus.FREE.value)),
        active=doc.get("active", True),
        created_at=doc["created_at"],
    )


class RoomListResponse(BaseModel):
    rooms: list[RoomOut]
    total: int


class StayCheckIn(BaseModel):
    room_id: str
    guest_name: str = Field(min_length=1, max_length=120)


class StayOut(BaseModel):
    id: str
    business_unit_id: str
    room_id: str
    room_number: str
    guest_name: str
    status: str  # "open" | "closed"
    checked_in_at: datetime
    checked_out_at: datetime | None = None


def stay_out_from_doc(doc: dict, room_number: str | None = None) -> StayOut:
    return StayOut(
        id=str(doc["_id"]),
        business_unit_id=doc["business_unit_id"],
        room_id=doc["room_id"],
        room_number=room_number or doc.get("room_number", ""),
        guest_name=doc["guest_name"],
        status=doc["status"],
        checked_in_at=doc["checked_in_at"],
        checked_out_at=doc.get("checked_out_at"),
    )


class StayListResponse(BaseModel):
    stays: list[StayOut]
    total: int
