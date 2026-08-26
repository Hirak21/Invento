from bson import ObjectId
from fastapi import APIRouter

from app.models.business_unit import BusinessUnitCreate, BusinessUnitOut, BusinessUnitUpdate
from app.models.user import utc_now
from app.routers.deps import CurrentUser, DBDep
from app.routers.deps import OwnerUser as OwnerDep
from app.utils.audit import log_audit
from app.utils.errors import ConflictError, NotFoundError

router = APIRouter(prefix="/business-units", tags=["business-units"])


def bu_out(doc: dict) -> BusinessUnitOut:
    return BusinessUnitOut(
        id=str(doc["_id"]),
        name=doc["name"],
        location=doc.get("location"),
        active=doc.get("active", True),
        created_at=doc["created_at"],
    )


@router.get("", response_model=list[BusinessUnitOut])
async def list_business_units(db: DBDep, user: CurrentUser) -> list[BusinessUnitOut]:
    cursor = db.business_units.find().sort("name", 1)
    return [bu_out(doc) async for doc in cursor]


@router.post("", response_model=BusinessUnitOut, status_code=201)
async def create_business_unit(
    payload: BusinessUnitCreate, db: DBDep, user: OwnerDep
) -> BusinessUnitOut:
    existing = await db.business_units.find_one(
        {"name": {"$regex": f"^{payload.name.strip()}$", "$options": "i"}}
    )
    if existing:
        raise ConflictError(f"A business unit named '{payload.name}' already exists.")
    doc = {
        "name": payload.name.strip(),
        "location": payload.location,
        "active": True,
        "created_at": utc_now(),
    }
    result = await db.business_units.insert_one(doc)
    doc["_id"] = result.inserted_id
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="create",
        entity_type="business_unit",
        entity_id=str(result.inserted_id),
        after={"name": doc["name"]},
    )
    return bu_out(doc)


@router.patch("/{unit_id}", response_model=BusinessUnitOut)
async def update_business_unit(
    unit_id: str, payload: BusinessUnitUpdate, db: DBDep, user: OwnerDep
) -> BusinessUnitOut:
    if not ObjectId.is_valid(unit_id):
        raise NotFoundError("Business unit not found.")
    unit = await db.business_units.find_one({"_id": ObjectId(unit_id)})
    if unit is None:
        raise NotFoundError("Business unit not found.")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if updates:
        updates["updated_at"] = utc_now()
        await db.business_units.update_one({"_id": unit["_id"]}, {"$set": updates})
        await log_audit(
            db,
            actor_id=str(user["_id"]),
            actor_username=user["username"],
            action="update",
            entity_type="business_unit",
            entity_id=unit_id,
            before={"name": unit["name"], "active": unit.get("active")},
            after=updates,
        )
    updated = await db.business_units.find_one({"_id": unit["_id"]})
    return bu_out(updated)
