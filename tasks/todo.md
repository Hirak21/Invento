# Invento Upgrade — Task List

## Phase 1: Foundation — New Models + Services

- [ ] Task 1: Add Recipe, RecipeIngredient, MenuItem models + Pydantic schemas
- [ ] Task 2: Add DB indexes for new collections (ensure_indexes in mongo.py)
- [ ] Task 3: Add recipe_service.py (CRUD + BOM expansion logic)
- [ ] Task 4: Add menu_service.py (list sellable items: recipes + shop products)

## Phase 2: Recipe Engine — Sale Flow

- [ ] Task 5: Extend SaleCreate schema with optional recipe_id field
- [ ] Task 6: Extend sale_service.create_sale() — BOM expansion when recipe_id present
- [ ] Task 7: Add POST/GET /api/menu-items endpoint (sellable items for sale entry)
- [ ] Task 8: Add /api/recipes CRUD router + /api/recipes/{id}/ingredients BOM management

## Phase 3: Frontend — Recipe UI

- [ ] Task 9: Add frontend types (Recipe, RecipeIngredient, MenuItem)
- [ ] Task 10: Add services/recipes.ts + services/menu.ts API clients
- [ ] Task 11: Add RecipeFormModal (create/edit recipe + BOM lines)
- [ ] Task 12: Add RecipesPage (list recipes, link to BOM editor)
- [ ] Task 13: Update SaleFormModal — add menu item selection (recipe expansion)
- [ ] Task 14: Add StockAlertsPage (low stock list + suggested reorder qty)

## Phase 4: Reports & Dashboard Polish

- [ ] Task 15: Dashboard service — wastage in totals, expense in business_split, net_balance card
- [ ] Task 16: Dashboard UI — Net Balance card, wastage in recent activity
- [ ] Task 17: Report service — wastage sheet in xlsx, wastage in net calc
- [ ] Task 18: Add /api/stock-alerts endpoint

## Phase 5: Verification & Deploy

- [ ] Task 19: Full pytest passes
- [ ] Task 20: Frontend build clean
- [ ] Task 21: Local smoke test (recipes → recipe sale → stock deduction → alerts → dashboard → export)
- [ ] Task 22: Push to GitHub, verify Render, redeploy Firebase
