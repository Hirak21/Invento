#!/usr/bin/env bash
# Invento Lite — MongoDB 8.0 local install + single-node replica set (rs0)
# Safe to re-run: every step is idempotent.
# Usage:  sudo ./scripts/setup_mongodb.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then echo "Run with sudo: sudo $0"; exit 1; fi

echo "== 1/5 Installing prerequisites =="
apt-get update -qq
apt-get install -y -qq gnupg curl >/dev/null

echo "== 2/5 Importing MongoDB GPG key =="
if [[ -f /usr/share/keyrings/mongodb-server-8.0.gpg ]]; then
  echo "    key already present, skipping"
else
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
    | gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg
fi

echo "== 3/5 Adding apt repo (bookworm component — correct for Debian 13/trixie) =="
REPO_LIST=/etc/apt/sources.list.d/mongodb-org-8.0.list
if grep -q "repo.mongodb.org" "$REPO_LIST" 2>/dev/null; then
  echo "    repo already configured"
else
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/8.0 main" > "$REPO_LIST"
fi
apt-get update -qq

echo "== 4/5 Installing mongodb-org =="
if command -v mongod >/dev/null 2>&1; then
  echo "    mongod already installed: $(mongod --version | head -1)"
else
  apt-get install -y -qq mongodb-org >/dev/null
  echo "    installed: $(mongod --version | head -1)"
fi

echo "== 5/5 Configuring single-node replica set rs0 =="
CONF=/etc/mongod.conf
if grep -q "replSetName" "$CONF"; then
  echo "    replication already configured"
else
  printf "\nreplication:\n  replSetName: rs0\n" >> "$CONF"
fi

systemctl enable --now mongod >/dev/null 2>&1 || systemctl restart mongod
sleep 2

# Initiate replica set if not yet initiated
if ! mongosh --quiet --eval "rs.status().ok" 2>/dev/null | grep -q "1"; then
  mongosh --quiet --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "127.0.0.1:27017"}]})' >/dev/null
  sleep 3
fi

STATUS=$(mongosh --quiet --eval "rs.status().ok" 2>/dev/null)
if [[ "$STATUS" == "1" ]]; then
  echo ""
  echo "SUCCESS: MongoDB running as single-node replica set rs0 on mongodb://127.0.0.1:27017"
  echo "Transactions are available."
else
  echo "WARNING: replica set status check returned '$STATUS' — run: sudo systemctl status mongod"
fi
