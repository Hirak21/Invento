# Invento Lite — VPS RUNBOOK (Ubuntu VPS + Docker + Caddy + Firebase frontend)

Goal: move the backend + MongoDB from Render-free/Atlas to your own VPS.
Firebase hosting stays exactly as-is (one URL change + redeploy at the end).

Keep Render + Atlas RUNNING until Step 6 passes — they are your instant rollback.

====================================================================
STEP 1 [YOU, 5 min] — Free HTTPS hostname (DuckDNS)
====================================================================
Firebase is HTTPS, so the VPS API must also be HTTPS, which needs a real
hostname. Free option, no purchase:

1. Go to https://www.duckdns.org, sign in (Google/GitHub), add a subdomain:
     e.g.  invento-lite.duckdns.org
2. Set its IP to your VPS public IP. (Update it if the IP ever changes.)
3. Verify from your machine:
     nslookup invento-lite.duckdns.org
   must return your VPS IP before continuing — Caddy can't issue the
   certificate until DNS resolves.

If you later buy a real domain, just point its A-record at the VPS and swap
API_DOMAIN — everything else is identical.

====================================================================
STEP 2 — VPS first boot (script does Docker + firewall + dirs)
====================================================================Copy this repo's deploy/ folder to the VPS, then on the VPS:

  chmod +x deploy/vps-setup.sh
  sudo ./deploy/vps-setup.sh

Result: Docker installed, UFW allows 22/80/443 only, /opt/invento/deploy exists.
MongoDB's port is intentionally NOT opened — DB lives inside docker only.

====================================================================
STEP 2b — SSH hardening (key-only login, DONE 2026-10-07)
====================================================================
Current live state: root login requires the ed25519 key at
~/.ssh/invento_vps (local machine); password auth is DISABLED server-side
(/etc/ssh/sshd_config.d/10-invento-hardening.conf). It sorts before
50-cloud-init.conf, which would otherwise re-enable passwords.

If you ever need to redo it (new key):
  ssh-copy-id -i ~/.ssh/newkey.pub root@<VPS-IP>   # while passwords work, or via console
  # then re-apply: PasswordAuthentication no + KbdInteractiveAuthentication no,
  # sshd -t && systemctl reload ssh, and verify a fresh key login BEFORE closing
  # the session. Never reload sshd without a working fallback session.

====================================================================
STEP 3 — Backend env (on the VPS, in /opt/invento/deploy)
====================================================================
  cp .env.example production.env
Edit production.env:
  API_DOMAIN=invento-lite.duckdns.org   (your DuckDNS subdomain)
  JWT_SECRET=<paste from Render dashboard>  (keeps all logins working;
      else: openssl rand -hex 32 — everyone just re-logs-in)
  PUBLIC_BASE_URL=https://invento-lite.duckdns.org
Never commit production.env anywhere.

====================================================================
STEP 4 — Launch
====================================================================
  cd /opt/invento/deploy
  API_DOMAIN=$(grep -E '^API_DOMAIN=' production.env | cut -d= -f2) \
    docker compose up -d --build
  docker compose ps
  sleep 45   # Caddy fetches the Let's Encrypt cert on first boot
  curl -f https://<your-subdomain>/api/health
Expect: {"status":"ok","db":"ok",...}

If unhealthy: docker compose logs backend | tail -30   (DB/auth issues show here)

====================================================================
STEP 5 — Move the data (Atlas -> VPS)
====================================================================
Needs your Atlas connection string (Render dashboard -> Environment -> MONGO_URI).
On the VPS:

  sudo apt-get install -y mongodb-database-tools
  # 1) dump live data (reads only, app keeps running on Render meanwhile)
  mongodump --uri="<ATLAS_MONGO_URI>" -o /opt/invento/atlas-backup
  # 2) allow localhost-only access to the VPS mongo for the restore
  #    (temporarily add to docker-compose.yml mongo service:
  #     ports: ["127.0.0.1:27017:27017"], then docker compose up -d mongo)
  mongorestore --host 127.0.0.1 --drop /opt/invento/atlas-backup
  # 3) remove the temporary ports line, docker compose up -d mongo

Skip this step for a FRESH start instead: with an empty DB, create the owner via
  curl -X POST https://<subdomain>/api/auth/bootstrap-owner \
    -H 'Content-Type: application/json' \
    -d '{"username":"owner","password":"...","business_name":"..."}'

====================================================================
STEP 6 — Point Firebase at the VPS + verify
====================================================================
On your machine:
  cd frontend
  # edit .env.production: VITE_API_BASE=https://<your-subdomain>/api
  npm run build
  cd .. && npx -y firebase-tools deploy --only hosting
In the browser: hard-refresh (Ctrl+Shift+R), log in, dashboard loads.

====================================================================
ROLLBACK (if anything misbehaves)
====================================================================
Render + Atlas were never touched, so: revert .env.production to the Render
URL, rebuild + redeploy frontend (Step 6 in reverse) — back online in ~5 min.
Then fix forward on the VPS without pressure.

====================================================================
ONGOING OPS (quick reference)
====================================================================
  docker compose ps                        # status
  docker compose logs -f backend           # tail API logs
  docker compose exec mongo mongosh        # DB shell
  Backup DB: docker compose exec -T mongo mongodump --quiet --archive > backup.archive
  Update backend: copy new backend/ over, docker compose up -d --build backend
