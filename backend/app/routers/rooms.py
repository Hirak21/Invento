from datetime import datetime

from fastapi import APIRouter, Query

from app.models.room import (
    RoomCreate,
    RoomListResponse,
    RoomOut,
    StayCheckIn,
    StayListResponse,
    StayOut,
    room_out_from_doc,
    stay_out_from_doc,
)
from app.routers.deps import CurrentUser, DBDep, OwnerUser
from app.services.room_service import (
    check_in,
    checkout,
    create_room,
    get_stay_with_bill,
    list_rooms,
    update_room,
)
from app.utils.audit import log_audit
from app.utils.errors import BusinessRuleError, NotFoundError

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.post("", response_model=RoomOut, status_code=201)
async def create_room_endpoint(payload: RoomCreate, db: DBDep, user: OwnerUser) -> RoomOut:
    doc = await create_room(db, payload)
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="create",
        entity_type="room",
        entity_id=str(doc["_id"]),
        after={"room_number": doc["room_number"], "business_unit_id": doc["business_unit_id"]},
        business_unit_id=doc["business_unit_id"],
    )
    return room_out_from_doc(doc)


@router.get("", response_model=RoomListResponse)
async def list_rooms_endpoint(
    db: DBDep,
    user: CurrentUser,
    business_unit_id: str | None = None,
    status: str | None = Query(default=None, pattern="^(free|occupied)$"),
) -> RoomListResponse:
    from app.models.room import RoomStatus

    status_enum = RoomStatus(status) if status else None
    rooms = await list_rooms(db, business_unit_id=business_unit_id, status=status_enum)
    return RoomListResponse(rooms=rooms, total=len(rooms))


@router.patch("/{room_id}", response_model=RoomOut)
async def update_room_endpoint(
    room_id: str,
    db: DBDep,
    user: OwnerUser,
    room_number: str | None = None,
    active: bool | None = None,
) -> RoomOut:
    from app.models.room import room_out_from_doc as out_from_doc

    updated = await update_room(db, room_id, room_number=room_number, active=active)
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="update",
        entity_type="room",
        entity_id=room_id,
        after={"room_number": updated.get("room_number"), "active": updated.get("active")},
        business_unit_id=updated.get("business_unit_id"),
    )
    return out_from_doc(updated)


@router.post("/stays/check-in", response_model=StayOut, status_code=201)
async def check_in_endpoint(payload: StayCheckIn, db: DBDep, user: CurrentUser) -> StayOut:
    stay = await check_in(db, payload.room_id, payload.guest_name)
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="check_in",
        entity_type="stay",
        entity_id=str(stay["_id"]),
        after={"room_number": stay["room_number"], "guest_name": stay["guest_name"]},
        business_unit_id=stay["business_unit_id"],
    )
    return stay_out_from_doc(stay)


@router.get("/stays", response_model=StayListResponse)
async def list_stays_endpoint(
    db: DBDep,
    user: CurrentUser,
    business_unit_id: str | None = None,
    status: str | None = Query(default=None, pattern="^(open|closed)$"),
    limit: int = Query(default=100, ge=1, le=500),
) -> StayListResponse:
    query: dict = {}
    if business_unit_id:
        query["business_unit_id"] = business_unit_id
    if status:
        query["status"] = status
    docs = await db.stays.find(query).sort("checked_in_at", -1).limit(limit).to_list(limit)
    stays = [stay_out_from_doc(doc) for doc in docs]
    return StayListResponse(stays=stays, total=len(stays))


@router.get("/stays/{stay_id}/bill")
async def get_stay_bill_endpoint(stay_id: str, db: DBDep, user: CurrentUser) -> dict:
    return await get_stay_with_bill(db, stay_id)


@router.post("/stays/{stay_id}/checkout", response_model=StayOut)
async def checkout_endpoint(
    stay_id: str,
    db: DBDep,
    user: CurrentUser,
    payment_method: str = Query(default="cash", pattern="^(cash|card|upi|bank_transfer|credit)$"),
) -> StayOut:
    stay = await checkout(db, stay_id, payment_method=payment_method)
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="checkout",
        entity_type="stay",
        entity_id=stay_id,
        after={"room_number": stay.get("room_number"), "settled_via": payment_method},
        business_unit_id=stay.get("business_unit_id"),
    )
    return stay_out_from_doc(stay)
