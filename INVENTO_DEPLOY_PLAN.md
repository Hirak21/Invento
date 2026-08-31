# Invento Lite — Deploy Plan (Render backend + Firebase frontend + Atlas M0)

Status: code is committed locally (commit 4e8bf8a). MongoDB Atlas M0 cluster is CREATED.
Remaining: push to GitHub → connect Render → deploy Firebase → wire Mongo URI.

## Prerequisites you must have
- GitHub account (gh not logged in on this machine yet)
- MongoDB Atlas connection string (you have it): `mongodb+srv://invento_app:***@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
- Firebase project created (free) — if not, do it at console.firebase.google.com

---

## STEP 1 — Push to GitHub (run on your machine)
```bash
cd ~/Projects/Invento
bash push-to-github.sh
```
This runs `gh auth login` (browser), creates repo `invento-lite` (private), adds remote, pushes `main`.
If you already ran it once, just: `git push -u origin main`

## STEP 2 — Render (backend)
1. Go to https://dashboard.render.com/ → "Blueprints" → "New Blueprint Instance"
2. Connect the `invento-lite` GitHub repo. Render reads `render.yaml` automatically.
3. It creates service `invento-lite-backend` (free).
4. In the service → Environment → set `MONGO_URI` = your Atlas string (with real password).
   - Do NOT add `?replicaSet=rs0` to the Atlas URI.
   - Leave `MONGO_DB=invento`, `ENVIRONMENT=production` (from render.yaml).
   - Copy the auto-generated `JWT_SECRET` somewhere safe.
5. Deploy. Wait for "Live". Note the backend URL, e.g. `https://invento-lite-backend.onrender.com`

## STEP 3 — Firebase (frontend)
1. Install Firebase CLI if missing:
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
2. Set your project id in `.firebaserc` (replace REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID).
3. In `firebase.json`, replace `REPLACE_WITH_YOUR_RENDER_URL` with the live Render URL from Step 2
   (so `/api/**` rewrites to `https://invento-lite-backend.onrender.com/api/**`).
4. Build + deploy:
   ```bash
   cd ~/Projects/Invento/frontend
   echo "VITE_API_BASE=https://invento-lite-backend.onrender.com" > .env.local
   npm install
   npm run build
   firebase deploy
   ```
5. Firebase gives you a URL like `https://invento-lite.web.app`

## STEP 4 — Verify
- Open the Firebase URL → login (owner account) → dashboard loads → add a sale → click report export → xlsx downloads.
- If blank/errors: check Render logs for Mongo connection error (usually IP allowlist missing 0.0.0.0/0, or wrong password in MONGO_URI).

## GOTCHAS
- Free Render sleeps after 15 min idle → first load ~30s slow. Normal for MVP.
- Atlas IP allowlist MUST include `0.0.0.0/0` or Render can't reach it.
- `VITE_API_BASE` is baked at build time → change it = rebuild frontend.
- Report endpoint uses DB-user password (from Atlas step 3 of setup), not your Atlas login.

## What is DONE vs TODO
DONE: xlsx report endpoint, Render blueprint, Firebase config, frontend API base, local commit.
TODO (you): GitHub push, Render connect+env, Firebase deploy, verify in browser.
