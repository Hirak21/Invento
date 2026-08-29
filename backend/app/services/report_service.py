"""Build a downloadable xlsx report from operational data.

Money is formatted server-side (rule #3: money math on the server only). We pull
the same period window the dashboard uses so the export matches what the owner sees.
"""
from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.services.dashboard_service import resolve_period

_HEADER_FILL = PatternFill("solid", fgColor="1F2937")
_HEADER_FONT = Font(bold=True, color="FFFFFF")
_TITLE_FONT = Font(bold=True, size=14)


def _money(value: Any) -> str:
    """Render a Decimal/string money value as INR-style string."""
    if value is None:
        return "0.00"
    try:
        return str(Decimal(str(value)).quantize(Decimal("0.01")))
    except Exception:
        return str(value)


def _autosize(ws, max_width: int = 48) -> None:
    for col_cells in ws.columns:
        length = 0
        letter = get_column_letter(col_cells[0].column)
        for c in col_cells:
            if c.value is not None:
                length = max(length, len(str(c.value)))
        ws.column_dimensions[letter].width = min(max(length + 2, 10), max_width)


def _header_row(ws, headers: list[str], row: int = 1) -> None:
    for idx, h in enumerate(headers, start=1):
        cell = ws.cell(row=row, column=idx, value=h)
        cell.fill = _HEADER_FILL
        cell.font = _HEADER_FONT
        cell.alignment = Alignment(horizontal="left", vertical="center")


async def build_report_workbook(
    db: AsyncIOMotorDatabase,
    *,
    period: str,
    date_from: str | None,
    date_to: str | None,
    business_unit_id: str | None,
    tz_offset_minutes: int = 0,
) -> bytes:
    range_start, range_end = resolve_period(period, date_from, date_to, tz_offset_minutes)
    bu_filter: dict[str, Any] = {}
    if business_unit_id:
        bu_filter["business_unit_id"] = business_unit_id

    # --- Sales ---
    sales = await db.sales.find(
        {"sold_at": {"$gte": range_start, "$lt": range_end}, **bu_filter}
    ).sort("sold_at", 1).to_list(None)
    # --- Purchases ---
    purchases = await db.purchases.find(
        {"purchased_at": {"$gte": range_start, "$lt": range_end}, **bu_filter}
    ).sort("purchased_at", 1).to_list(None)
    # --- Expenses ---
    expenses = await db.expenses.find(
        {"spent_at": {"$gte": range_start, "$lt": range_end}, **bu_filter}
    ).sort("spent_at", 1).to_list(None)
    # --- Movements ---
    movements = await db.inventory_movements.find(
        {"created_at": {"$gte": range_start, "$lt": range_end}, **bu_filter}
    ).sort("created_at", 1).to_list(None)

    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"
    ws["A1"] = "Invento Lite Report"
    ws["A1"].font = _TITLE_FONT
    ws["A2"] = f"Period: {range_start.date()} to {range_end.date()}"
    ws["A3"] = f"Business unit: {business_unit_id or 'All'}"

    total_sales = sum(Decimal(str(s.get("total_amount", "0"))) for s in sales)
    total_purchases = sum(Decimal(str(p.get("total_amount", "0"))) for p in purchases)
    total_expenses = sum(Decimal(str(e.get("amount", "0"))) for e in expenses)
    summary_rows = [
        ["Metric", "Value"],
        ["Total Sales", _money(total_sales)],
        ["Total Purchases", _money(total_purchases)],
        ["Total Expenses", _money(total_expenses)],
        ["Net (Sales - Purchases - Expenses)", _money(total_sales - total_purchases - total_expenses)],
        ["Sale Count", len(sales)],
        ["Purchase Count", len(purchases)],
        ["Expense Count", len(expenses)],
        ["Movement Count", len(movements)],
    ]
    start = 5
    for r, row in enumerate(summary_rows, start=start):
        for c, val in enumerate(row, start=1):
            cell = ws.cell(row=r, column=c, value=val)
            if r == start:
                cell.fill = _HEADER_FILL
                cell.font = _HEADER_FONT
    _autosize(ws)

    def _sheet(name: str, headers: list[str], rows: list[list[Any]]) -> None:
        s = wb.create_sheet(title=name)
        _header_row(s, headers)
        for r, row in enumerate(rows, start=2):
            for c, val in enumerate(row, start=1):
                s.cell(row=r, column=c, value=val)
        _autosize(s)

    _sheet(
        "Sales",
        ["Sale #", "Date", "Business Unit", "Items", "Subtotal", "Discount", "Total", "Payment"],
        [
            [
                s.get("sale_number", ""),
                str(s.get("sold_at", ""))[:10],
                s.get("business_unit_id", ""),
                ", ".join(f"{i.get('item_name','?')}x{i.get('quantity','?')}" for i in s.get("items", [])),
                _money(s.get("subtotal", "0")),
                _money(s.get("discount", "0")),
                _money(s.get("total_amount", "0")),
                s.get("payment_method", ""),
            ]
            for s in sales
        ],
    )
    _sheet(
        "Purchases",
        ["Purchase #", "Date", "Business Unit", "Supplier", "Items", "Total", "Payment", "Status"],
        [
            [
                p.get("purchase_number", ""),
                str(p.get("purchased_at", ""))[:10],
                p.get("business_unit_id", ""),
                p.get("supplier_name") or p.get("supplier_id") or "",
                ", ".join(f"{i.get('item_name','?')}x{i.get('quantity','?')}" for i in p.get("items", [])),
                _money(p.get("total_amount", "0")),
                p.get("payment_method", ""),
                p.get("payment_status", ""),
            ]
            for p in purchases
        ],
    )
    _sheet(
        "Expenses",
        ["Expense #", "Date", "Business Unit", "Category", "Description", "Amount", "Payment", "Status"],
        [
            [
                e.get("expense_number", ""),
                str(e.get("spent_at", ""))[:10],
                e.get("business_unit_id", ""),
                e.get("category", ""),
                e.get("description", ""),
                _money(e.get("amount", "0")),
                e.get("payment_method", ""),
                e.get("payment_status", ""),
            ]
            for e in expenses
        ],
    )
    _sheet(
        "Movements",
        ["Date", "Business Unit", "Item", "Type", "Qty", "Unit", "Reference"],
        [
            [
                str(m.get("created_at", ""))[:19],
                m.get("business_unit_id", ""),
                m.get("item_id", ""),
                m.get("movement_type", ""),
                m.get("quantity", ""),
                m.get("unit", ""),
                m.get("reference_type", ""),
            ]
            for m in movements
        ],
    )

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
