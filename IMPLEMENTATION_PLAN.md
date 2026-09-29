# Implementation Plan — Invento Upgrade: Reports + Recipe Engine

## Overview

Two bodies of work:

**Part A — Better Reports & Balance Visibility**
- Dashboard: add wastage to totals, add expense to business_split, add a "Net Balance / Revenue" card
- Reports: already has net on Summary sheet — make sure wastage flows into the report too
- Date-range filtering already works (today/7d/month/custom). Just make sure everything is wired consistently.

**Part B — Restaurant Recipe Engine**
- New models: `Recipe` (dish), `RecipeIngredient` (BOM line: recipe + item + quantity), `MenuItem` (sellable unit that can be either a raw item or a recipe)
- Sale flow: select a menu item → if it's a recipe, expand BOM → deduct ingredients → record sale with recipe reference
- Low stock alerts: already exists in dashboard, but need a dedicated "Stock Alerts" page + reorder flow
- Front shop also deducts: already works for direct inventory items; recipe attribution is restaurant side

## Architecture Decisions

1. **Sale model gets a `recipe_id` optional field.** Simple sales (shop) have null recipe_id. Recipe sales have recipe_id + the system expands BOM silently.
2. **BOM expansion happens server-side inside the sale transaction.** Same atomicity as current sale_service — if any ingredient is short, the whole sale fails, no partial deduction.
3. **Inventory items are shared across both business units.** An item belongs to one BU, but recipes reference items by ID. A recipe belongs to a BU (restaurant). Shop sales use items directly (already works).
4. **Low stock alerts:** extend existing dashboard low_stock query. Add a `/stock-alerts` endpoint that returns items below min_stock_level with suggested reorder quantity.
5. **Money stays Decimal-as-string.** BOM quantities are integers (in base_unit). No new money types.

## Scope Boundaries (per AGENTS.md)

DO build:
- Recipe CRUD (owner only)
- Recipe ingredient BOM management
- MenuItem listing (recipes + shop products combined for sale entry)
- Recipe-expanded sales (sale record links to recipe, ingredients deducted)
- Low stock alert page + reorder suggestion
- Dashboard: wastage in totals, expenses in business_split, net balance card
- Reports: include wastage in export

DO NOT build (yet):
- Recipe versioning / revision history
- Recipe cost calculation / margin reporting
- Automated purchase order creation from low stock
- Multi-unit conversion (kg↔g) in BOM — keep same base_unit, owner configures in correct unit
- Barcode/QR, receipt printers, loyalty, GST

## Task List

### Phase 1: Foundation — New Models + DB Indexes

- [ ] Task 1: Add Recipe, RecipeIngredient, MenuItem models + Pydantic schemas
- [ ] Task 2: Add DB indexes for new collections (recipes, recipe_ingredients, menu_items)
- [ ] Task 3: Add recipe_service.py (CRUD, BOM expansion logic)
- [ ] Task 4: Add menu_service.py (list menu items = recipes + shop products for a BU)

**Checkpoint:** `pytest` passes, new models importable, no migration needed (MongoDB, collections created on first write)

### Phase 2: Recipe Engine — Sale Flow

- [ ] Task 5: Extend SaleCreate schema with optional `recipe_id` field
- [ ] Task 6: Extend sale_service.create_sale() — if recipe_id present, expand BOM, validate ingredient stock, deduct ingredients, attach recipe info to sale doc
- [ ] Task 7: Add `POST /api/menu-items` (list sellable items for sale entry: recipes + shop products with selling_price)
- [ ] Task 8: Add recipe router (`/api/recipes` CRUD, `/api/recipes/{id}/ingredients` BOM management)

**Checkpoint:** End-to-end test: create recipe "Roti Thali" with 3 ingredients → create sale via recipe → verify ingredients deducted, sale record has recipe_id

### Phase 3: Frontend — Recipe UI

- [ ] Task 9: Add frontend types for Recipe, RecipeIngredient, MenuItem
- [ ] Task 10: Add services/recipes.ts + services/menu.ts API clients
- [ ] Task 11: Add RecipeFormModal (create/edit recipe + BOM lines)
- [ ] Task 12: Add RecipesPage (list recipes, link to BOM editor)
- [ ] Task 13: Update SaleFormModal — add "Menu Items" tab alongside "Inventory Items" search; selecting a recipe expands to show ingredient breakdown + qty multiplier
- [ ] Task 14: Add StockAlertsPage (low stock list + suggested reorder qty)

**Checkpoint:** UI works: create recipe → sell via recipe → see ingredients deducted in inventory

### Phase 4: Reports & Dashboard Polish

- [ ] Task 15: Dashboard service — add wastage total to totals, add expense to business_split, add `net_balance` (sales - purchases - expenses - wastage_value)
- [ ] Task 16: Dashboard UI — add Net Balance card, show wastage in recent activity
- [ ] Task 17: Report service — add wastage sheet to xlsx export, include wastage value in net calculation
- [ ] Task 18: Add `/api/stock-alerts` endpoint (items below min_stock_level with suggested reorder)

**Checkpoint:** Dashboard shows net balance. Export includes wastage. Stock alerts page works.

### Phase 5: Verification & Deploy

- [ ] Task 19: Full test suite passes (`pytest`)
- [ ] Task 20: Frontend builds clean (`npm run build`)
- [ ] Task 21: Local smoke test: recipes CRUD → recipe sale → stock deduction → low stock alert → dashboard shows net → export xlsx
- [ ] Task 22: Push to GitHub, verify Render still green, redeploy Firebase

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Recipe BOM expansion breaks existing sale flow | High | Keep recipe_id optional; existing sales code path unchanged if null |
| Negative stock from recipe sale race condition | High | Same transaction pattern as current sale_service — stock check + deduction inside tx |
| Frontend SaleFormModal gets too complex (two sale modes) | Med | Keep recipe selection as a separate tab/step; don't mix with item search in same list |
| MongoDB without schema enforcement allows bad BOM data | Med | Validate BOM on recipe create/update (every ingredient must reference real active item, qty > 0) |

## Open Questions

- [ ] Do recipes belong to a specific business unit (restaurant)? — Yes, assumed. Confirm.
- [ ] Should a recipe sale also record the menu item name in the sale doc for reporting? — Yes, assumed.
- [ ] Minimum stock alert: just show list, or also allow one-click "create purchase for this item"? — Start with list + suggested qty; one-click PO is optional follow-up.
