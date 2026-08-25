# Invento Lite — Technical Design

## 1. Architecture

Recommended MVP architecture:

Frontend:
- React
- Vite
- TypeScript
- Tailwind CSS

Backend:
- FastAPI
- Python

Database:
- MongoDB

Files:
- Cloudflare R2 or equivalent object storage if receipt attachments are required

Exports:
- Python openpyxl

Deployment:
- VPS / Coolify or equivalent existing NTS infrastructure

Make the architecture modular so it can later become a reusable NTS product without forcing SaaS complexity into MVP.

## 2. Core Entities

Suggested collections/models:

- users
- business_units
- categories
- inventory_items
- suppliers
- purchases
- sales
- inventory_movements
- wastage
- stock_adjustments
- expenses
- audit_logs

Optional later:
- recipes
- recipe_items
- customers
- transfers
- attachments

## 3. Transaction Model

### Inventory Movement

A movement should contain:

- movement_id
- item_id
- business_unit_id
- movement_type
- quantity
- unit
- unit_cost when known
- reference_type
- reference_id
- created_at
- created_by
- notes

movement_type examples:

PURCHASE
SALE
WASTAGE
ADJUSTMENT_IN
ADJUSTMENT_OUT
TRANSFER_IN
TRANSFER_OUT

The ledger is the source of traceability.

A cached `current_stock` field may be used for fast dashboard reads, but it must remain consistent with the movement system.

## 4. Money

Use Decimal in backend calculations or integer minor units where appropriate.

Do not use JavaScript floating-point arithmetic for authoritative financial totals.

Currency should be INR for this initial client deployment, but avoid hardcoding currency logic throughout the code.

## 5. Sales Transaction

Recommended flow:

1. Validate sale.
2. Validate item availability according to business rule.
3. Calculate authoritative totals.
4. Create sale record with unique sale number/idempotency key.
5. Create sale items.
6. Create inventory movements.
7. Update cached stock if used.
8. Commit/complete transaction.
9. Return completed sale.

The same request must not be processed twice.

If MongoDB transactions are supported by the deployed environment, use them for critical multi-document operations.

## 6. Purchase Transaction

1. Validate purchase.
2. Calculate totals.
3. Create purchase record.
4. Create purchase items.
5. Create positive inventory movements.
6. Update cached stock if used.
7. Complete transaction atomically where possible.

## 7. Stock Rules

For MVP:

- Prevent negative stock by default.
- If the client explicitly requires negative stock, make it a configurable and visible business rule rather than silently allowing it.
- Low-stock threshold belongs to each item.
- Physical stock corrections always create adjustment movements.

## 8. API Design

Suggested REST endpoints:

Auth:
- POST /auth/login
- POST /auth/logout
- GET /auth/me

Dashboard:
- GET /dashboard/summary

Business units:
- GET /business-units
- POST /business-units
- PATCH /business-units/{id}

Inventory:
- GET /inventory/items
- POST /inventory/items
- GET /inventory/items/{id}
- PATCH /inventory/items/{id}
- GET /inventory/items/{id}/movements

Purchases:
- GET /purchases
- POST /purchases
- GET /purchases/{id}

Sales:
- GET /sales
- POST /sales
- GET /sales/{id}

Wastage:
- GET /wastage
- POST /wastage

Adjustments:
- GET /stock-adjustments
- POST /stock-adjustments

Expenses:
- GET /expenses
- POST /expenses
- GET /expenses/{id}

Reports:
- GET /reports/sales
- GET /reports/purchases
- GET /reports/inventory
- GET /reports/stock-movements
- GET /reports/wastage
- GET /reports/expenses
- GET /reports/summary
- GET /reports/export/{report_type}

## 9. Filtering

All list/report endpoints should support:

- from
- to
- business_unit_id
- category_id where relevant
- item_id where relevant
- payment_method where relevant
- supplier_id where relevant

Do not implement every possible filter before the basic workflow works.

## 10. Security

- Authentication required for operational routes.
- Passwords hashed securely.
- Secrets only from environment/configuration.
- No hardcoded credentials.
- Validate all inputs server-side.
- Avoid exposing internal database errors.
- Audit important financial/inventory mutations.
- Restrict destructive actions.
- Prefer reversal/void over hard deletion.

## 11. Frontend Structure

Suggested:

src/
  components/
  layouts/
  pages/
    Login
    Dashboard
    Inventory
    Purchases
    Sales
    Wastage
    Adjustments
    Expenses
    Reports
    Settings
  features/
    inventory/
    sales/
    purchases/
    reports/
  services/
  hooks/
  types/
  utils/

Keep domain logic out of giant page components.

## 12. State

Use local/component state for simple forms.

Use a lightweight shared state solution only where cross-page state genuinely needs it.

Do not introduce unnecessary state-management complexity.

## 13. Testing

Minimum tests:

### Inventory

- purchase increases stock
- sale decreases stock
- wastage decreases stock
- adjustment changes stock
- stock ledger records movement
- invalid quantity rejected
- duplicate transaction rejected

### Reports

- date filtering works
- business-unit filtering works
- totals reconcile with transactions
- Excel export generates valid workbook

### Security

- unauthenticated operational route denied
- user cannot access records outside permitted scope
- operational transactions cannot be silently deleted

### Regression

- frontend build succeeds
- backend tests pass
- API validation works

## 14. Future Compatibility

Design identifiers and relationships so that later versions can add:

- recipes and ingredient consumption
- multiple locations
- staff roles
- barcode scanning
- POS integration
- GST workflows
- customer accounts
- supplier balances
- Aagomon integration

Do not implement these prematurely.
