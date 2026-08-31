#!/usr/bin/env bash
# Invento Lite — local dev launcher (no root required)
# Starts MongoDB (rs0), backend (uvicorn :8000), frontend (vite :5173/5174).
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
MONGOD="$HOME/.local/opt/mongodb/bin/mongod"
DATA="$HOME/.local/opt/mongodb/data"
LOG="$HOME/.local/opt/mongodb/logs/mongod.log"
PATH="$HOME/.local/opt/mongodb/bin:$PATH"

echo "==> MongoDB"
if ! pgrep -f "$MONGOD" >/dev/null; then
  mkdir -p "$DATA" "$HOME/.local/opt/mongodb/logs"
  nohup "$MONGOD" --replSet rs0 --dbpath "$DATA" --logpath "$LOG" \
    --bind_ip 127.0.0.1 --port 27017 --fork >/dev/null 2>&1
  # ensure rs0 is initiated
  ( cd "$ROOT/backend" && ./.venv/bin/python - <<'PY'
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
async def main():
    c = AsyncIOMotorClient("mongodb://127.0.0.1:27017/?directConnection=true", serverSelectionTimeoutMS=5000)
    try:
        await c.admin.command("replSetInitiate", {"_id":"rs0","members":[{"_id":0,"host":"127.0.0.1:27017"}]})
    except Exception as e:
        if "already initialized" not in str(e).lower():
            print("rs0 note:", e)
    for _ in range(20):
        try:
            st = await c.admin.command("hello")
            if st.get("ismaster") or st.get("isWritablePrimary"):
                print("rs0 PRIMARY ready"); return
        except Exception: pass
        await asyncio.sleep(1)
asyncio.run(main())
PY
)
  echo "    mongo started (pid $(pgrep -f "$MONGOD" | head -1))"
else
  echo "    mongo already running"
fi

echo "==> Backend (uvicorn :8000)"
pgrep -f "uvicorn app.main:app" >/dev/null || \
  ( cd "$ROOT/backend" && nohup ./.venv/bin/uvicorn app.main:app --reload --port 8000 >/tmp/invento-backend.log 2>&1 & )
echo "    http://127.0.0.1:8000  (docs: /docs)"

echo "==> Frontend (vite)"
pgrep -f "vite" >/dev/null || \
  ( cd "$ROOT/frontend" && nohup npm run dev >/tmp/invento-frontend.log 2>&1 & )
sleep 6
PORT=$(grep -oE 'http://localhost:[0-9]+' /tmp/invento-frontend.log | head -1)
echo "    $PORT"
echo "DONE."
