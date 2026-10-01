from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.models.room import RoomCreate, RoomStatus, room_out_from_doc
from app.services.ledger import is_oid, oid
from app.utils.errors import BusinessRuleError, ConflictError, NotFoundError
from app.utils.money import money_to_str, parse_money


async def create_room(db: AsyncIOMotorDatabase, payload: RoomCreate) -> dict[str, Any]:
    """Create a room number. Rooms are property-level: the number must be
    unique across the property (not just the creating unit) so a room reads
    the same from the Restaurant and the Shop. ``business_unit_id`` is kept
    as the creating unit for backwards compatibility (existing records
    untouched) but is not used to scope reads."""
    if not is_oid(payload.business_unit_id):
        raise BusinessRuleError("Business unit not found.")
    unit = await db.business_units.find_one({"_id": oid(payload.business_unit_id)})
    if unit is None or not unit.get("active", True):
        raise BusinessRuleError("Business unit not found or inactive.")

    number = payload.room_number.strip()
    if not number:
        raise BusinessRuleError("Room number cannot be empty.")

    existing = await db.rooms.find_one({"room_number": number, "active": True})
    if existing:
        raise ConflictError(f"Room '{number}' already exists in this property.")

    doc = {
        "business_unit_id": payload.business_unit_id,
        "room_number": number,
        "status": RoomStatus.FREE.value,
        "active": True,
        "created_at": datetime.now(UTC),
    }
    try:
        result = await db.rooms.insert_one(doc)
    except DuplicateKeyError:
        raise ConflictError(f"Room '{number}' already exists in this property.") from None
    doc["_id"] = result.inserted_id
    return doc


async def list_rooms(
    db: AsyncIOMotorDatabase,
    *,
    business_unit_id: str | None = None,
    status: RoomStatus | None = None,
    active: bool | None = True,
) -> list[dict[str, Any]]:
    """Rooms are property-level: omitting ``business_unit_id`` returns every
    room (the order modals use this so a Restaurant sale can charge a room
    created under any unit). Passing a unit still filters — kept for the
    Rooms page unit filter and backwards compatibility."""
    query: dict[str, Any] = {}
    if business_unit_id:
        if not is_oid(business_unit_id):
            return []
        query["business_unit_id"] = business_unit_id
    if status is not None:
        query["status"] = status.value
    if active is not None:
        query["active"] = active
    docs = await db.rooms.find(query).sort([("room_number", 1)]).to_list(None)
    return [room_out_from_doc(doc).model_dump() for doc in docs]


async def update_room(
    db: AsyncIOMotorDatabase,
    room_id: str,
    *,
    room_number: str | None = None,
    active: bool | None = None,
) -> dict[str, Any]:
    if not is_oid(room_id):
        raise NotFoundError("Room not found.")
    room = await db.rooms.find_one({"_id": oid(room_id)})
    if room is None:
        raise NotFoundError("Room not found.")

    updates: dict[str, Any] = {}
    if room_number is not None:
        number = room_number.strip()
        if not number:
            raise BusinessRuleError("Room number cannot be empty.")
        if number != room["room_number"]:
            dup = await db.rooms.find_one(
                {
                    "room_number": number,
                    "active": True,
                    "_id": {"$ne": room["_id"]},
                }
            )
            if dup:
                raise ConflictError(f"Room '{number}' already exists in this property.")
            updates["room_number"] = number
    if active is not None:
        if active is False and room.get("status") == RoomStatus.OCCUPIED.value:
            raise BusinessRuleError("Cannot deactivate an occupied room. Check the guest out first.")
        updates["active"] = active

    if not updates:
        return room
    await db.rooms.update_one({"_id": room["_id"]}, {"$set": updates})
    updated = await db.rooms.find_one({"_id": room["_id"]})
    assert updated is not None
    return updated


async def _sync_room_status(db: AsyncIOMotorDatabase, room_id: Any) -> None:
    """Room is occupied iff an open stay references it (single source of truth)."""
    open_stay = await db.stays.find_one({"room_id": str(room_id), "status": "open"})
    new_status = RoomStatus.OCCUPIED.value if open_stay else RoomStatus.FREE.value
    await db.rooms.update_one({"_id": room_id}, {"$set": {"status": new_status}})


async def check_in(
    db: AsyncIOMotorDatabase,
    payload_room_id: str,
    guest_name: str,
) -> dict[str, Any]:
    """Open a stay on a free room. One open stay per room, enforced atomically."""
    if not is_oid(payload_room_id):
        raise NotFoundError("Room not found.")
    room = await db.rooms.find_one({"_id": oid(payload_room_id)})
    if room is None or not room.get("active", True):
        raise NotFoundError("Room not found.")
    if room.get("status") == RoomStatus.OCCUPIED.value:
        raise ConflictError(f"Room '{room['room_number']}' is already occupied.")

    name = guest_name.strip()
    if not name:
        raise BusinessRuleError("Guest name is required.")

    now = datetime.now(UTC)
    doc = {
        "business_unit_id": room["business_unit_id"],
        "room_id": str(room["_id"]),
        "room_number": room["room_number"],
        "guest_name": name,
        "status": "open",
        "checked_in_at": now,
        "checked_out_at": None,
    }
    # Reservation-style insert: the unique partial index on
    # {room_id, status: "open"} makes a double check-in impossible even under
    # concurrent requests. If it loses the race, the second insert fails.
    try:
        result = await db.stays.insert_one(doc)
    except DuplicateKeyError:
        raise ConflictError(f"Room '{room['room_number']}' is already occupied.") from None
    doc["_id"] = result.inserted_id
    await _sync_room_status(db, room["_id"])
    return doc


async def get_stay_with_bill(db: AsyncIOMotorDatabase, stay_id: str) -> dict[str, Any]:
    """Stay detail + open room charges (room-charge sales) + bill total."""
    if not is_oid(stay_id):
        raise NotFoundError("Stay not found.")
    stay = await db.stays.find_one({"_id": oid(stay_id)})
    if stay is None:
        raise NotFoundError("Stay not found.")

    charges_cursor = (
        db.sales.find({"stay_id": str(stay["_id"]), "payment_method": "room_charge"})
        .sort("sold_at", 1)
    )
    charges: list[dict[str, Any]] = []
    total = Decimal("0.00")
    async for doc in charges_cursor:
        total += parse_money(doc.get("total_amount", "0.00"))
        charges.append(
            {
                "id": str(doc["_id"]),
                "sale_number": doc.get("sale_number", ""),
                "items": [
                    {
                        "item_name": line.get("item_name", ""),
                        "quantity": line.get("quantity", 0),
                        "unit_price": line.get("unit_price", "0.00"),
                        "line_total": line.get("line_total", "0.00"),
                    }
                    for line in doc.get("items", [])
                ],
                "discount": doc.get("discount", "0.00"),
                "total_amount": doc.get("total_amount", "0.00"),
                "sold_at": doc.get("sold_at"),
                "created_by_username": doc.get("created_by_username"),
            }
        )

    return {
        "stay": {
            "id": str(stay["_id"]),
            "business_unit_id": stay["business_unit_id"],
            "room_id": stay["room_id"],
            "room_number": stay.get("room_number", ""),
            "guest_name": stay["guest_name"],
            "status": stay["status"],
            "checked_in_at": stay["checked_in_at"],
            "checked_out_at": stay.get("checked_out_at"),
        },
        "charges": charges,
        "charges_total": money_to_str(total),
        "charge_count": len(charges),
    }


async def checkout(
    db: AsyncIOMotorDatabase,
    stay_id: str,
    *,
    payment_method: str,
    mark_charges_paid: bool = True,
) -> dict[str, Any]:
    """Settle the open bill and close the stay.

    The charges are room-charge sales created at order time; settlement marks
    them paid via sale-level fields (never rewrites amounts or items).
    """
    from app.models.sale import SalePaymentMethod
    from app.utils.errors import BusinessRuleError as BRE

    if not is_oid(stay_id):
        raise NotFoundError("Stay not found.")
    stay = await db.stays.find_one({"_id": oid(stay_id)})
    if stay is None:
        raise NotFoundError("Stay not found.")
    if stay["status"] != "open":
        raise ConflictError("This stay is already checked out.")

    bill = await get_stay_with_bill(db, stay_id)
    if bill["charge_count"] == 0:
        # Guests may leave without dining — nothing to settle, still close the stay.
        pass

    now = datetime.now(UTC)
    if mark_charges_paid:
        # Sale-level settlement fields: additive, no amount/item rewrites.
        await db.sales.update_many(
            {"stay_id": str(stay["_id"]), "payment_method": "room_charge", "charge_settled": {"$ne": True}},
            {
                "$set": {
                    "charge_settled": True,
                    "settled_at": now,
                    "settled_via": payment_method,
                }
            },
        )
    await db.stays.update_one(
        {"_id": stay["_id"]},
        {"$set": {"status": "closed", "checked_out_at": now, "settled_via": payment_method}},
    )
    await _sync_room_status(db, oid(stay["room_id"]))
    updated = await db.stays.find_one({"_id": stay["_id"]})
    assert updated is not None
    return updated
