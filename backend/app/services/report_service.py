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


def _setup_print_sheet(ws, *, landscape: bool = True, fit_width: int = 1) -> None:
    """Make Excel→PDF/print output match the on-screen layout.

    Landscape A4, fit all columns onto one page width (height flows onto as
    many pages as needed), header row repeated on every printed page, frozen
    top row, and a defined print area so no sheet prints as a blank page.
    """
    from openpyxl.worksheet.properties import PageSetupProperties

    ws.page_setup.orientation = "landscape" if landscape else "portrait"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = fit_width
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_margins.left = 0.35
    ws.page_margins.right = 0.35
    ws.page_margins.top = 0.5
    ws.page_margins.bottom = 0.5
    # Repeat the header row on every printed page + freeze it on screen.
    ws.print_title_rows = "1:1"
    ws.freeze_panes = "A2"
    if ws.max_row and ws.max_column:
        ws.print_area = f"A1:{get_column_letter(ws.max_column)}{ws.max_row}"
    # Wrap the long free-text columns so rows grow instead of columns
    # overflowing the page width (keeps PDF alignment identical).
    for col_cells in ws.columns:
        for c in col_cells:
            if isinstance(c.value, str) and len(c.value) > 40:
                c.alignment = Alignment(
                    horizontal="left", vertical="center", wrap_text=True
                )


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
    pur_headers = ["Purchase #", "Timestamp", "Business Unit", "Supplier", "Items", "Subtotal", "GST", "Total", "Payment", "Status"]
    _header_row(ws_pur, pur_headers)
    for r, p in enumerate(purchases, start=2):
        items = ", ".join(
            f"{i.get('item_name', '?')} x{i.get('quantity', '?')} @ {i.get('unit_cost', '?')}"
            + (f" +{i.get('gst_percent', 0)}% GST" if float(i.get('gst_percent', 0) or 0) else "")
            for i in p.get("items", [])
        )
        ws_pur.cell(row=r, column=1, value=p.get("purchase_number", ""))
        ws_pur.cell(row=r, column=2, value=_ts(p.get("purchased_at", "")))
        ws_pur.cell(row=r, column=3, value=bu_label(p.get("business_unit_id", "")))
        ws_pur.cell(row=r, column=4, value=p.get("supplier_name") or p.get("supplier_id") or "")
        ws_pur.cell(row=r, column=5, value=items)
        ws_pur.cell(row=r, column=6, value=_num(p.get("subtotal_amount", p.get("total_amount", "0"))))
        ws_pur.cell(row=r, column=7, value=_num(p.get("gst_amount", "0")))
        ws_pur.cell(row=r, column=8, value=_num(p.get("total_amount", "0")))
        ws_pur.cell(row=r, column=9, value=str(p.get("payment_method", "") or ""))
        ws_pur.cell(row=r, column=10, value=str(p.get("payment_status", "") or ""))
    p_last = max(2, len(purchases) + 1)
    for col in (6, 7, 8):
        _money_cells(ws_pur, col, 2, p_last)
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
        ("Purchases (SUM Purchases Total)", f"=SUM(Purchases!H2:H{p_last})"),
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

    for sheet in (ws, ws_sales, ws_pur, ws_exp, ws_sw):
        _setup_print_sheet(sheet, landscape=True, fit_width=1)

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def collect_report_data(
    db: AsyncIOMotorDatabase,
    *,
    period: str,
    date_from: str | None,
    date_to: str | None,
    business_unit_id: str | None,
    tz_offset_minutes: int = 0,
) -> dict[str, Any]:
    """Shared data fetch for the xlsx and pdf exports (identical rows)."""
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

    bu_names: dict[str, str] = {}
    try:
        async for u in db.business_units.find({}):
            bu_names[str(u["_id"])] = str(u.get("name", ""))
    except Exception:
        pass

    return {
        "period": period,
        "range_start": range_start,
        "range_end": range_end,
        "business_unit_id": business_unit_id,
        "bu_names": bu_names,
        "sales": sales,
        "purchases": purchases,
        "expenses": expenses,
        "wastage": wastage,
        "movements": movements,
    }


def _fmt_money(amount: float) -> str:
    return f"{amount:,.2f}"


def build_report_pdf(data: dict[str, Any]) -> bytes:
    """PDF mirror of the Excel workbook: same sections, same column order.

    Layout rules (so pages never break mid-row and columns align like Excel):
    - Landscape A4 with balanced margins.
    - Every table uses ``repeatRows=1`` (header on each page) and
      ``splitByRow=1`` (rows keep together, never sliced horizontally).
    - Column widths are proportional to the usable page width (sum == 100%).
    - Long text cells wrap via Paragraph instead of widening the table.
    """
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    sales = data["sales"]
    purchases = data["purchases"]
    expenses = data["expenses"]
    wastage = data["wastage"]
    movements = data["movements"]
    bu_names: dict[str, str] = data.get("bu_names", {})
    period = data.get("period", "")
    range_start = data["range_start"]
    range_end = data["range_end"]
    business_unit_id = data.get("business_unit_id")

    def bu_label(bu_id: Any) -> str:
        bu_id = str(bu_id or "")
        return bu_names.get(bu_id, bu_id)

    buf = BytesIO()
    page_w, page_h = landscape(A4)
    margin = 12 * mm
    usable = page_w - 2 * margin

    def _footer(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#6B7280"))
        canvas.drawString(margin, 10 * mm, f"Invento report · {period} · {range_start.date()} to {range_end.date()}")
        canvas.drawRightString(page_w - margin, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=margin,
        rightMargin=margin,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title="Invento report",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("RTitle", parent=styles["Title"], fontSize=16, spaceAfter=2)
    sub_style = ParagraphStyle("RSub", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#4B5563"), spaceAfter=1)
    note_style = ParagraphStyle("RNote", parent=styles["Normal"], fontSize=7, textColor=colors.HexColor("#6B7280"), spaceAfter=6)
    h2 = ParagraphStyle("RH2", parent=styles["Heading2"], fontSize=12, spaceBefore=8, spaceAfter=4)
    cell_style = ParagraphStyle("RCell", parent=styles["Normal"], fontSize=7, leading=9)
    cell_small = ParagraphStyle("RCellSm", parent=styles["Normal"], fontSize=6.5, leading=8)
    cell_right = ParagraphStyle("RCellR", parent=cell_style, alignment=2)
    head_style = ParagraphStyle("RHead", parent=styles["Normal"], fontSize=7, leading=9, textColor=colors.white, fontName="Helvetica-Bold")

    def P(text: Any, right: bool = False) -> Paragraph:
        return Paragraph(str(text if text != "" else "—"), cell_right if right else cell_style)

    def H(text: str) -> Paragraph:
        return Paragraph(text, head_style)

    dark = colors.HexColor("#1F2937")
    grid = colors.HexColor("#D1D5DB")

    def styled_table(headers: list[str], rows: list[list[Any]], widths_frac: list[float]) -> Table:
        col_widths = [usable * f for f in widths_frac]
        table_data = [[H(h) for h in headers]]
        for row in rows:
            cells: list[Any] = []
            for i, val in enumerate(row):
                right = isinstance(val, tuple) and val[0] == "R"
                text = val[1] if isinstance(val, tuple) else val
                style = cell_small if len(str(text)) > 60 else cell_style
                if right:
                    cells.append(Paragraph(str(text), cell_right))
                else:
                    cells.append(Paragraph(str(text), style))
            table_data.append(cells)
        t = Table(table_data, colWidths=col_widths, repeatRows=1, splitByRow=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), dark),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.4, grid),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        return t

    def R(text: str) -> tuple[str, str]:
        return ("R", text)

    # --- Python-side totals (mirror the Excel SUM formulas) ---
    gross = sum(_num(s.get("subtotal", "0")) for s in sales)
    discounts = sum(_num(s.get("discount", "0")) for s in sales)
    net_sales = sum(_num(s.get("total_amount", "0")) for s in sales)
    purch_total = sum(_num(p.get("total_amount", "0")) for p in purchases)
    exp_total = sum(_num(e.get("amount", "0")) for e in expenses)
    outflow = purch_total + exp_total
    cash_bal = net_sales - outflow
    wastage_memo = sum(_num(w.get("estimated_value", "0")) for w in wastage)
    adjusted = cash_bal - wastage_memo
    margin = (adjusted / net_sales * 100) if net_sales else 0.0

    def _pay_sum(rows: list[dict], key: str, method: str) -> float:
        return sum(_num(r.get(key, "0")) for r in rows if str(r.get("payment_method", "") or "") == method)

    story: list[Any] = []
    bu_title = bu_names.get(business_unit_id or "", business_unit_id) or "All"
    story.append(Paragraph("Invento — Executive Summary", title_style))
    story.append(Paragraph(f"Period: {range_start.date()} to {range_end.date()} ({period}) &nbsp;&nbsp;·&nbsp;&nbsp; Business unit: {bu_title}", sub_style))
    story.append(Paragraph("Wastage is a non-cash memo (stock already paid at purchase) — excluded from cash outflow.", note_style))

    summary_rows = [
        ["Gross sales", R(_fmt_money(gross))],
        ["Discounts", R(_fmt_money(discounts))],
        ["Net sales", R(_fmt_money(net_sales))],
        ["Purchases", R(_fmt_money(purch_total))],
        ["Expenses", R(_fmt_money(exp_total))],
        ["Total Outflow — cash (Purchases + Expenses)", R(_fmt_money(outflow))],
        ["Net Cash Balance (Net sales − cash outflow)", R(_fmt_money(cash_bal))],
        ["Wastage memo, non-cash", R(_fmt_money(wastage_memo))],
        ["Net Balance / Adjusted P&L (Cash − Wastage)", R(_fmt_money(adjusted))],
        ["Margin % on net sales", R(f"{margin:.2f}%")],
        ["Sales via Cash", R(_fmt_money(_pay_sum(sales, "total_amount", "cash")))],
        ["Sales via UPI", R(_fmt_money(_pay_sum(sales, "total_amount", "upi")))],
        ["Sales via Card", R(_fmt_money(_pay_sum(sales, "total_amount", "card")))],
        ["Sale Count", R(str(len(sales)))],
        ["Purchase Count", R(str(len(purchases)))],
        ["Expense Count", R(str(len(expenses)))],
        ["Wastage Entries", R(str(len(wastage)))],
        ["Adjustment Movements", R(str(len(movements)))],
    ]
    story.append(styled_table(["Metric", "Value"], summary_rows, [0.72, 0.28]))

    # --- Sales ---
    story.append(Paragraph(f"Sales ({len(sales)})", h2))
    if sales:
        rows = []
        for s in sales:
            items = ", ".join(f"{i.get('item_name', '?')} x{i.get('quantity', '?')}" for i in s.get("items", []))
            rows.append([
                s.get("sale_number", ""), _ts(s.get("sold_at", "")), bu_label(s.get("business_unit_id", "")),
                items[:220], R(_fmt_money(_num(s.get("subtotal", "0")))),
                R(_fmt_money(_num(s.get("discount", "0")))), R(_fmt_money(_num(s.get("total_amount", "0")))),
                str(s.get("payment_method", "") or ""),
            ])
        story.append(styled_table(
            ["Sale #", "Timestamp", "Business Unit", "Items", "Subtotal", "Discount", "Total", "Payment"],
            rows, [0.11, 0.12, 0.11, 0.28, 0.09, 0.09, 0.10, 0.10],
        ))
    else:
        story.append(Paragraph("No sales found for this period.", cell_style))

    # --- Purchases ---
    story.append(Paragraph(f"Purchases ({len(purchases)})", h2))
    if purchases:
        rows = []
        for p in purchases:
            items = ", ".join(
                f"{i.get('item_name', '?')} x{i.get('quantity', '?')} @ {i.get('unit_cost', '?')}" for i in p.get("items", [])
            )
            rows.append([
                p.get("purchase_number", ""), _ts(p.get("purchased_at", "")), bu_label(p.get("business_unit_id", "")),
                p.get("supplier_name") or p.get("supplier_id") or "", items[:200],
                R(_fmt_money(_num(p.get("subtotal_amount", p.get("total_amount", "0"))))),
                R(_fmt_money(_num(p.get("gst_amount", "0")))), R(_fmt_money(_num(p.get("total_amount", "0")))),
                str(p.get("payment_method", "") or ""), str(p.get("payment_status", "") or ""),
            ])
        story.append(styled_table(
            ["Purchase #", "Timestamp", "Business Unit", "Supplier", "Items", "Subtotal", "GST", "Total", "Payment", "Status"],
            rows, [0.10, 0.10, 0.09, 0.09, 0.24, 0.08, 0.07, 0.08, 0.08, 0.07],
        ))
    else:
        story.append(Paragraph("No purchases found for this period.", cell_style))

    # --- Expenses ---
    story.append(Paragraph(f"Expenses ({len(expenses)})", h2))
    if expenses:
        rows = [
            [e.get("expense_number", ""), _ts(e.get("spent_at", "")), bu_label(e.get("business_unit_id", "")),
             e.get("category", ""), (e.get("description", "") or "")[:200],
             R(_fmt_money(_num(e.get("amount", "0")))), str(e.get("payment_method", "") or ""),
             str(e.get("payment_status", "") or "")]
            for e in expenses
        ]
        story.append(styled_table(
            ["Expense #", "Timestamp", "Business Unit", "Category", "Description", "Amount", "Payment", "Status"],
            rows, [0.11, 0.12, 0.12, 0.11, 0.26, 0.10, 0.09, 0.09],
        ))
    else:
        story.append(Paragraph("No expenses recorded for this period.", cell_style))

    # --- Stock & Wastage ---
    story.append(Paragraph(f"Stock & Wastage ({len(wastage) + len(movements)})", h2))
    sw_rows: list[list[Any]] = []
    for w in wastage:
        sw_rows.append([_ts(w.get("wasted_at", "")), bu_label(w.get("business_unit_id", "")), w.get("item_name", ""),
                        "WASTAGE", str(w.get("quantity", "")), w.get("unit", ""),
                        R(_fmt_money(_num(w.get("estimated_value", "0")))), w.get("reason", ""), (w.get("notes", "") or "")[:160]])
    for m in movements:
        sw_rows.append([_ts(m.get("created_at", "")), bu_label(m.get("business_unit_id", "")), str(m.get("item_id", "")),
                        m.get("movement_type", ""), str(m.get("quantity", "")), m.get("unit", ""),
                        R(_fmt_money(_num(m.get("unit_cost", "0") or "0"))), m.get("reference_type", ""), (m.get("notes", "") or "")[:160]])
    if sw_rows:
        story.append(styled_table(
            ["Date", "Business Unit", "Item", "Type", "Qty", "Unit", "Cost Value", "Reason / Ref", "Notes"],
            sw_rows, [0.11, 0.11, 0.13, 0.11, 0.07, 0.06, 0.10, 0.12, 0.19],
        ))
    else:
        story.append(Paragraph("No wastage or adjustments for this period.", cell_style))

    story.append(Spacer(1, 6))
    _ = PageBreak  # keep import used if sections grow; flow handles breaks
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()


async def build_report_pdf_bytes(
    db: AsyncIOMotorDatabase,
    *,
    period: str,
    date_from: str | None,
    date_to: str | None,
    business_unit_id: str | None,
    tz_offset_minutes: int = 0,
) -> bytes:
    data = await collect_report_data(
        db, period=period, date_from=date_from, date_to=date_to,
        business_unit_id=business_unit_id, tz_offset_minutes=tz_offset_minutes,
    )
    return build_report_pdf(data)


async def build_sales_summary(
    db: AsyncIOMotorDatabase,
    *,
    period: str,
    date_from: str | None,
    date_to: str | None,
    business_unit_id: str | None,
    tz_offset_minutes: int = 0,
) -> dict[str, Any]:
    """Sales totals + per-item breakdown for any range, via one aggregation.

    Gross = SUM(subtotal), discounts = SUM(discount), net = SUM(total_amount)
    (net == gross - discounts; the model has no tax field, so tax is "0.00").
    Cancelled orders are excluded (their stock is restored). The per-item rows
    sum back to the top totals (revenue == gross, qty == total qty). Empty
    ranges return zeros, never NaN/None.
    """
    from app.services.dashboard_service import resolve_period as _resolve

    range_start, range_end = _resolve(period, date_from, date_to, tz_offset_minutes)
    match: dict[str, Any] = {
        "sold_at": {"$gte": range_start, "$lt": range_end},
        "status": "completed",
        "order_status": {"$ne": "CANCELLED"},
    }
    if business_unit_id:
        match["business_unit_id"] = business_unit_id

    pipeline: list[dict[str, Any]] = [
        {"$match": match},
        {"$facet": {
            "totals": [
                {"$group": {
                    "_id": None,
                    "gross": {"$sum": {"$toDecimal": "$subtotal"}},
                    "discounts": {"$sum": {"$toDecimal": {"$ifNull": ["$discount", "0"]}}},
                    "net": {"$sum": {"$toDecimal": "$total_amount"}},
                    "orders": {"$sum": 1},
                }},
            ],
            "lines": [
                {"$unwind": "$items"},
                {"$group": {
                    "_id": "$items.item_id",
                    "item_name": {"$first": "$items.item_name"},
                    "unit": {"$first": "$items.unit"},
                    "quantity_sold": {"$sum": "$items.quantity"},
                    "revenue": {"$sum": {"$toDecimal": "$items.line_total"}},
                    "order_ids": {"$addToSet": "$_id"},
                }},
                {"$project": {
                    "_id": 0,
                    "item_id": "$_id",
                    "item_name": 1,
                    "unit": 1,
                    "quantity_sold": 1,
                    "revenue": 1,
                    "orders": {"$size": "$order_ids"},
                }},
                {"$sort": {"revenue": -1}},
            ],
        }},
    ]
    docs = await db.sales.aggregate(pipeline).to_list(1)
    facet = docs[0] if docs else {"totals": [], "lines": []}

    def _money(value: Any) -> str:
        if value is None:
            return "0.00"
        if hasattr(value, "to_decimal"):
            value = value.to_decimal()
        try:
            return str(Decimal(value).quantize(Decimal("0.01")))
        except (InvalidOperation, ValueError, TypeError):
            return "0.00"

    t = facet["totals"][0] if facet["totals"] else {}
    items = [
        {
            "item_id": row.get("item_id"),
            "item_name": row.get("item_name", ""),
            "unit": row.get("unit", ""),
            "quantity_sold": float(row.get("quantity_sold") or 0),
            "revenue": _money(row.get("revenue")),
            "orders": int(row.get("orders") or 0),
        }
        for row in facet.get("lines", [])
    ]
    total_qty = sum(row["quantity_sold"] for row in items)
    # Display rounding only: storage keeps exact decimals.
    total_qty = round(total_qty, 3)

    return {
        "period": {"from": range_start.isoformat(), "to": range_end.isoformat()},
        "totals": {
            "gross": _money(t.get("gross")),
            "discounts": _money(t.get("discounts")),
            "tax": "0.00",
            "net": _money(t.get("net")),
            "orders": int(t.get("orders") or 0),
            "quantity": total_qty,
        },
        "items": items,
    }
