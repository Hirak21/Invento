# Frontend Subagent Brief — Phase 3: Recipe UI + Stock Alerts

## Context
Invento Lite frontend (React 19 + TypeScript + Vite + Tailwind CSS). Full codebase read. Plan at /home/hrk/Projects/Invento/IMPLEMENTATION_PLAN.md. AGENTS.md rules apply.

## Existing frontend structure
- src/App.tsx — main app, check routing here
- src/pages/: DashboardPage, SalesPage, PurchasesPage, InventoryPage, ExpensesPage, WastagePage, SettingsPage, LoginPage, PlaceholderPage
- src/features/: sales/SaleFormModal, purchases/PurchaseFormModal + PurchaseDetailModal, inventory/ItemFormModal + ItemDetailModal + AdjustmentModal, settings/SuppliersPanel + CategoriesPanel + BusinessUnitsPanel
- src/services/: api.ts (apiFetch, BASE from VITE_API_BASE), auth.ts, dashboard.ts, masterData.ts (business units, categories, suppliers, inventory items), sales.ts, purchases.ts, expenses.ts, stockOps.ts (wastage + adjustments)
- src/types/: inventory.ts, master.ts, sale.ts, purchase.ts, expense.ts, wastage.ts, user.ts
- src/components/ui/: Button, Input, Select, Modal, Card
- src/hooks/: useAuth, useBusinessUnit

## API patterns
- All services use apiFetch from ./api
- BASE is set from VITE_API_BASE env (baked at build time to https://invento-lite.duckdns.org/api on the VPS; apiFetch supports timeoutMs + isNetworkError, DashboardPage auto-retries network blips)
- Token stored in localStorage under 'invento_token', sent as Bearer
- Error handling: ApiError with status code, catch and show user-friendly message

## Key existing types

frontend/src/types/inventory.ts:
- InventoryItem: id, name, sku, category_id, business_unit_id, item_type, base_unit, purchase_price, selling_price, min_stock_level, current_stock, supplier_id, notes, active, status, created_at
- Movement, ItemListResponse, MovementListResponse
- ITEM_TYPE_LABELS, UNITS, formatMoney, formatDate

frontend/src/types/sale.ts:
- SalePaymentMethod, SaleLine, Sale, SaleListResponse

frontend/src/types/wastage.ts:
- WastageReason, WastageRecord, WastageListResponse, AdjustmentRecord, AdjustmentListResponse, AdjustmentReason

frontend/src/services/masterData.ts:
- listBusinessUnits, createBusinessUnit, updateBusinessUnit
- listCategories, createCategory, updateCategory
- listSuppliers, createSupplier, updateSupplier
- listItems, createItem, updateItem, listItemMovements, deleteItem
- ItemFilters, ItemCreatePayload

## What to build

### Task 9: Add frontend types

Create or extend frontend/src/types/recipe.ts:

Recipe:
- id: string
- name: string
- business_unit_id: string
- description: string | null
- active: boolean
- created_at: string
- updated_at: string

RecipeIngredient:
- id: string
- recipe_id: string
- item_id: string
- item_name: string
- quantity: number
- unit: string
- notes: string | null

RecipeWithIngredients:
- recipe: Recipe
- ingredients: RecipeIngredient[]

MenuItem:
- id: string
- name: string
- type: 'recipe' | 'shop_product'
- recipe_id: string | null
- selling_price: string
- business_unit_id: string
- active: boolean
- created_at: string
- ingredient_summary?: { item_name: string; qty: number; unit: string }[] (only for recipes)

Sale (extend in types/sale.ts):
- Add recipe_id: string | null
- Add recipe_name: string | null

StockAlert (new in types/inventory.ts or new file):
- item_id: string
- item_name: string
- current_stock: number
- min_stock_level: number
- base_unit: string
- suggested_reorder_qty: number
- status: 'low' | 'out'

### Task 10: Add API services

Create frontend/src/services/recipes.ts:

- listRecipes(filters: { business_unit_id?: string; active?: boolean }): Promise<RecipeWithIngredients[]>
- getRecipe(id: string): Promise<RecipeWithIngredients>
- createRecipe(payload: { name: string; business_unit_id: string; description?: string; active?: boolean }): Promise<Recipe>
- updateRecipe(id: string, patch: Partial<...>): Promise<Recipe>
- deleteRecipe(id: string): Promise<void>
- addRecipeIngredient(recipeId: string, payload: { item_id: string; quantity: number; notes?: string }): Promise<RecipeIngredient>
- removeRecipeIngredient(recipeId: string, ingredientId: string): Promise<void>

Create frontend/src/services/menu.ts:

- listMenuItems(business_unit_id: string): Promise<MenuItem[]>

Create frontend/src/services/stockAlerts.ts:

- listStockAlerts(filters: { business_unit_id?: string; include_out_of_stock?: boolean }): Promise<StockAlert[]>

### Task 11: RecipeFormModal

Create frontend/src/features/recipes/RecipeFormModal.tsx:

- Modal with: name input, business unit select (from useBusinessUnit), description input, active toggle
- Ingredients list inside modal: shows current BOM lines with item name, qty, unit, notes, remove button
- Add ingredient: search inventory items (use listItems from masterData), select item, enter qty, add to list
- Only owner can create/edit
- On save: call createRecipe or updateRecipe, then add ingredients one by one (or batch if API supports)
- On success: onSaved callback with recipe id
- Error handling: show error message

### Task 12: RecipesPage

Create frontend/src/pages/RecipesPage.tsx:

- List all recipes for selected business unit (or all if none selected)
- Each row: name, description, ingredient count, active status, actions (edit, delete)
- + New Recipe button (owner only)
- Edit opens RecipeFormModal
- Delete with confirmation
- Click row to view detail (RecipeDetailModal showing ingredients list)
- Empty state when no recipes

### Task 13: Update SaleFormModal for recipe sales

Modify frontend/src/features/sales/SaleFormModal.tsx:

Currently: search inventory items by name/SKU, add to cart, set quantity, submit sale.

NEW: Add a "Menu" tab alongside the existing item search. When user selects a menu item:
- If it's a shop_product: behave like current item search (add to cart with that item_id, selling_price)
- If it's a recipe: show recipe name + ingredient breakdown (e.g. "Roti Thali: 200g atta, 50g dal, 30g potato"), ask for quantity, add to cart as recipe sale

Cart line for recipe:
- { recipe_id, recipe_name, quantity, unit_price, ingredient_lines: [{item_name, qty, unit}] }

When submitting:
- If cart has recipe lines: send recipe_id in sale request (the backend will expand BOM)
- If cart has direct items: send as before (item_id based)
- Can mix both in same sale? For MVP: keep it simple — one mode at a time, or support both (backend handles each line independently based on whether it has recipe_id or item_id)

Actually — re-read the backend spec: SaleCreate has items (list of SaleLineIn with item_id) AND optional recipe_id at top level. So a sale is EITHER a recipe sale (recipe_id set, items derived from BOM) OR a direct item sale (items list with item_ids). Not mixed.

For MVP: keep it simple. If user selects a recipe, the sale is a recipe sale. If user searches items, it's a direct sale. Don't mix in same sale for now.

UI flow:
1. User sees two tabs: "Items" (existing search) and "Menu" (new)
2. "Items" tab: existing behavior
3. "Menu" tab: select business unit, shows list of menu items (recipes + shop products with selling_price). Click one → if recipe, show ingredient preview + quantity input → add to cart as single recipe line → submit as recipe sale
4. Cart shows: for recipe lines, show recipe name + qty + expanded ingredient list preview; for item lines, show item name + qty

### Task 14: StockAlertsPage

Create frontend/src/pages/StockAlertsPage.tsx:

- Page title: "Stock Alerts" or "Low Stock"
- List low stock items from listStockAlerts
- Each row: item name, current stock / min level (e.g. "25 / 100 kg"), status badge (low = amber, out = red), suggested reorder qty (e.g. "Reorder 175 kg")
- Filter by business unit
- Refresh button
- Empty state: "All stock levels healthy" with green indicator
- Click row to go to inventory item (or show detail modal)
- Add to Layout/App routing (check App.tsx for how pages are routed — likely react-router-dom)

## UI conventions to follow
- Use existing components: Button, Input, Select, Modal, Card, Badge
- Tailwind CSS classes (existing pattern: text-slate-900, bg-indigo-50, etc.)
- cn() utility from utils/cn for conditional classes
- Error display: role="alert" with bg-red-50 text-red-700
- Success display: role="status" with bg-emerald-50 text-emerald-800
- Loading state: "Loading..." text centered
- Empty state: dashed border box with text-slate-500 message
- Date inputs: type="date", value formatted as ISO date string
- Use formatMoney from types/inventory for displaying prices
- Use formatDate from types/inventory for displaying dates

## Routing
Check src/App.tsx to see how pages are routed. Likely react-router-dom with Routes/Route. Add:
- /recipes -> RecipesPage
- /stock-alerts -> StockAlertsPage

Add navigation links in AppShell sidebar if applicable (check src/layouts/AppShell.tsx).

## After implementation
1. Run: cd /home/hrk/Projects/Invento/frontend && npx tsc --noEmit (type check)
2. Run: cd /home/hrk/Projects/Invento/frontend && npm run build
3. Fix any TypeScript errors or build failures
4. Verify all new components render without errors (can't test visually, but ensure no obvious runtime errors in code)

## TypeScript strictness
- All types must be defined properly
- No `any` unless absolutely necessary (prefer unknown + type guards)
- Handle null/undefined explicitly
- API response types must match backend response shapes
- Use generated types from backend models as reference (SaleOut, RecipeOut, etc.)
