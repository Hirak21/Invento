"""Build downloadable xlsx and PDF executive-summary reports.

Money is computed server-side (rule #3). Amount columns are numeric so the
Summary sheet can use live Excel formulas tracing back to detail sheets.
All display amounts use the shared Indian-grouping formatter (format_inr).

Accounting treatment (confirmed): purchases are cash outflow when bought, so
wastage (cost value of already-purchased stock) is a NON-CASH memo line.
Cash P&L excludes wastage; Adjusted P&L shows it separately to avoid
double-counting the same goods.

Export filters mirror /reports/summary: completed sales only, cancelled
orders excluded (stock restored), half-open [start, end) ranges.
"""
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.services.dashboard_service import resolve_period
from app.utils.money import format_inr

_HEADER_FILL = PatternFill("solid", fgColor="1F2937")
_HEADER_FONT = Font(bold=True, color="FFFFFF")
_TITLE_FONT = Font(bold=True, size=14)
_NOTE_FONT = Font(italic=True, size=10)
_SECTION_FONT = Font(bold=True, size=11, color="1F2937")
# Indian digit grouping (1,23,456.00) — matches the PDF/format_inr output.
_MONEY_FMT = '#,##,##0.00'

_PERIOD_LABELS = {"today": "day", "7d": "week", "month": "month", "custom": "custom"}


def _period_label(period: str) -> str:
    return _PERIOD_LABELS.get(period, period)


def _inclusive_date(range_end: datetime) -> Any:
    """Last inclusive calendar day of a half-open [start, end) range."""
    return (range_end - timedelta(microseconds=1)).date()


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
    data = await collect_report_data(
        db, period=period, date_from=date_from, date_to=date_to,
        business_unit_id=business_unit_id, tz_offset_minutes=tz_offset_minutes,
    )
    range_start = data["range_start"]
    range_end = data["range_end"]
    sales = data["sales"]
    purchases = data["purchases"]
    expenses = data["expenses"]
    wastage = data["wastage"]
    movements = data["movements"]
    bu_names: dict[str, str] = data["bu_names"]

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
    ws["A2"] = f"Period: {range_start.date()} to {_inclusive_date(range_end)} ({_period_label(period)})"
    ws["A3"] = f"Business Unit: {bu_names.get(business_unit_id or '', business_unit_id) or 'All'}"

    sw = "'Stock & Wastage'"
    srow = 5

    def section(title: str) -> None:
        nonlocal srow
        ws.cell(row=srow, column=1, value=title).font = _SECTION_FONT
        srow += 1

    def metric(label: str, value: Any, *, money: bool = True) -> int:
        nonlocal srow
        ws.cell(row=srow, column=1, value=label)
        cell = ws.cell(row=srow, column=2, value=value)
        if money:
            cell.number_format = _MONEY_FMT
        r = srow
        srow += 1
        return r

    section("METRICS SUMMARY")
    metric("Gross sales", f"=SUM(Sales!E2:E{s_last})")
    metric("Discounts", f"=SUM(Sales!F2:F{s_last})")
    r_net = metric("Net sales", f"=SUM(Sales!G2:G{s_last})")
    r_purch = metric("Purchases", f"=SUM(Purchases!H2:H{p_last})")
    r_exp = metric("Expenses", f"=SUM(Expenses!F2:F{e_last})")
    r_out = metric("Total Outflow (Purchases + Expenses)", f"=B{r_purch}+B{r_exp}")
    r_cash = metric("Net Cash Balance (Net sales - cash outflow)", f"=B{r_net}-B{r_out}")
    r_wastage = metric(
        "Wastage memo (non-cash)",
        f'=SUMIF({sw}!D2:D{sw_last},"WASTAGE",{sw}!G2:G{sw_last})',
    )
    r_adj = metric("Net Balance / Adjusted P&L (Cash - Wastage)", f"=B{r_cash}-B{r_wastage}")
    r_margin = metric("Margin % on net sales", f'=IF(B{r_net}=0,"N/A",B{r_adj}/B{r_net})', money=False)
    ws.cell(row=r_margin, column=2).number_format = "0.00%"
    metric("Sales via Cash", f'=SUMIF(Sales!H2:H{s_last},"cash",Sales!G2:G{s_last})')
    metric("Sales via UPI", f'=SUMIF(Sales!H2:H{s_last},"upi",Sales!G2:G{s_last})')
    metric("Sales via Card", f'=SUMIF(Sales!H2:H{s_last},"card",Sales!G2:G{s_last})')
    note = ws.cell(
        row=srow, column=1,
        value="Wastage is a non-cash memo (stock already paid at purchase) — excluded from cash outflow.",
    )
    note.font = _NOTE_FONT
    srow += 2

    section("OPERATIONAL COUNTS")
    metric("Sale Count", len(sales), money=False)
    metric("Purchase Count", len(purchases), money=False)
    metric("Expense Count", len(expenses), money=False)

    _autosize(ws)

    # Summary is two narrow columns — portrait reads better when printed.
    _setup_print_sheet(ws, landscape=False)
    for sheet in (ws_sales, ws_pur, ws_exp, ws_sw):
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
        {
            "sold_at": {"$gte": range_start, "$lt": range_end},
            # Mirror /reports/summary: completed sales only; cancelled
            # orders had their stock restored and are not revenue.
            "status": "completed",
            "order_status": {"$ne": "CANCELLED"},
            **bu_filter,
        }
    ).sort("sold_at", -1).to_list(None)
    purchases = await db.purchases.find(
        {"purchased_at": {"$gte": range_start, "$lt": range_end}, **bu_filter}
    ).sort("purchased_at", 1).to_list(None)
    expenses = await db.expenses.find(
        {"spent_at": {"$gte": range_start, "$lt": range_end}, **bu_filter}
    ).sort("spent_at", 1).to_list(None)
    wastage = await db.wastage.find(
        {"wasted_at": {"$gte": range_start, "$lt": range_end}, **bu_filter}
    ).sort("wasted_at", 1).to_list(None)
    # Adjustments only — WASTAGE rows come from the wastage collection
    # (with estimated_value); listing the movements too would double-count
    # them in the Stock & Wastage sheet and the wastage memo SUMIF.
    movements = await db.inventory_movements.find(
        {
            "created_at": {"$gte": range_start, "$lt": range_end},
            **bu_filter,
            "movement_type": {"$in": ["ADJUSTMENT_IN", "ADJUSTMENT_OUT"]},
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


def _dec(value: Any) -> Decimal:
    """Tolerant money parse for report math (None/garbage -> 0)."""
    if value is None:
        return Decimal("0")
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def compute_report_totals(
    sales: list[dict[str, Any]],
    purchases: list[dict[str, Any]],
    expenses: list[dict[str, Any]],
    wastage: list[dict[str, Any]],
) -> dict[str, Any]:
    """Exact Decimal totals for the executive summary (used by the PDF).

    Invariants: net == gross - discounts; outflow == purchases + expenses;
    cash == net - outflow; adjusted == cash - wastage; the payment split
    sums back to net (cash + upi + card + any other methods). Margin is
    None when net sales are zero (displayed as "N/A").
    """
    gross = sum((_dec(s.get("subtotal", "0")) for s in sales), Decimal("0"))
    discounts = sum((_dec(s.get("discount", "0")) for s in sales), Decimal("0"))
    net = sum((_dec(s.get("total_amount", "0")) for s in sales), Decimal("0"))
    purch_total = sum((_dec(p.get("total_amount", "0")) for p in purchases), Decimal("0"))
    exp_total = sum((_dec(e.get("amount", "0")) for e in expenses), Decimal("0"))
    outflow = purch_total + exp_total
    cash = net - outflow
    wastage_memo = sum((_dec(w.get("estimated_value", "0")) for w in wastage), Decimal("0"))
    adjusted = cash - wastage_memo
    payment: dict[str, Decimal] = {}
    for s in sales:
        method = str(s.get("payment_method", "") or "unknown").lower()
        payment[method] = payment.get(method, Decimal("0")) + _dec(s.get("total_amount", "0"))
    margin = None if net == 0 else (adjusted / net * 100)
    return {
        "gross": gross,
        "discounts": discounts,
        "net": net,
        "purchases": purch_total,
        "expenses": exp_total,
        "outflow": outflow,
        "cash": cash,
        "wastage_memo": wastage_memo,
        "adjusted": adjusted,
        "margin_pct": margin,
        "payment": payment,
    }


def build_report_pdf(data: dict[str, Any]) -> bytes:
    """Invento — Executive Summary (A4 portrait).

    Layout: page 1 is a clean executive summary (title + period/BU subtitles,
    METRICS SUMMARY with wastage as a non-cash memo, OPERATIONAL COUNTS);
    a page break separates it from the newest-first sales transactions that
    follow. Type is sized for on-screen viewing and print/PDF download
    (min ~8pt). Every page carries the summary footer with "Page X of Y".
    Long item names wrap (Paragraph) — never truncated. All money uses the
    shared Indian-grouping formatter (format_inr).
    """
    from xml.sax.saxutils import escape as xml_escape

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as pdf_canvas
    from reportlab.platypus import (
        HRFlowable,
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
    bu_names: dict[str, str] = data.get("bu_names", {})
    period = data.get("period", "")
    range_start = data["range_start"]
    range_end = data["range_end"]
    business_unit_id = data.get("business_unit_id")

    def bu_label(bu_id: Any) -> str:
        bu_id = str(bu_id or "")
        return bu_names.get(bu_id, bu_id)

    totals = compute_report_totals(sales, purchases, expenses, wastage)

    buf = BytesIO()
    page_w, _page_h = A4
    margin = 16 * mm
    usable = page_w - 2 * margin

    class NumberedCanvas(pdf_canvas.Canvas):
        """Two-pass canvas so every page can print 'Page X of Y'."""

        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, **kwargs)
            self._saved_states: list[dict[str, Any]] = []

        def showPage(self) -> None:
            self._saved_states.append(dict(self.__dict__))
            self._startPage()

        def save(self) -> None:
            total = len(self._saved_states)
            for state in self._saved_states:
                self.__dict__.update(state)
                self.saveState()
                self.setFont("Helvetica", 8)
                self.setFillColor(colors.HexColor("#6B7280"))
                self.drawString(margin, 10 * mm, "Invento — Executive Summary")
                self.drawRightString(
                    page_w - margin, 10 * mm, f"Page {self._pageNumber} of {total}"
                )
                self.restoreState()
                super().showPage()
            super().save()

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=14 * mm,
        bottomMargin=16 * mm,
        title="Invento — Executive Summary",
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("RTitle", parent=styles["Title"], fontSize=20, leading=24, spaceAfter=4)
    sub_style = ParagraphStyle("RSub", parent=styles["Normal"], fontSize=10, leading=13, textColor=colors.HexColor("#4B5563"), spaceAfter=2)
    note_style = ParagraphStyle("RNote", parent=styles["Normal"], fontSize=9, leading=12, textColor=colors.HexColor("#6B7280"), spaceAfter=6)
    h2 = ParagraphStyle("RH2", parent=styles["Heading2"], fontSize=13, leading=16, spaceBefore=10, spaceAfter=5)
    cell_style = ParagraphStyle("RCell", parent=styles["Normal"], fontSize=9, leading=12)
    cell_small = ParagraphStyle("RCellSm", parent=styles["Normal"], fontSize=8, leading=10)
    cell_right = ParagraphStyle("RCellR", parent=cell_style, alignment=2)
    head_style = ParagraphStyle("RHead", parent=styles["Normal"], fontSize=9, leading=12, textColor=colors.white, fontName="Helvetica-Bold")

    def P(text: Any, right: bool = False) -> Paragraph:
        return Paragraph(str(text if text != "" else "—"), cell_right if right else cell_style)

    def H(text: str) -> Paragraph:
        return Paragraph(xml_escape(text), head_style)

    dark = colors.HexColor("#1F2937")
    grid = colors.HexColor("#D1D5DB")

    def styled_table(headers: list[str], rows: list[list[Any]], widths_frac: list[float]) -> Table:
        col_widths = [usable * f for f in widths_frac]
        table_data = [[H(h) for h in headers]]
        for row in rows:
            cells: list[Any] = []
            for val in row:
                if isinstance(val, Paragraph):
                    cells.append(val)
                    continue
                right = isinstance(val, tuple) and val[0] == "R"
                text = val[1] if isinstance(val, tuple) else val
                if right:
                    cells.append(Paragraph(xml_escape(str(text)), cell_right))
                else:
                    style = cell_small if len(str(text)) > 60 else cell_style
                    cells.append(Paragraph(xml_escape(str(text)), style))
            table_data.append(cells)
        t = Table(table_data, colWidths=col_widths, repeatRows=1, splitByRow=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), dark),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.4, grid),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ]))
        return t

    def R(text: str) -> tuple[str, str]:
        return ("R", text)

    def inr(value: Decimal) -> str:
        return format_inr(value)

    story: list[Any] = []
    bu_title = bu_names.get(business_unit_id or "", business_unit_id) or "All"
    story.append(Paragraph("Invento — Executive Summary", title_style))
    story.append(Paragraph(
        f"Period: {range_start.date()} to {_inclusive_date(range_end)} ({_period_label(period)})",
        sub_style,
    ))
    story.append(Paragraph(f"Business Unit: {bu_title}", sub_style))
    story.append(HRFlowable(
        width="100%", thickness=0.8, color=dark,
        spaceBefore=4, spaceAfter=2,
    ))

    metric_rows = [
        ["Gross sales", R(inr(totals["gross"]))],
        ["Discounts", R(inr(totals["discounts"]))],
        ["Net sales", R(inr(totals["net"]))],
        ["Purchases", R(inr(totals["purchases"]))],
        ["Expenses", R(inr(totals["expenses"]))],
        ["Total Outflow (Purchases + Expenses)", R(inr(totals["outflow"]))],
        ["Net Cash Balance (Net sales - cash outflow)", R(inr(totals["cash"]))],
        ["Wastage memo (non-cash)", R(inr(totals["wastage_memo"]))],
        ["Net Balance / Adjusted P&L (Cash - Wastage)", R(inr(totals["adjusted"]))],
        [
            "Margin % on net sales",
            R("N/A" if totals["margin_pct"] is None else f"{totals['margin_pct']:.2f}%"),
        ],
        ["Sales via Cash", R(inr(totals["payment"].get("cash", Decimal("0"))))],
        ["Sales via UPI", R(inr(totals["payment"].get("upi", Decimal("0"))))],
        ["Sales via Card", R(inr(totals["payment"].get("card", Decimal("0"))))],
    ]
    # Supplementary rows so the split stays reconcilable when non-standard
    # methods (room charge, bank transfer, credit) carry revenue.
    for method in sorted(totals["payment"]):
        if method in ("cash", "upi", "card"):
            continue
        amount = totals["payment"][method]
        if amount == 0:
            continue
        metric_rows.append(["Sales via " + method.replace("_", " ").title(), R(inr(amount))])
    story.append(Paragraph("METRICS SUMMARY", h2))
    story.append(styled_table(["Metric", "Value"], metric_rows, [0.70, 0.30]))
    story.append(Paragraph(
        "Wastage is a non-cash memo (stock already paid at purchase) — excluded from cash outflow.",
        note_style,
    ))

    count_rows = [
        ["Sale Count", R(str(len(sales)))],
        ["Purchase Count", R(str(len(purchases)))],
        ["Expense Count", R(str(len(expenses)))],
    ]
    story.append(Paragraph("OPERATIONAL COUNTS", h2))
    story.append(styled_table(["Count", "Value"], count_rows, [0.70, 0.30]))

    # Executive summary owns page 1; detail rows start on a fresh page.
    story.append(PageBreak())

    story.append(Paragraph(f"SALES ({len(sales)}) — RECENT TRANSACTIONS", h2))
    if sales:
        rows = []
        for s in sales:
            items = ", ".join(
                f"{i.get('item_name', '?')} x{i.get('quantity', '?')}" for i in s.get("items", [])
            )
            rows.append([
                s.get("sale_number", ""),
                _ts(s.get("sold_at", "")),
                bu_label(s.get("business_unit_id", "")),
                Paragraph(xml_escape(items), cell_small),
                R(inr(_dec(s.get("subtotal", "0")))),
                R(inr(_dec(s.get("discount", "0")))),
            ])
        story.append(styled_table(
            ["Sale #", "Timestamp", "Business Unit", "Items", "Subtotal", "Discount"],
            rows, [0.12, 0.15, 0.13, 0.30, 0.15, 0.15],
        ))
    else:
        story.append(Paragraph("No sales found for this period.", cell_style))

    story.append(Spacer(1, 6))
    doc.build(story, canvasmaker=NumberedCanvas)
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
