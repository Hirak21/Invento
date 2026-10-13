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

====================================================================
OWNER GUIDE (read this — plain English, no expertise needed)
====================================================================

--- A. WHERE ARE MY DOCS? (on your own computer) ---

Everything lives in one folder:  /home/hrk/Projects/Invento/

  deploy/VPS_RUNBOOK.md   <- you are here. Setup + this owner guide.
  deploy/docker-compose.yml  <- what runs on the VPS (mongo + api + caddy)
  deploy/Caddyfile           <- the HTTPS setup (you never need to touch it)
  deploy/.env.example        <- template of the server settings (no secrets in it)
  backend/Dockerfile         <- how the API is packaged
  DEPLOY_RUNBOOK.md          <- OLD Render setup. Retired, kept for rollback only.

Live server addresses (bookmark these):
  Shop app (frontend):  https://invento-lite.web.app
  API (backend):        https://invento-lite.duckdns.org/api/health
                        (open it — you should see {"status":"ok",...})
  VPS address:          31.42.125.143

Secrets are NEVER stored in these files. The real passwords/keys live only
on the VPS itself (/opt/invento/deploy/production.env) and in ~/.ssh/ on
your computer. That is on purpose — files here can be pushed to GitHub safely.

--- B. LOG IN TO THE VPS YOURSELF ---

From THIS computer, open a terminal and run exactly this:

  ssh -i ~/.ssh/invento_vps root@31.42.125.143

What each part means:
  ssh                        = "open a secure shell"
  -i ~/.ssh/invento_vps      = "prove it's me using my key file"
                               (this file is your identity — never share it)
  root                       = log in as the admin user
  31.42.125.143              = the VPS address

Type `exit` (or press Ctrl+D) to log out.

Once inside, the only commands you normally need:

  cd /opt/invento/deploy
  docker compose ps              # is everything running? (all "healthy"/"Up")
  docker compose logs -f backend  # watch the API log live (Ctrl+C to stop)

From ANOTHER computer (second laptop):
  1. Copy the PRIVATE key file ~/.ssh/invento_vps to the new computer
     (USB pen drive is best — never send keys on WhatsApp/email/chat).
  2. On the new computer:  chmod 600 ~/.ssh/invento_vps
  3. Then the same ssh command as above works.

From your PHONE (emergency checks):
  1. Install Termius (free) from the Play Store.
  2. Add a Host: address 31.42.125.143, username root,
     key = contents of ~/.ssh/invento_vps (paste once, it stays in the app).
  3. You can now run `docker compose ps` from your phone.

If ssh ever says "Permission denied": your key isn't being offered — make
sure you typed `-i ~/.ssh/invento_vps` and the file still exists.

--- C. ROTATE THE ATLAS DATABASE PASSWORD ---

Background: your shop data was COPIED from Atlas (cloud database) to the VPS
on 2026-10-07. The VPS now uses only its own database and NEVER talks to
Atlas again (verified — no Atlas address exists anywhere on the server).
So changing the Atlas password breaks nothing on the VPS. Do it because the
old password passed through chat.

Steps (5 minutes, nothing to type on any server):
  1. Go to https://cloud.mongodb.com and log in (Google login is fine).
  2. Top-left: make sure project "Invento" (or yours) is selected.
  3. Left menu: Security -> Database Access.
  4. Find user `platiodevelopers_db_user` -> click Edit.
  5. Click "Edit Password" (or autogenerate), set a new strong password,
     Save / Update User. Done.
  6. OPTIONAL but recommended: left menu -> Network Access -> check the
     allow-list. If it says 0.0.0.0/0 (open to the world) and you are done
     with Atlas, you can Delete the Atlas cluster entirely instead —
     MENU: Database -> ... -> Terminate. Only do this after the VPS has
     run fine for a few days.

NOTE: if you keep Render as a standby, its backend still uses the OLD Atlas
password, so Render would break after rotation. That is expected — update
Render's MONGO_URI env only if you want Render to keep working; otherwise
shut the Render service down (dashboard.render.com -> service -> Suspend).

--- D. CHANGE THE VPS ROOT PASSWORD (optional) ---

Password login is DISABLED on the VPS (keys only), so the old root password
is already useless to attackers. If you still want a fresh one for console
access via your provider's web panel:
  1. Log in with the key (section B).
  2. Run:  passwd
  3. Type the new password twice. Done. (It still can't be used over SSH.)

--- E. APP LOGIN + AUTOMATIC STANDBY (wired 2026-10-11) ---

Shop app: https://invento-lite.web.app
  Username: platiodevelopers@gmail.com
  Password: Platio9080            (owner account; type carefully — 5 wrong
                                  tries in a row look exactly like "login
                                  is broken", then the right password works)

How the two servers behave now (frontend tries in this order):
  1. PRIMARY = VPS https://invento-lite.duckdns.org (fast, live data).
  2. STANDBY = Render https://invento-0pap.onrender.com (free tier, sleeps
     when idle, takes ~30-60s to wake; used ONLY if the VPS is unreachable).
While on standby the app shows an amber banner with a "Retry main server"
button. After a failover, log in again on the standby — login tokens are
per-server and do not carry over.

Know the trade-offs:
  * Standby data is OLD (VPS database copy from 2026-10-07 plus anything
    done directly on Render since). After a VPS outage, check which sales/
    purchases happened on the standby and re-enter them on the VPS.
  * The stock-alerts crash (Decimal128, 2026-10-09) and container-log
    rotation (max 3x10MB per container) were fixed on the VPS on 2026-10-11.
  * Disk on the 10GB VPS (2026-10-11: 7.2G used / 78%): ~2.0G swapfile
    (needed, leave it), ~1.8G containerd leftovers (orphaned image layers,
    safe to leave), ~1.6G docker images, ~0.4G mongo data. If it fills up
    again run: apt-get clean, docker builder prune -f, and check
    /var/lib/docker/containers/*/*-json.log sizes.
  * Render dashboard (suspend/resume standby): dashboard.render.com ->
    service invento-lite-backend. Do NOT delete it — it is the rollback.
