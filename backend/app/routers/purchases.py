from datetime import UTC, datetime

from bson import ObjectId
from fastapi import APIRouter, Query

from app.models.purchase import (
    PurchaseCreate,
    PurchaseListResponse,
    PurchaseOut,
    purchase_out_from_doc,
)
from app.routers.deps import CurrentUser, DBDep
from app.services.purchase_service import build_purchase_query, create_purchase, get_purchase
from app.utils.audit import log_audit

router = APIRouter(prefix="/purchases", tags=["purchases"])


@router.post("", response_model=PurchaseOut, status_code=201)
async def record_purchase(payload: PurchaseCreate, db: DBDep, user: CurrentUser) -> PurchaseOut:
    """Record a purchase. Safe to retry: an idempotency key prevents duplicates."""
    doc, duplicate = await create_purchase(
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
            entity_type="purchase",
            entity_id=str(doc["_id"]),
            after={"purchase_number": doc["purchase_number"], "total": doc["total_amount"]},
            business_unit_id=doc["business_unit_id"],
        )
    return purchase_out_from_doc(doc)


@router.get("", response_model=PurchaseListResponse)
async def list_purchases(
    db: DBDep,
    user: CurrentUser,
    business_unit_id: str | None = None,
    supplier_id: str | None = None,
    date_from: str | None = Query(default=None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str | None = Query(default=None, alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> PurchaseListResponse:
    query = build_purchase_query(
        business_unit_id=business_unit_id,
        supplier_id=supplier_id,
        date_from=date_from,
        date_to=date_to,
    )
    total = await db.purchases.count_documents(query)
    cursor = db.purchases.find(query).sort("purchased_at", -1).skip(skip).limit(limit)
    purchases = [purchase_out_from_doc(doc) async for doc in cursor]
    return PurchaseListResponse(purchases=purchases, total=total)


@router.get("/{purchase_id}", response_model=PurchaseOut)
async def get_purchase_detail(
    purchase_id: str, db: DBDep, user: CurrentUser
) -> PurchaseOut:
    doc = await get_purchase(db, purchase_id)
    return purchase_out_from_doc(doc)
