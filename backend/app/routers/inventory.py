from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, Query

from app.models.inventory import ItemCreate, ItemListResponse, ItemOut, ItemUpdate, item_out_from_doc
from app.models.movement import MovementListResponse, MovementOut
from app.routers.deps import CurrentUser, DBDep
from app.routers.deps import OwnerUser as OwnerDep
from app.services.inventory_service import (
    build_item_query,
    create_item,
    update_item,
)
from app.utils.audit import log_audit
from app.utils.errors import NotFoundError

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("/items", response_model=ItemListResponse)
async def list_items(
    db: DBDep,
    user: CurrentUser,
    business_unit_id: str | None = None,
    category_id: str | None = None,
    search: str | None = None,
    status: str | None = Query(default=None, pattern="^(out|low|healthy)$"),
    include_inactive: bool = False,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> ItemListResponse:
    query = build_item_query(
        business_unit_id=business_unit_id,
        category_id=category_id,
        search=search,
        status=status,
        active=None if include_inactive else True,
    )
    total = await db.inventory_items.count_documents(query)
    cursor = (
        db.inventory_items.find(query).sort("name", 1).skip(skip).limit(limit)
    )
    items = [item_out_from_doc(doc) async for doc in cursor]
    return ItemListResponse(items=items, total=total)


@router.post("/items", response_model=ItemOut, status_code=201)
async def create_inventory_item(
    payload: ItemCreate, db: DBDep, user: OwnerDep
) -> ItemOut:
    doc = await create_item(
        db,
        payload,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
    )
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="create",
        entity_type="inventory_item",
        entity_id=str(doc["_id"]),
        after={"name": doc["name"], "opening_stock": doc["current_stock"]},
        business_unit_id=doc["business_unit_id"],
    )
    return item_out_from_doc(doc)


@router.get("/items/{item_id}", response_model=ItemOut)
async def get_item(item_id: str, db: DBDep, user: CurrentUser) -> ItemOut:
    if not ObjectId.is_valid(item_id):
        raise NotFoundError("Item not found.")
    doc = await db.inventory_items.find_one({"_id": ObjectId(item_id)})
    if doc is None:
        raise NotFoundError("Item not found.")
    return item_out_from_doc(doc)


@router.patch("/items/{item_id}", response_model=ItemOut)
async def patch_item(item_id: str, payload: ItemUpdate, db: DBDep, user: OwnerDep) -> ItemOut:
    doc = await update_item(db, item_id, payload)
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="update",
        entity_type="inventory_item",
        entity_id=item_id,
        after={"name": doc.get("name"), "active": doc.get("active")},
        business_unit_id=doc.get("business_unit_id"),
    )
    return item_out_from_doc(doc)


@router.get("/items/{item_id}/movements", response_model=MovementListResponse)
async def list_item_movements(
    item_id: str,
    db: DBDep,
    user: CurrentUser,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> MovementListResponse:
    if not ObjectId.is_valid(item_id):
        raise NotFoundError("Item not found.")
    item = await db.inventory_items.find_one({"_id": ObjectId(item_id)})
    if item is None:
        raise NotFoundError("Item not found.")

    query: dict[str, Any] = {"item_id": item_id}
    total = await db.inventory_movements.count_documents(query)
    cursor = (
        db.inventory_movements.find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    movements = [
        MovementOut(
            id=str(doc["_id"]),
            item_id=doc["item_id"],
            business_unit_id=doc["business_unit_id"],
            movement_type=doc["movement_type"],
            quantity=str(doc["quantity"]),
            unit=doc["unit"],
            unit_cost=doc.get("unit_cost"),
            reference_type=doc.get("reference_type"),
            reference_id=doc.get("reference_id"),
            notes=doc.get("notes"),
            created_by_username=doc.get("created_by_username"),
            created_at=doc["created_at"],
        )
        async for doc in cursor
    ]
    return MovementListResponse(movements=movements, total=total)
