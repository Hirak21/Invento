# Reports + Dashboard Subagent Brief — Phase 4

## Context
Invento Lite backend. Full codebase read. Plan at /home/hrk/Projects/Invento/IMPLEMENTATION_PLAN.md. AGENTS.md rules apply.

## What exists now

### Dashboard service (backend/app/services/dashboard_service.py)
build_summary() returns:
- totals: sales, purchases, expenses, sale_count, inventory_value
- business_split: per-BU sales, purchases, expenses
- low_stock: items at/below min_stock_level
- recent_activity: sales + purchases + expenses (last 8)
- top_selling: top 5 items by quantity
- sales_trend: daily sales for period

### Dashboard router (backend/app/routers/dashboard.py)
GET /api/dashboard/summary with period, from, to, business_unit_id, tz_offset_minutes
Periods: today, 7d, month, custom

### Report service (backend/app/services/report_service.py)
build_report_workbook() creates xlsx with 5 sheets:
- Summary: Total Sales, Total Purchases, Total Expenses, Net (Sales - Purchases - Expenses), counts
- Sales: line-by-line
- Purchases: line-by-line
- Expenses: line-by-line
- Movements: stock movement history

### Dashboard frontend (frontend/src/pages/DashboardPage.tsx)
Shows: greeting, period tabs (today/7d/month/custom), + New Sale button, date filters for custom, StatCards (Total Sales, Purchases, Expenses, Low Stock), Sales trend chart, Restaurant vs Shop split, Low stock alerts, Top selling, Recent activity

## What to build

### Task 15: Dashboard service — add wastage + net balance

Modify build_summary() in dashboard_service.py:

1. Add wastage total to totals:
   - Query wastage collection for the period (same date range logic as sales/purchases)
   - Sum estimated_value field
   - Add wastage: str to totals dict

2. Add expenses to business_split:
   - Currently business_split only has sales + purchases per BU
   - Add expenses per BU (same pattern as existing sum_field calls)
   - Each entry in business_split gets: sales, purchases, expenses

3. Add net_balance to totals:
   - net_balance = sales - purchases - expenses - wastage
   - Use Decimal arithmetic (parse_money style)
   - Return as string quantized to 2 decimals

4. Update return type/shape:
   - totals now has: sales, purchases, expenses, wastage, sale_count, inventory_value, net_balance
   - business_split entries now have: business_unit_id, name, sales, purchases, expenses

### Task 16: Dashboard UI — Net Balance card + wastage in activity

Modify frontend/src/pages/DashboardPage.tsx:

1. Add Net Balance StatCard:
   - Position: first card in the primary cards grid (before Total Sales)
   - Shows summary.totals.net_balance
   - Color: green if positive, red if negative, grey if zero
   - Label: "Net Balance" or "Revenue"
   - Note: show breakdown like "Sales - Purchases - Expenses - Wastage"

2. Add wastage to recent_activity:
   - Currently activity only includes sales + purchases + expenses
   - Add wastage records to activity feed (last few)
   - Each wastage entry: type "wastage", label = item_name, amount = estimated_value, at = wasted_at

3. Update DashboardSummary type in frontend/src/services/dashboard.ts:
   - Add wastage: string to totals
   - Add net_balance: string to totals
   - Add expenses: string to each business_split entry (already there? check — current type has expenses in business_split already)
   - Add wastage to recent_activity type (type can be 'sale' | 'purchase' | 'expense' | 'wastage')

### Task 17: Report service — wastage sheet in xlsx

Modify build_report_workbook() in report_service.py:

1. Query wastage for the period (same date range as other queries)
2. Add a new "Wastage" sheet with columns:
   - Wastage #, Date, Business Unit, Item, Quantity, Unit, Reason, Est. Value, Notes
3. Update Summary sheet net calculation:
   - Net = Sales - Purchases - Expenses - Wastage total
   - Add "Total Wastage" row to summary
4. Update filename to reflect wastage inclusion (or keep same)

### Task 18: Stock alerts endpoint

Create backend/app/routers/stock_alerts.py:

GET /api/stock-alerts:
- Returns items below or at min_stock_level
- Query params: business_unit_id (optional), include_out_of_stock (bool, default true)
- Response: list of {
    item_id, item_name, current_stock, min_stock_level, base_unit,
    suggested_reorder_qty: int (e.g. min_stock_level * 2 - current_stock, minimum 0),
    status: "low" | "out"
  }
- Sort by current_stock ascending (most critical first)
- Owner or staff can access

Create backend/app/services/stock_alert_service.py:

get_low_stock_items(db, business_unit_id=None, include_out=True):
- Query inventory_items where current_stock <= min_stock_level
- If include_out is False, exclude current_stock <= 0
- Compute suggested_reorder_qty for each
- Return populated list

Register router in main.py: app.include_router(stock_alerts_router.router, prefix="/api")

### Frontend: StockAlertsPage

Create frontend/src/pages/StockAlertsPage.tsx:

- List low stock items with: name, current stock, min level, unit, status badge (low/out), suggested reorder qty
- Filter by business unit (use useBusinessUnit hook)
- Refresh button
- Empty state when no low stock items
- Link to inventory item detail or purchase page (optional, can be placeholder)

Create frontend/src/services/stockAlerts.ts:

- listStockAlerts(filters): Promise<StockAlert[]>
- StockAlert type definition

Add to frontend/src/pages/PlaceholderPage.tsx or App.tsx routing as needed (check how pages are routed — read App.tsx)

## Type updates needed

frontend/src/services/dashboard.ts — DashboardSummary:
- totals: add wastage, net_balance
- recent_activity: type can be 'sale' | 'purchase' | 'expense' | 'wastage'
- activity entries with type 'wastage' have: number = "", label = item_name, amount = estimated_value, at = wasted_at

frontend/src/types/inventory.ts — add StockAlert type:
- id, item_id, item_name, current_stock, min_stock_level, base_unit, suggested_reorder_qty, status

## Money handling
- All money arithmetic: use Decimal via parse_money/money_to_str patterns from utils/money.py
- Wastage estimated_value is already stored as string in Mongo
- Net balance = sales - purchases - expenses - wastage (all parsed to Decimal, result quantized to 0.01)

## After implementation
1. Run: cd /home/hrk/Projects/Invento/backend && source .venv/bin/activate && pytest -x -v
2. Run: cd /home/hrk/Projects/Invento/frontend && npm run build
3. Fix any failures

## Tests needed
- Dashboard summary includes wastage total
- Dashboard summary business_split includes expenses per BU
- Dashboard summary net_balance = sales - purchases - expenses - wastage
- Stock alerts endpoint returns items below min_stock_level
- Stock alerts suggested_reorder_qty calculation
- Report xlsx includes wastage sheet
- Report xlsx net calculation includes wastage
