from typing import Annotated

from fastapi import APIRouter, Query

from app.models.enums import StockStatus
from app.routers.deps import CurrentUser, DBDep
from app.services.dashboard_service import build_summary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def dashboard_summary(
    db: DBDep,
    user: CurrentUser,
    period: str = Query(default="today", pattern="^(today|7d|month|custom)$"),
    date_from: str | None = Query(default=None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str | None = Query(default=None, alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    business_unit_id: str | None = None,
    tz_offset_minutes: int = 0,
) -> dict:
    summary = await build_summary(
        db,
        period=period,
        date_from=date_from,
        date_to=date_to,
        business_unit_id=business_unit_id,
        tz_offset_minutes=tz_offset_minutes,
    )
    # Annotate low-stock status for badge rendering.
    for entry in summary["low_stock"]:
        if entry["current_stock"] <= 0:
            entry["status"] = StockStatus.OUT.value
        else:
            entry["status"] = StockStatus.LOW.value
    return summary
