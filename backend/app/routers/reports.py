from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.routers.deps import CurrentUser, DBDep
from app.services.report_service import (
    build_report_pdf_bytes,
    build_report_workbook,
    build_sales_summary,
)

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary")
async def sales_summary(
    db: DBDep,
    user: CurrentUser,
    period: str = Query(default="month", pattern="^(today|7d|month|custom)$"),
    date_from: str | None = Query(default=None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str | None = Query(default=None, alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    business_unit_id: str | None = None,
    tz_offset_minutes: int = 0,
) -> dict[str, Any]:
    """JSON sales totals + per-item breakdown for any range.

    Custom ranges are IST calendar days (00:00:00.000 → 23:59:59.999
    Asia/Kolkata). Top totals equal the sum of the rows; empty ranges
    return zeros.
    """
    return await build_sales_summary(
        db,
        period=period,
        date_from=date_from,
        date_to=date_to,
        business_unit_id=business_unit_id,
        tz_offset_minutes=tz_offset_minutes,
    )


@router.get("/export")
async def export_report(
    db: DBDep,
    user: CurrentUser,
    period: str = Query(default="month", pattern="^(today|7d|month|custom)$"),
    date_from: str | None = Query(default=None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str | None = Query(default=None, alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    business_unit_id: str | None = None,
    tz_offset_minutes: int = 0,
) -> StreamingResponse:
    """Download an xlsx report for the selected period (owner/staff scoped to their BU)."""
    data = await build_report_workbook(
        db,
        period=period,
        date_from=date_from,
        date_to=date_to,
        business_unit_id=business_unit_id,
        tz_offset_minutes=tz_offset_minutes,
    )
    filename = f"invento-report-{period}-{date_from or date_to or 'export'}.xlsx"
    return StreamingResponse(
        iter([data]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export-pdf")
async def export_report_pdf(
    db: DBDep,
    user: CurrentUser,
    period: str = Query(default="month", pattern="^(today|7d|month|custom)$"),
    date_from: str | None = Query(default=None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str | None = Query(default=None, alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    business_unit_id: str | None = None,
    tz_offset_minutes: int = 0,
) -> StreamingResponse:
    """Download a PDF mirror of the xlsx report (same sections/columns).

    Landscape A4, repeating headers, rows kept together so pages never slice
    a row in half — aligned with the Excel layout.
    """
    data = await build_report_pdf_bytes(
        db,
        period=period,
        date_from=date_from,
        date_to=date_to,
        business_unit_id=business_unit_id,
        tz_offset_minutes=tz_offset_minutes,
    )
    filename = f"invento-report-{period}-{date_from or date_to or 'export'}.pdf"
    return StreamingResponse(
        iter([data]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
