"""Build a downloadable xlsx report from operational data.

Money is computed server-side (rule #3). Amount columns are numeric so the
Summary sheet can use live Excel formulas tracing back to detail sheets.

Accounting treatment (confirmed): purchases are cash outflow when bought, so
wastage (cost value of already-purchased stock) is a NON-CASH memo line.
Cash P&L excludes wastage; Adjusted P&L shows it separately to avoid
double-counting the same goods.
"""
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
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
_NOTE_FONT = Font(italic=True, size=10)
_MONEY_FMT = '#,##0.00'


def _num(value: Any) -> float:
    """Money value as float for Excel SUM formulas. Strings stay strings elsewhere."""
    if value is None:
        return 0.0
    try:
        return float(Decimal(str(value)))
    except (InvalidOperation, ValueError, TypeError):
        return 0.0


def _ts(value: Any) -> str:
    if value is None:
        return ""
    try:
        if isinstance(value, datetime):
            return value.strftime("%Y-%m-%d %H:%M")
        return str(value)[:16].replace("T", " ")
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


def _money_cells(ws, col: int, first: int, last: int) -> None:
    for r in range(first, last + 1):
        ws.cell(row=r, column=col).number_format = _MONEY_FMT


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

    sales = await db.sales.find(
        {"sold_at": {"$gte": range_start, "$lt": range_end}, **bu_filter}
    ).sort("sold_at", 1).to_list(None)
    purchases = await db.purchases.find(
        {"purchased_at": {"$gte": range_start, "$lt": range_end}, **bu_filter}
    ).sort("purchased_at", 1).to_list(None)
    expenses = await db.expenses.find(
        {"spent_at": {"$gte": range_start, "$lt": range_end}, **bu_filter}
    ).sort("spent_at", 1).to_list(None)
    wastage = await db.wastage.find(
        {"wasted_at": {"$gte": range_start, "$lt": range_end}, **bu_filter}
    ).sort("wasted_at", 1).to_list(None)
    movements = await db.inventory_movements.find(
        {
            "created_at": {"$gte": range_start, "$lt": range_end},
            **bu_filter,
            "movement_type": {"$in": ["WASTAGE", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"]},
        }
    ).sort("created_at", 1).to_list(None)

    # BU names for readable sheets (ids still stored for traceability).
    bu_names: dict[str, str] = {}
    try:
        async for u in db.business_units.find({}):
            bu_names[str(u["_id"])] = str(u.get("name", ""))
    except Exception:
        pass

    def bu_label(bu_id: Any) -> str:
        bu_id = str(bu_id or "")
        return bu_names.get(bu_id, bu_id)

    wb = Workbook()

    # --- Sales: one row per transaction (itemized in Items col) ---
    ws_sales = wb.active
    ws_sales.title = "Sales"
    sales_headers = ["Sale #", "Timestamp", "Business Unit", "Items", "Subtotal", "Discount", "Total", "Payment"]
    _header_row(ws_sales, sales_headers)
    for r, s in enumerate(sales, start=2):
        items = ", ".join(
            f"{i.get('item_name', '?')} x{i.get('quantity', '?')}" for i in s.get("items", [])
        )
        ws_sales.cell(row=r, column=1, value=s.get("sale_number", ""))
        ws_sales.cell(row=r, column=2, value=_ts(s.get("sold_at", "")))
        ws_sales.cell(row=r, column=3, value=bu_label(s.get("business_unit_id", "")))
        ws_sales.cell(row=r, column=4, value=items)
        ws_sales.cell(row=r, column=5, value=_num(s.get("subtotal", "0")))
        ws_sales.cell(row=r, column=6, value=_num(s.get("discount", "0")))
        ws_sales.cell(row=r, column=7, value=_num(s.get("total_amount", "0")))
        ws_sales.cell(row=r, column=8, value=str(s.get("payment_method", "") or ""))
    s_last = max(2, len(sales) + 1)
    for col in (5, 6, 7):
        _money_cells(ws_sales, col, 2, s_last)
    _autosize(ws_sales)

    # --- Purchases: vendor invoices + raw material inputs ---
    ws_pur = wb.create_sheet(title="Purchases")
    pur_headers = ["Purchase #", "Timestamp", "Business Unit", "Supplier", "Items", "Total", "Payment", "Status"]
    _header_row(ws_pur, pur_headers)
    for r, p in enumerate(purchases, start=2):
        items = ", ".join(
            f"{i.get('item_name', '?')} x{i.get('quantity', '?')} @ {i.get('unit_cost', '?')}"
            for i in p.get("items", [])
        )
        ws_pur.cell(row=r, column=1, value=p.get("purchase_number", ""))
        ws_pur.cell(row=r, column=2, value=_ts(p.get("purchased_at", "")))
        ws_pur.cell(row=r, column=3, value=bu_label(p.get("business_unit_id", "")))
        ws_pur.cell(row=r, column=4, value=p.get("supplier_name") or p.get("supplier_id") or "")
        ws_pur.cell(row=r, column=5, value=items)
        ws_pur.cell(row=r, column=6, value=_num(p.get("total_amount", "0")))
        ws_pur.cell(row=r, column=7, value=str(p.get("payment_method", "") or ""))
        ws_pur.cell(row=r, column=8, value=str(p.get("payment_status", "") or ""))
    p_last = max(2, len(purchases) + 1)
    _money_cells(ws_pur, 6, 2, p_last)
    _autosize(ws_pur)

    # --- Expenses: overheads, utilities, petty cash ---
    ws_exp = wb.create_sheet(title="Expenses")
    exp_headers = ["Expense #", "Timestamp", "Business Unit", "Category", "Description", "Amount", "Payment", "Status"]
    _header_row(ws_exp, exp_headers)
    for r, e in enumerate(expenses, start=2):
        ws_exp.cell(row=r, column=1, value=e.get("expense_number", ""))
        ws_exp.cell(row=r, column=2, value=_ts(e.get("spent_at", "")))
        ws_exp.cell(row=r, column=3, value=bu_label(e.get("business_unit_id", "")))
        ws_exp.cell(row=r, column=4, value=e.get("category", ""))
        ws_exp.cell(row=r, column=5, value=e.get("description", ""))
        ws_exp.cell(row=r, column=6, value=_num(e.get("amount", "0")))
        ws_exp.cell(row=r, column=7, value=str(e.get("payment_method", "") or ""))
        ws_exp.cell(row=r, column=8, value=str(e.get("payment_status", "") or ""))
    e_last = max(2, len(expenses) + 1)
    _money_cells(ws_exp, 6, 2, e_last)
    _autosize(ws_exp)

    # --- Stock & Wastage: shrinkage, discarded goods, adjustments with cost ---
    ws_sw = wb.create_sheet(title="Stock & Wastage")
    sw_headers = ["Date", "Business Unit", "Item", "Type", "Qty", "Unit", "Cost Value", "Reason / Reference", "Notes"]
    _header_row(ws_sw, sw_headers)
    sw_rows: list[list[Any]] = []
    for w in wastage:
        sw_rows.append([
            _ts(w.get("wasted_at", "")),
            bu_label(w.get("business_unit_id", "")),
            w.get("item_name", ""),
            "WASTAGE",
            w.get("quantity", ""),
            w.get("unit", ""),
            _num(w.get("estimated_value", "0")),
            w.get("reason", ""),
            w.get("notes", ""),
        ])
    for m in movements:
        sw_rows.append([
            _ts(m.get("created_at", "")),
            bu_label(m.get("business_unit_id", "")),
            m.get("item_id", ""),
            m.get("movement_type", ""),
            m.get("quantity", ""),
            m.get("unit", ""),
            _num(m.get("unit_cost", "0") or "0"),
            m.get("reference_type", ""),
            m.get("notes", "") or "",
        ])
    for r, row in enumerate(sw_rows, start=2):
        for c, val in enumerate(row, start=1):
            ws_sw.cell(row=r, column=c, value=val)
    sw_last = max(2, len(sw_rows) + 1)
    _money_cells(ws_sw, 7, 2, sw_last)
    _autosize(ws_sw)

    # --- Executive Summary with live formulas ---
    ws = wb.create_sheet(title="Summary", index=0)
    ws["A1"] = "Invento — Executive Summary"
    ws["A1"].font = _TITLE_FONT
    ws["A2"] = f"Period: {range_start.date()} to {range_end.date()} ({period})"
    ws["A3"] = f"Business unit: {bu_names.get(business_unit_id or '', business_unit_id) or 'All'}"
    ws["A4"] = "Wastage is a non-cash memo (stock already paid at purchase) — excluded from cash outflow."
    ws["A4"].font = _NOTE_FONT

    sw = "'Stock & Wastage'"
    rows: list[tuple[str, Any]] = [
        ("Metric", "Value"),
        ("Gross sales (SUM Sales Subtotal)", f"=SUM(Sales!E2:E{s_last})"),
        ("Discounts (SUM Sales Discount)", f"=SUM(Sales!F2:F{s_last})"),
        ("Net sales (SUM Sales Total)", f"=SUM(Sales!G2:G{s_last})"),
        ("Purchases (SUM Purchases Total)", f"=SUM(Purchases!F2:F{p_last})"),
        ("Expenses (SUM Expenses Amount)", f"=SUM(Expenses!F2:F{e_last})"),
        ("Total Outflow — cash (Purchases + Expenses)", "=B10+B11"),
        ("Net Cash Balance (Net sales − cash outflow)", "=B9-B12"),
        ("Wastage memo, non-cash (SUMIF WASTAGE cost)", f'=SUMIF({sw}!D2:D{sw_last},"WASTAGE",{sw}!G2:G{sw_last})'),
        ("Net Balance / Adjusted P&L (Cash − Wastage)", "=B13-B14"),
        ("Margin % on net sales (Adjusted ÷ Net)", '=IF(B9=0,0,B15/B9)'),
        ("Sales via Cash (SUMIF)", f'=SUMIF(Sales!H2:H{s_last},"cash",Sales!G2:G{s_last})'),
        ("Sales via UPI (SUMIF)", f'=SUMIF(Sales!H2:H{s_last},"upi",Sales!G2:G{s_last})'),
        ("Sales via Card (SUMIF)", f'=SUMIF(Sales!H2:H{s_last},"card",Sales!G2:G{s_last})'),
        ("Sale Count", len(sales)),
        ("Purchase Count", len(purchases)),
        ("Expense Count", len(expenses)),
        ("Wastage Entries", len(wastage)),
        ("Adjustment Movements", len(movements)),
    ]
    start = 6
    for r, (metric, val) in enumerate(rows, start=start):
        a = ws.cell(row=r, column=1, value=metric)
        b = ws.cell(row=r, column=2, value=val)
        if r == start:
            a.fill = _HEADER_FILL
            a.font = _HEADER_FONT
            b.fill = _HEADER_FILL
            b.font = _HEADER_FONT
    # Money + percent formatting (B7..B15 money, B16 percent).
    for r in range(start + 1, start + 10):
        ws.cell(row=r, column=2).number_format = _MONEY_FMT
    ws.cell(row=start + 10, column=2).number_format = '0.00%'
    for r in range(start + 11, start + 14):
        ws.cell(row=r, column=2).number_format = _MONEY_FMT
    _autosize(ws)

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
