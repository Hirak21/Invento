#!/usr/bin/env bash
# Push Invento Lite to a NEW GitHub repo, then you deploy via Render + Firebase.
# Run:  bash push-to-github.sh
# Prereq: a GitHub account. This script will prompt you to log in (browser).
set -e

REPO_NAME="invento-lite"          # change if you want a different repo name
REPO_DESC="Invento Lite - inventory/sales/purchase/expense SaaS (FastAPI + React)"
VISIBILITY="private"              # client tool -> keep private. Change to public if you prefer.

echo ">> Step 1: gh auth (opens browser)"
gh auth login || { echo "gh auth failed. Install gh first: https://cli.github.com/"; exit 1; }

echo ">> Step 2: create repo + push"
gh repo create "$REPO_NAME" --description "$REPO_DESC" --"$VISIBILITY" --source . --remote origin --push

echo ""
echo "DONE. Now:"
echo "1) Render: https://dashboard.render.com/blueprints -> connect this repo (uses render.yaml)."
echo "   - Set MONGO_URI to your Atlas M0 connection string (replica set)."
echo "   - Copy the generated JWT_SECRET somewhere safe."
echo "2) Firebase: set .firebaserc project id; build frontend; deploy:"
echo "     cd frontend && echo 'VITE_API_BASE=https://YOUR_RENDER_URL' > .env.local && npm run build"
echo "     firebase login && firebase deploy"
echo "3) Replace REPLACE_WITH_YOUR_RENDER_URL in firebase.json rewrites with the live Render URL."
