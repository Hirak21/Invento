# AGENTS.md — Invento Lite

Lead-engineer rules for working on Invento Lite, an inventory/sales/purchase/expense/reporting MVP for a client running a restaurant + shop.

## Tech Stack

- Backend: Python 3.13, FastAPI, Motor (async MongoDB driver), Pydantic v2, openpyxl
- Frontend: React 19, TypeScript 5, Vite, Tailwind CSS
- Database: MongoDB (local single-node replica set `rs0` — required for multi-doc transactions)
- Auth: JWT (access token), passlib/bcrypt password hashing

## Commands

Backend (`backend/`):
- Dev server: `uvicorn app.main:app --reload --port 8000`
- Tests: `pytest`
- Type check: `npx mypy app` or `mypy app`

Frontend (`frontend/`):
- Dev server: `npm run dev` (port 5173)
- Build: `npm run build`
- Lint: `npm run lint`
- Type check: `npx tsc --noEmit`

Database:
- Start: `sudo systemctl start mongod`
- Status: `sudo systemctl status mongod`

## Project Layout

```
backend/
  app/
    main.py          # FastAPI entry, router registration
    core/config.py   # env-driven settings (pydantic-settings)
    core/security.py # hashing, JWT
    db/mongo.py      # connection, indexes
    models/          # Pydantic schemas
    routers/         # REST route modules per domain
    services/        # business logic (transactions, stock)
    utils/           # audit logging, errors, pagination
  tests/
frontend/
  src/
    components/      # shared UI primitives
    layouts/         # AppShell (sidebar + topbar)
    pages/           # Dashboard, Sales, Purchases, Inventory, ...
    features/        # domain logic per feature
    services/        # API clients
    hooks/
    types/
docs/               # spec markdown files (01–05), read before feature work
```

## Non-Negotiable Integrity Rules

1. **Every stock change creates an InventoryMovement** (PURCHASE / SALE / WASTAGE / ADJUSTMENT_IN / ADJUSTMENT_OUT). Never mutate stock silently.
2. **No hard delete** of operational transactions. Use void/reversal/inactive states.
3. **Money math on the server only**, using Decimal (store as strings in Mongo). Client totals are UX-only.
4. **Idempotency**: sales/purchases accept an idempotency key; duplicate submission must not duplicate stock effect.
5. **No negative stock** by default; validate availability before completing a sale/wastage.
6. **Audit important mutations** via audit_logs collection.
7. **Secrets from env only.** `.env` never committed. No hardcoded credentials anywhere.

## Scope Discipline (MVP)

Do NOT build: full accounting, payroll, GST filing, barcode hardware, receipt printers, QR ordering, loyalty, AI, forecasting, SaaS billing, complex role matrices, recipe engine, Aagomon integration.

Roles: exactly two — `owner`, `staff`. Staff cannot approve adjustments beyond policy or manage users.

Business units: Restaurant + Shop share one architecture keyed by `business_unit_id`.

## Code Conventions

- Backend: snake_case, async endpoints, Pydantic models for all request/response bodies, routers thin → logic in services/, custom exceptions mapped to HTTP in one error handler.
- Frontend: functional components + hooks, named exports, colocate small helpers with feature, `cn()` style conditional classes, forms keep values after recoverable errors, disable submit while pending.
- All list endpoints support `from`, `to`, `business_unit_id` filters (add others only when needed).
- Empty states must explain ("No purchases found for this period.") — never a blank table.

## Verification Bar

A feature is done only when: API tested (happy + error + duplicate case where relevant), UI works desktop + mobile width, DB state verified, build/lint/tests green. Never claim testing that didn't happen.

## Workflow

Vertical slices: Master Data → Purchase → Stock → Sale → Stock → Reports. After each slice, test end-to-end. Commit at meaningful milestones; never mix unrelated refactors into a feature commit.
