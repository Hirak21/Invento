#!/usr/bin/env bash
# Invento Lite — one-time VPS setup (Ubuntu 22.04/24.04). Run as root or with sudo.
# Installs Docker + compose plugin, hardens the firewall, creates /opt/invento.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (or with sudo)." >&2
  exit 1
fi

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  echo "    docker already installed: $(docker --version)"
fi

echo "==> Firewall (UFW): allow SSH/HTTP/HTTPS only"
apt-get install -y ufw
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status numbered | head -12

echo "==> Swap file (2GB safety net for small RAM boxes)"
if ! swapon --show | grep -q "/swapfile"; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q "/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
  echo "    2GB swap enabled"
else
  echo "    swap already present"
fi

echo "==> App directory"
mkdir -p /opt/invento/deploy
echo "    /opt/invento/deploy ready — copy deploy/ files there, then follow VPS_RUNBOOK.md"
echo "DONE."
