# OpenCode Master Prompt — Invento Lite

You are the lead engineer responsible for building **Invento Lite**, a practical inventory, sales, purchase, expense and reporting system for a real client.

## Read First

Before writing code, read these project documents:

- `01_PRODUCT_REQUIREMENTS.md`
- `02_TECHNICAL_DESIGN.md`
- `03_UI_UX_DESIGN.md`
- `04_IMPLEMENTATION_PLAN.md`

Also inspect the repository's own:
- `AGENTS.md`
- README
- package configuration
- existing source structure
- environment configuration
- tests

Do not assume the repository is empty or matches this architecture. Inspect first and adapt only where necessary.

---

## Product Context

The client operates:

1. A restaurant
2. A shop

The owner's core requirement is:

> “I want to know what I bought, what I sold, what I have left, where the money went, and how the business is performing.”

The product should solve exactly that.

This is an MVP, not a full ERP.

Do not add complexity simply because enterprise software has it.

---

## Core Workflow

The central operational loop is:

Purchase
→ inventory increases

Sale
→ inventory decreases

Wastage
→ inventory decreases

Adjustment
→ inventory changes with an explicit reason

Expense
→ money-out record

Reports
→ explain what happened

Dashboard
→ summarize what matters now

Every inventory-changing operation must be traceable through an inventory movement ledger.

---

## Business Units

Support:

- Restaurant
- Shop

Do not duplicate the entire application for each.

Use a shared transaction architecture with `business_unit_id`.

---

## Critical Product Rule

The system must never silently modify stock.

Every stock change must have:

- item
- quantity
- movement type
- reference
- timestamp
- user

A cached current-stock field may exist for performance, but the movement history must remain available.

---

## Implementation Strategy

### STEP 1 — DISCOVER

Do not code immediately.

Inspect:

- repository
- existing architecture
- database configuration
- auth
- frontend
- backend
- tests
- deployment

Then produce a concise implementation assessment.

If the repository already contains a partial implementation, reuse it rather than replacing it blindly.

### STEP 2 — FOUNDATION

Implement:

- authentication
- protected application shell
- database connection
- configuration
- common API error handling
- audit foundation

### STEP 3 — MASTER DATA

Implement:

- business units
- categories
- inventory items
- units
- suppliers

Build usable CRUD screens.

### STEP 4 — INVENTORY LEDGER

Implement:

`InventoryMovement`

Support:

- PURCHASE
- SALE
- WASTAGE
- ADJUSTMENT_IN
- ADJUSTMENT_OUT

Make stock traceable.

### STEP 5 — PURCHASES

Implement:

- purchase creation
- purchase items
- totals
- supplier
- payment method
- stock increase
- history

The transaction must not partially complete.

### STEP 6 — SALES

Implement:

- fast item search
- quantity
- price
- total
- payment method
- sale completion
- stock deduction
- sale history

Protect against duplicate submission.

### STEP 7 — WASTAGE AND ADJUSTMENTS

Implement explicit stock-loss/correction workflows.

Never allow silent stock edits.

### STEP 8 — EXPENSES

Implement:

- category
- amount
- payment method
- payee
- description
- date
- optional attachment

### STEP 9 — DASHBOARD

Prioritize:

- Total sales
- Restaurant sales
- Shop sales
- Purchases
- Expenses
- Low stock
- Inventory value
- Recent activity
- Top-selling items

Support:

Today / 7 Days / This Month / Custom

### STEP 10 — REPORTS

Implement:

- Sales
- Purchases
- Inventory
- Stock movements
- Wastage
- Expenses
- Summary

Every major report must support date filtering.

### STEP 11 — EXCEL

Use the project's appropriate backend library, preferably `openpyxl` for Python.

Exports must be readable and formatted.

Do not export raw database dumps.

### STEP 12 — TEST

Test real workflows end-to-end.

Example:

1. Add 50 Coke bottles.
2. Purchase 20.
3. Confirm 70.
4. Sell 5.
5. Confirm 65.
6. Record 2 wastage.
7. Confirm 63.
8. Generate stock movement report.
9. Confirm all movements reconcile.
10. Export Excel.
11. Verify totals.

Repeat with restaurant raw materials and shop products.

---

## Financial Integrity

Do not use uncontrolled floating-point arithmetic for authoritative money calculations.

Use Decimal or integer minor units.

Totals must be calculated consistently on the server.

Client-side totals are for UX only.

---

## Inventory Integrity

Default behavior:

- Do not allow negative stock.
- Validate quantity and unit.
- Reject invalid transactions.
- Prevent duplicate submission.
- Do not hard-delete completed operational transactions.

If a correction is needed, create an adjustment/reversal.

---

## UI Requirements

The application should feel like:

**Owner Control Center**

Not:

- an accounting textbook
- an enterprise ERP
- a gaming dashboard

Priorities:

1. Readability
2. Speed
3. Traceability
4. Useful information
5. Clean visual hierarchy

Main navigation:

- Dashboard
- Sales
- Purchases
- Inventory
- Wastage
- Expenses
- Reports
- Settings

Quick actions:

- New Sale
- Purchase
- Expense
- Wastage
- Adjustment

The New Sale workflow must be particularly fast.

---

## Restaurant and Shop

For Shop:

Product-level deduction:

`1 Pepsi sold → Pepsi -1`

For Restaurant MVP:

Use product/item-level stock unless the requirements explicitly demand recipe-based consumption.

Do NOT implement a complex recipe engine in the first build unless the client workflow proves it is necessary.

Design the data model so recipes can be added later.

---

## API

Follow the technical design document.

Use clear resource naming.

Validate all inputs server-side.

Do not leak stack traces or database internals to clients.

---

## Security

- No hardcoded credentials.
- No secrets in source control.
- Authentication required.
- Validate permissions.
- Protect destructive actions.
- Audit important mutations.
- Avoid hard deletion of financial/inventory records.

---

## UX Requirements

All forms need:

- labels
- validation
- loading states
- disabled duplicate submission
- success feedback
- error feedback

Tables need:

- search
- useful filters
- empty states
- pagination where needed

Mobile support is mandatory.

---

## Do NOT Build Yet

Do not implement unless the existing client requirement explicitly changes:

- full accounting
- payroll
- GST filing
- barcode hardware
- receipt printers
- QR ordering
- customer loyalty
- AI
- advanced forecasting
- SaaS subscriptions
- multi-tenant billing
- complex role matrices
- recipe engine
- Aagomon integration

These are future opportunities, not MVP requirements.

---

## Quality Standard

Do not stop when the code compiles.

For every major feature:

1. Build it.
2. Test the API.
3. Test the UI.
4. Test the database effect.
5. Test the report effect.
6. Test an error case.
7. Test duplicate submission where relevant.
8. Check mobile layout.

---

## Working Method

Work in vertical slices.

Bad approach:

Database for everything
→ backend for everything
→ frontend for everything
→ discover integration problems at the end.

Preferred:

Inventory item
→ UI
→ API
→ database
→ test

Then:

Purchase
→ UI
→ API
→ stock movement
→ test

Then:

Sale
→ UI
→ API
→ stock movement
→ test

Then reports.

---

## Git Discipline

Before changes:

- inspect `git status`
- do not overwrite unrelated work

After meaningful milestones:

- run tests
- run build
- summarize changes

Do not create giant unrelated refactors.

---

## Acceptance Criteria

The implementation is acceptable only when:

### Authentication
- [ ] Login works.
- [ ] Protected routes are protected.

### Master Data
- [ ] Restaurant and Shop exist.
- [ ] Items can be created/edited/deactivated.
- [ ] Categories work.
- [ ] Suppliers work.

### Purchases
- [ ] Purchase can be recorded.
- [ ] Stock increases correctly.
- [ ] Purchase history is visible.

### Sales
- [ ] Sale can be recorded quickly.
- [ ] Stock decreases correctly.
- [ ] Duplicate submission cannot duplicate stock deduction.
- [ ] Sale history is visible.

### Inventory
- [ ] Current stock is visible.
- [ ] Low-stock items are visible.
- [ ] Movement history is traceable.
- [ ] Wastage works.
- [ ] Adjustments work.

### Expenses
- [ ] Expenses can be recorded.
- [ ] Expense reports work.

### Dashboard
- [ ] Sales visible.
- [ ] Purchases visible.
- [ ] Expenses visible.
- [ ] Low stock visible.
- [ ] Restaurant/shop split visible.

### Reports
- [ ] Date filters work.
- [ ] Business-unit filters work.
- [ ] Totals reconcile.
- [ ] Excel export works.

### UX
- [ ] Desktop works at normal 100% zoom.
- [ ] Mobile works.
- [ ] No horizontal overflow.
- [ ] Forms are usable.
- [ ] Errors are understandable.
- [ ] Empty states are clear.

### Integrity
- [ ] Every stock change creates a movement.
- [ ] Operational transactions are not silently deleted.
- [ ] Money calculations are reliable.
- [ ] Audit trail exists for important mutations.

---

## Final Reporting

At the end of each implementation session report:

1. What was inspected
2. What was implemented
3. Files changed
4. Tests executed
5. Test results
6. Known limitations
7. Next recommended implementation step

Never claim something was tested if it was not.

Start with repository discovery and the smallest vertical slice.
