from typing import Annotated

from fastapi import APIRouter, Query

from app.routers.deps import CurrentUser, DBDep
from app.services.stock_alert_service import get_low_stock_items

router = APIRouter(prefix="/stock-alerts", tags=["stock-alerts"])


@router.get("")
async def list_stock_alerts(
    db: DBDep,
    user: CurrentUser,
    business_unit_id: str | None = Query(default=None),
    include_out_of_stock: bool = Query(default=True, alias="include_out_of_stock"),
) -> list[dict]:
    """Return items at or below their minimum stock level, sorted most critical first."""
    return await get_low_stock_items(
        db,
        business_unit_id=business_unit_id,
        include_out=include_out_of_stock,
    )
