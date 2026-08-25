# Invento Lite — Implementation Plan

## Phase 0 — Repository Discovery

- [ ] Inspect existing repository.
- [ ] Read AGENTS.md and project instructions.
- [ ] Check current stack.
- [ ] Check git status.
- [ ] Identify reusable components.
- [ ] Identify deployment assumptions.
- [ ] Document anything that conflicts with this plan before changing it.

## Phase 1 — Foundation

- [ ] Create project structure if required.
- [ ] Configure environment variables.
- [ ] Set up database connection.
- [ ] Set up authentication.
- [ ] Create base models/types.
- [ ] Create database indexes.
- [ ] Create error-handling conventions.
- [ ] Create audit logging foundation.

### Deliverable

User can securely log in and reach a protected dashboard shell.

## Phase 2 — Business Units and Master Data

- [ ] Create Restaurant and Shop business units.
- [ ] Create categories.
- [ ] Create inventory items.
- [ ] Add units.
- [ ] Add suppliers.
- [ ] Add minimum stock thresholds.
- [ ] Add opening stock.
- [ ] Build CRUD UI.

### Deliverable

Owner can establish the inventory catalogue.

## Phase 3 — Inventory Ledger

- [ ] Implement InventoryMovement.
- [ ] Implement stock calculation.
- [ ] Implement cached balance only if needed.
- [ ] Add item movement history.
- [ ] Add stock validation.
- [ ] Add low-stock detection.

### Deliverable

Every stock change becomes traceable.

## Phase 4 — Purchases

- [ ] Purchase model.
- [ ] Purchase items.
- [ ] Purchase API.
- [ ] Atomic stock addition.
- [ ] Purchase UI.
- [ ] Purchase history.
- [ ] Supplier filtering.

### Deliverable

Receiving a purchase increases stock and creates a ledger trail.

## Phase 5 — Sales

- [ ] Sale model.
- [ ] Sale items.
- [ ] Fast item search.
- [ ] Payment method.
- [ ] Sale completion.
- [ ] Atomic stock deduction.
- [ ] Idempotency protection.
- [ ] Sale history.

### Deliverable

A completed sale reduces stock exactly once.

## Phase 6 — Wastage and Adjustments

- [ ] Wastage model/API/UI.
- [ ] Adjustment model/API/UI.
- [ ] Reasons.
- [ ] Ledger movements.
- [ ] Audit entries.

### Deliverable

Non-sale stock loss is visible and explainable.

## Phase 7 — Expenses

- [ ] Expense model/API/UI.
- [ ] Categories.
- [ ] Payment methods.
- [ ] Date filtering.
- [ ] Optional receipt attachment.

### Deliverable

Owner can record where money went.

## Phase 8 — Dashboard

- [ ] Sales metrics.
- [ ] Purchases.
- [ ] Expenses.
- [ ] Low stock.
- [ ] Inventory value.
- [ ] Restaurant vs Shop comparison.
- [ ] Recent activity.
- [ ] Top-selling items.

### Deliverable

Owner can understand business status from one screen.

## Phase 9 — Reports

- [ ] Sales report.
- [ ] Purchase report.
- [ ] Inventory report.
- [ ] Stock movement report.
- [ ] Wastage report.
- [ ] Expense report.
- [ ] Summary report.
- [ ] Date filters.
- [ ] Business-unit filters.
- [ ] Excel export.

### Deliverable

Owner can generate useful operational reports without spreadsheets.

## Phase 10 — Validation

Create realistic test data:

Restaurant:
- 10 raw materials
- 5 menu/product items if recipe-less MVP
- purchases
- sales
- wastage
- expenses

Shop:
- 15 products
- purchases
- sales
- expenses

Validate:

- opening stock
- purchase stock increase
- sale stock decrease
- wastage decrease
- adjustment
- reports
- Excel totals

## Phase 11 — Pilot

- [ ] Load agreed initial inventory.
- [ ] Configure business units.
- [ ] Train user.
- [ ] Run alongside existing process temporarily.
- [ ] Compare records.
- [ ] Fix workflow friction.
- [ ] Confirm report usefulness.
- [ ] Establish backup procedure.
- [ ] Establish recovery procedure.

## Phase 12 — Productization Decision

Only after real usage:

- identify repeated requirements
- identify unnecessary features
- identify missing workflows
- decide whether recipe engine is required
- decide whether multi-branch is required
- decide whether this becomes an NTS product

Do not start SaaS productization before validation.

## Definition of Done

The MVP is done when a real user can:

1. Log in.
2. Select Restaurant or Shop.
3. Add inventory.
4. Record a purchase.
5. See stock increase.
6. Record a sale.
7. See stock decrease.
8. Record wastage.
9. Record expense.
10. View dashboard.
11. Filter reports.
12. Export Excel.
13. Trace a stock item's movement.
14. Use the system comfortably on desktop and mobile.

## Development Rule

Build vertical slices.

Do not build every database model first and leave the UI for later.

Preferred sequence:

Master Data → Purchase → Stock → Sale → Stock → Reports.

After each slice, test it end-to-end.
