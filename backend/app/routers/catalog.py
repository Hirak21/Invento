from bson import ObjectId
from fastapi import APIRouter, Query

from app.models.catalog import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    SupplierCreate,
    SupplierOut,
    SupplierUpdate,
)
from app.models.user import utc_now
from app.routers.deps import CurrentUser, DBDep
from app.routers.deps import OwnerUser as OwnerDep
from app.utils.audit import log_audit
from app.utils.errors import ConflictError, NotFoundError

router = APIRouter(tags=["catalog"])


# ---------- Categories ----------


def category_out(doc: dict) -> CategoryOut:
    return CategoryOut(
        id=str(doc["_id"]),
        name=doc["name"],
        active=doc.get("active", True),
        created_at=doc["created_at"],
    )


def supplier_out(doc: dict) -> SupplierOut:
    return SupplierOut(
        id=str(doc["_id"]),
        name=doc["name"],
        phone=doc.get("phone"),
        notes=doc.get("notes"),
        active=doc.get("active", True),
        created_at=doc["created_at"],
    )


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(
    db: DBDep,
    user: CurrentUser,
    include_inactive: bool = Query(default=False),
) -> list[CategoryOut]:
    query = {} if include_inactive else {"active": True}
    cursor = db.categories.find(query).sort("name", 1)
    return [category_out(doc) async for doc in cursor]


@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(payload: CategoryCreate, db: DBDep, user: OwnerDep) -> CategoryOut:
    name = payload.name.strip()
    existing = await db.categories.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise ConflictError(f"Category '{name}' already exists.")
    doc = {"name": name, "active": True, "created_at": utc_now()}
    result = await db.categories.insert_one(doc)
    doc["_id"] = result.inserted_id
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="create",
        entity_type="category",
        entity_id=str(result.inserted_id),
        after={"name": name},
    )
    return category_out(doc)


@router.patch("/categories/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: str, payload: CategoryUpdate, db: DBDep, user: OwnerDep
) -> CategoryOut:
    if not ObjectId.is_valid(category_id):
        raise NotFoundError("Category not found.")
    category = await db.categories.find_one({"_id": ObjectId(category_id)})
    if category is None:
        raise NotFoundError("Category not found.")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "name" in updates:
        name = updates["name"].strip()
        duplicate = await db.categories.find_one(
            {"name": {"$regex": f"^{name}$", "$options": "i"}, "_id": {"$ne": category["_id"]}}
        )
        if duplicate:
            raise ConflictError(f"Category '{name}' already exists.")
        updates["name"] = name
    if updates:
        updates["updated_at"] = utc_now()
        await db.categories.update_one({"_id": category["_id"]}, {"$set": updates})
        await log_audit(
            db,
            actor_id=str(user["_id"]),
            actor_username=user["username"],
            action="update",
            entity_type="category",
            entity_id=category_id,
            before={"name": category["name"], "active": category.get("active")},
            after=updates,
        )
    updated = await db.categories.find_one({"_id": category["_id"]})
    return category_out(updated)


# ---------- Suppliers ----------


@router.get("/suppliers", response_model=list[SupplierOut])
async def list_suppliers(
    db: DBDep,
    user: CurrentUser,
    include_inactive: bool = Query(default=False),
) -> list[SupplierOut]:
    query = {} if include_inactive else {"active": True}
    cursor = db.suppliers.find(query).sort("name", 1)
    return [supplier_out(doc) async for doc in cursor]


@router.post("/suppliers", response_model=SupplierOut, status_code=201)
async def create_supplier(payload: SupplierCreate, db: DBDep, user: OwnerDep) -> SupplierOut:
    doc = {
        "name": payload.name.strip(),
        "phone": payload.phone,
        "notes": payload.notes,
        "active": True,
        "created_at": utc_now(),
    }
    result = await db.suppliers.insert_one(doc)
    doc["_id"] = result.inserted_id
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="create",
        entity_type="supplier",
        entity_id=str(result.inserted_id),
        after={"name": doc["name"]},
    )
    return supplier_out(doc)


@router.patch("/suppliers/{supplier_id}", response_model=SupplierOut)
async def update_supplier(
    supplier_id: str, payload: SupplierUpdate, db: DBDep, user: OwnerDep
) -> SupplierOut:
    if not ObjectId.is_valid(supplier_id):
        raise NotFoundError("Supplier not found.")
    supplier = await db.suppliers.find_one({"_id": ObjectId(supplier_id)})
    if supplier is None:
        raise NotFoundError("Supplier not found.")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "name" in updates:
        updates["name"] = updates["name"].strip()
    if updates:
        updates["updated_at"] = utc_now()
        await db.suppliers.update_one({"_id": supplier["_id"]}, {"$set": updates})
        await log_audit(
            db,
            actor_id=str(user["_id"]),
            actor_username=user["username"],
            action="update",
            entity_type="supplier",
            entity_id=supplier_id,
            before={"name": supplier["name"], "active": supplier.get("active")},
            after=updates,
        )
    updated = await db.suppliers.find_one({"_id": supplier["_id"]})
    return supplier_out(updated)
