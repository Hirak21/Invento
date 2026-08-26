from fastapi import APIRouter, Query

from app.models.wastage import (
    AdjustmentCreate,
    AdjustmentListResponse,
    AdjustmentOut,
    WastageCreate,
    WastageListResponse,
    WastageOut,
    adjustment_out_from_doc,
    wastage_out_from_doc,
)
from app.routers.deps import CurrentUser, DBDep
from app.services.wastage_service import (
    build_adjustment_query,
    build_wastage_query,
    create_adjustment,
    create_wastage,
)
from app.utils.audit import log_audit

router = APIRouter(tags=["wastage", "adjustments"])


@router.post("/wastage", response_model=WastageOut, status_code=201)
async def record_wastage(payload: WastageCreate, db: DBDep, user: CurrentUser) -> WastageOut:
    doc, duplicate = await create_wastage(
        db,
        payload,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
    )
    if not duplicate:
        await log_audit(
            db,
            actor_id=str(user["_id"]),
            actor_username=user["username"],
            action="create",
            entity_type="wastage",
            entity_id=str(doc["_id"]),
            after={"item": doc.get("item_name"), "quantity": doc["quantity"], "reason": doc["reason"]},
            business_unit_id=doc["business_unit_id"],
        )
    return wastage_out_from_doc(doc)


@router.get("/wastage", response_model=WastageListResponse)
async def list_wastage(
    db: DBDep,
    user: CurrentUser,
    business_unit_id: str | None = None,
    item_id: str | None = None,
    date_from: str | None = Query(default=None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str | None = Query(default=None, alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> WastageListResponse:
    query = build_wastage_query(
        business_unit_id=business_unit_id,
        item_id=item_id,
        date_from=date_from,
        date_to=date_to,
    )
    total = await db.wastage.count_documents(query)
    cursor = db.wastage.find(query).sort("wasted_at", -1).skip(skip).limit(limit)
    return WastageListResponse(
        records=[wastage_out_from_doc(doc) async for doc in cursor], total=total
    )


@router.post("/stock-adjustments", response_model=AdjustmentOut, status_code=201)
async def record_adjustment(payload: AdjustmentCreate, db: DBDep, user: CurrentUser) -> AdjustmentOut:
    """Physical-count correction. Staff limited by policy; owner unlimited."""
    doc, duplicate = await create_adjustment(
        db,
        payload,
        actor_role=user["role"],
        actor_id=str(user["_id"]),
        actor_username=user["username"],
    )
    if not duplicate:
        await log_audit(
            db,
            actor_id=str(user["_id"]),
            actor_username=user["username"],
            action="create",
            entity_type="stock_adjustment",
            entity_id=str(doc["_id"]),
            before={"quantity": doc["previous_quantity"]},
            after={
                "item": doc.get("item_name"),
                "new_quantity": doc["new_quantity"],
                "delta": doc["delta"],
                "reason": doc["reason"],
            },
            business_unit_id=doc["business_unit_id"],
        )
    return adjustment_out_from_doc(doc)


@router.get("/stock-adjustments", response_model=AdjustmentListResponse)
async def list_adjustments(
    db: DBDep,
    user: CurrentUser,
    business_unit_id: str | None = None,
    item_id: str | None = None,
    date_from: str | None = Query(default=None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str | None = Query(default=None, alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> AdjustmentListResponse:
    query = build_adjustment_query(
        business_unit_id=business_unit_id,
        item_id=item_id,
        date_from=date_from,
        date_to=date_to,
    )
    total = await db.stock_adjustments.count_documents(query)
    cursor = db.stock_adjustments.find(query).sort("adjusted_at", -1).skip(skip).limit(limit)
    return AdjustmentListResponse(
        records=[adjustment_out_from_doc(doc) async for doc in cursor], total=total
    )
