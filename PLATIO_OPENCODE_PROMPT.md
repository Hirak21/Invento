# Handoff Prompt for OpenCode — Platio (no-server build is DONE, finish the ship)

Use this as the prompt when you hand Platio to OpenCode. It reflects the REAL current state
(verified this session) so OpenCode does NOT redo finished work.

---

## Context
Platio is a construction-project finance tracker. It was re-architected from a planned
Express+SQLite server to a NO-SERVER model in this session:
- Data lives in a Google Sheet (one row per transaction/project/category).
- Auth = Firebase Google sign-in. Data access = Google Sheets API v4 (client-side).
- Shared lib `~/Projects/sheets-core` (Firebase auth + Sheets client + Drive receipts + money helpers).
- Frontend at `~/Projects/platio/packages/frontend` already has 14 pages (Dashboard, Projects,
  Transactions, Add Expense/Income, Reports, Settings). They are UNTOUCHED.
- `src/services/api.ts` was rewritten as a SHIM: same authApi/projectsApi/transactionsApi/
  categoriesApi/receiptsApi/reportsApi surface the pages call, but backed by sheets-core.
  All 14 pages + hooks work without changes.
- Receipts: uploaded to Google Drive (`drive.file` scope), link stored in sheet `receipt_key`.
- Money is integer paise. `~/Projects/sheets-core` money tests 9/9 pass.
- `npm run build` (frontend) = exit 0. `vite preview` serves HTTP 200.

## What is ALREADY DONE (do NOT rebuild)
- sheets-core lib (auth, sheets, schema, export, drive, money) — builds clean.
- Platio frontend shim — builds clean, pages intact.
- LoginPage + AuthContext = Google sign-in (email/password removed).
- Receipt upload/download/delete via Drive.
- Schema reconciled (category_id, reference_number, receipt_key columns present).

## What OpenCode should DO (the remaining ship steps)
1. Firebase project: enable Google sign-in, enable Sheets API AND Drive API.
2. Create the Google Sheet with tabs: Projects, Transactions, Categories, Audit.
   Header rows must match `PLATIO_SCHEMAS` in `~/Projects/sheets-core/src/schema.ts`
   (column order is positional — do not reorder). Seed Categories (at least expense+income
   ones) and one demo Project so the app has data on first load.
3. Fill env: `~/Projects/sheets-core/.env.local` and
   `~/Projects/platio/packages/frontend/.env.local` with:
   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
   VITE_FIREBASE_APP_ID, VITE_SPREADSHEET_ID (from the created sheet's URL).
4. Deploy frontend: `cd ~/Projects/platio/packages/frontend && firebase login && firebase deploy`
   (firebase.json already exists at repo root? if not, add Hosting config for `dist`).
5. Smoke test: sign in with Google (consent screen now asks Drive too) → add an expense →
   confirm the row appears in the Sheet → client (shared as Viewer) sees it → Export Excel works.
6. Optional UI polish only if asked: add an in-app receipt preview modal (pages currently
   show only a paperclip icon; the link opens in a new tab).

## Constraints / rules
- Do NOT rewrite the 14 pages or the api.ts shim unless something is actually broken.
- Do NOT change the sheet column order — it breaks positional mapping in sheets-core.
- Single writer model: owner writes via app; client is Sheet Viewer (read-only).
- No server, no Cloud Functions (user has no GCP billing). Firebase = Hosting + Auth only.
- Keep money as integer paise.

## Verification bar
- `cd ~/Projects/sheets-core && npm run build` → exit 0
- `cd ~/Projects/platio/packages/frontend && npm run build` → exit 0
- Live: sign-in → add expense → sheet row appears → export xlsx downloads → client sees data.
