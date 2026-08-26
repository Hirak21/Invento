from fastapi import APIRouter, Query

from app.models.sale import SaleCreate, SaleListResponse, SaleOut, sale_out_from_doc
from app.routers.deps import CurrentUser, DBDep
from app.services.sale_service import build_sale_query, create_sale, get_sale
from app.utils.audit import log_audit

router = APIRouter(prefix="/sales", tags=["sales"])


@router.post("", response_model=SaleOut, status_code=201)
async def record_sale(payload: SaleCreate, db: DBDep, user: CurrentUser) -> SaleOut:
    """Complete a sale. Safe to retry via idempotency key; stock deducted once."""
    doc, duplicate = await create_sale(
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
            entity_type="sale",
            entity_id=str(doc["_id"]),
            after={"sale_number": doc["sale_number"], "total": doc["total_amount"]},
            business_unit_id=doc["business_unit_id"],
        )
    return sale_out_from_doc(doc)


@router.get("", response_model=SaleListResponse)
async def list_sales(
    db: DBDep,
    user: CurrentUser,
    business_unit_id: str | None = None,
    date_from: str | None = Query(default=None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str | None = Query(default=None, alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> SaleListResponse:
    query = build_sale_query(
        business_unit_id=business_unit_id,
        date_from=date_from,
        date_to=date_to,
    )
    total = await db.sales.count_documents(query)
    cursor = db.sales.find(query).sort("sold_at", -1).skip(skip).limit(limit)
    sales = [sale_out_from_doc(doc) async for doc in cursor]
    return SaleListResponse(sales=sales, total=total)


@router.get("/{sale_id}", response_model=SaleOut)
async def get_sale_detail(sale_id: str, db: DBDep, user: CurrentUser) -> SaleOut:
    return sale_out_from_doc(await get_sale(db, sale_id))
