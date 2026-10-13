# Backend Subagent Brief — Phase 1 + 2: Recipe Engine

## Context
Invento Lite backend. Full codebase read. Plan at /home/hrk/Projects/Invento/IMPLEMENTATION_PLAN.md. AGENTS.md rules apply: money as Decimal-as-string, idempotent sales, atomic stock changes via ledger.record_movement(), no negative stock, audit every mutation, secrets from env only.

## Existing code patterns
- models/: enums.py (ItemType.RAW_MATERIAL, SHOP_PRODUCT already exist), inventory.py, sale.py, purchase.py, wastage.py, expense.py, business_unit.py, catalog.py, movement.py, user.py, auth.py
- services/: sale_service.py (create_sale with atomic tx + stock deduction), purchase_service.py, inventory_service.py, wastage_service.py, dashboard_service.py, report_service.py, expense_service.py, ledger.py (record_movement function)
- routers/: sales.py, purchases.py, inventory.py, wastage.py, expenses.py, dashboard.py, reports.py, catalog.py (categories/suppliers), business_units.py, auth.py, meta.py, deps.py
- utils/: money.py (MoneyAmount, parse_money, money_to_str), errors.py, audit.py
- db/: mongo.py (connection, ensure_indexes)
- core/: config.py, security.py

## Patterns to follow
- Pydantic v2: use field_validator, model_config(from_attributes=True) for response models
- Money: always MoneyAmount (str validated), store as str in Mongo, use parse_money() for arithmetic
- MongoDB ObjectId: use ledger.is_oid() to validate, ledger.oid() to convert, never trust raw strings
- Transactions: async with session.start_transaction() for any stock mutation
- Idempotency: check idempotency_key before business logic, handle DuplicateKeyError
- Stock guard: check current_stock >= needed inside transaction before deducting
- Audit: log_audit() after successful mutations
- Errors: BusinessRuleError (422) for domain violations, NotFoundError (404), ConflictError (409), ForbiddenError (403)
- deps.py: CurrentUser, OwnerUser (owner-only), DBDep
- Route pattern: thin router -> service layer -> ledger

## Phase 1: New Models

Create backend/app/models/recipe.py with:

RecipeCreate:
- name: str (1-120 chars)
- business_unit_id: str
- description: str | None (max 500)
- active: bool (default True)

RecipeUpdate:
- name, business_unit_id, description, active (all optional)

RecipeOut:
- id: str
- name: str
- business_unit_id: str
- description: str | None
- active: bool
- created_at: datetime
- updated_at: datetime

RecipeIngredientIn:
- item_id: str
- quantity: int (gt=0)
- notes: str | None

RecipeIngredientOut:
- id: str
- recipe_id: str
- item_id: str
- item_name: str
- quantity: int
- unit: str
- notes: str | None

RecipeWithIngredients:
- recipe: RecipeOut
- ingredients: list of RecipeIngredientOut

MenuItemType enum: RECIPE or SHOP_PRODUCT

MenuItemOut:
- id: str
- name: str
- type: MenuItemType
- recipe_id: str | None
- selling_price: str
- business_unit_id: str
- active: bool
- created_at: datetime

## Phase 1: New Services

Create backend/app/services/recipe_service.py:

create_recipe(db, payload, actor_id, actor_username):
- validates BU exists and active
- checks duplicate name in BU
- creates recipe doc with created_at, updated_at

get_recipe(db, recipe_id):
- loads recipe + ingredients
- populates item_name by looking up each ingredient's item from inventory_items

list_recipes(db, business_unit_id=None, active=True):
- list recipes, optionally filtered by BU

update_recipe(db, recipe_id, payload):
- validate refs, update, update updated_at

delete_recipe(db, recipe_id):
- only if no sales reference it (check sales collection for recipe_id field)

add_ingredient(db, recipe_id, payload, actor):
- validate item exists and belongs to same BU as recipe
- add ingredient doc

remove_ingredient(db, recipe_id, ingredient_id):
- remove ingredient doc

Create backend/app/services/menu_service.py:

list_menu_items(db, business_unit_id):
- returns combined list of:
  (a) recipes that have selling_price set
  (b) shop_product inventory items that have selling_price set
- Each entry: id, name, type (recipe or shop_product), recipe_id (if recipe), selling_price, base_unit (for shop products), ingredient_summary (for recipes: list of item_name, qty, unit)

## Phase 2: Routers

Create backend/app/routers/recipes.py:

- POST /api/recipes -> create_recipe (owner only)
- GET /api/recipes -> list_recipes (query params: business_unit_id, active)
- GET /api/recipes/<id> -> get_recipe with ingredients
- PATCH /api/recipes/<id> -> update_recipe (owner only)
- DELETE /api/recipes/<id> -> delete_recipe (owner only)
- POST /api/recipes/<id>/ingredients -> add_ingredient (owner only)
- DELETE /api/recipes/<id>/ingredients/<ingredient_id> -> remove_ingredient (owner only)

Create backend/app/routers/menu.py:

- GET /api/menu-items -> list_menu_items (query: business_unit_id required)

## Phase 2: Extend Sale Model + Service

Extend backend/app/models/sale.py:

SaleCreate: add optional recipe_id field (str | None)
SaleOut: add recipe_id (optional), recipe_name (optional) to response

Extend backend/app/services/sale_service.py create_sale():

If payload.recipe_id is set:
1. Load recipe and ingredients from recipe_service
2. For each ingredient: validate item exists, active, belongs to same BU, has enough stock (ingredient qty multiplied by sale quantity)
3. Inside the existing transaction: deduct each ingredient stock by (ingredient.quantity multiplied by sale_quantity), record_movement for each
4. Attach recipe_id and recipe_name to sale doc

If recipe_id is None: existing behavior unchanged (direct item sale)

BOM expansion: sale quantity applies to whole recipe. Each ingredient gets deducted by ingredient.quantity multiplied by sale_quantity.

## DB Indexes (add to mongo.py ensure_indexes)

- db.recipes.create_index on business_unit_id
- db.recipes.create_index on name
- db.recipe_ingredients.create_index on recipe_id (ascending)

## Important constraints
- Recipe must belong to a business_unit
- Recipe ingredients must reference items that belong to the SAME business_unit as the recipe
- When selling a recipe, the sale business_unit_id must match the recipe business_unit_id
- Ingredient quantity in BOM is in the item base_unit (e.g. if atta is in grams, BOM says 200 = 200g)
- Do NOT create a menu_items collection — it is computed on read from recipes + inventory_items
- Do NOT modify existing sale flow when recipe_id is None
- Follow existing code style exactly (snake_case, async, type hints, Annotated patterns)
- Register new routers in main.py (app.include_router for recipes and menu)

## After implementation
1. Run: cd /home/hrk/Projects/Invento/backend && source .venv/bin/activate && python -c "from app.models.recipe import *; print('models OK')"
2. Run: cd /home/hrk/Projects/Invento/backend && source .venv/bin/activate && pytest -x -v
3. Fix any failures

## Tests needed
- recipe CRUD (create, get, list, update, delete)
- BOM ingredient add/remove
- BOM expansion in sale (create recipe with ingredients, sell recipe, verify stock deducted)
- Ingredient stock validation (sell recipe with insufficient ingredient -> fails)
- Duplicate recipe name prevention
