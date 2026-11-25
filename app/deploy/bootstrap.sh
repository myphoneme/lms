#!/usr/bin/env bash
# Run as root ON THE STAGING SERVER, after the code has been copied to
# /opt/lms/current/app. Creates users and directories, installs Node 22 if
# missing, installs the systemd unit and prints the remaining manual steps.
#
# It does NOT touch the existing Caddy site for other products, and it does not
# start the LMS until /etc/lms/lms.env exists.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run as root on the staging server." >&2; exit 1; }
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "App directory: $APP_DIR"

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "Installing Node.js 22 from NodeSource..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg rsync sqlite3
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

id lms >/dev/null 2>&1 || adduser --system --group --home /opt/lms --shell /usr/sbin/nologin lms
id lms-deploy >/dev/null 2>&1 || adduser --system --group --home /home/lms-deploy --shell /bin/bash lms-deploy

install -d -o lms -g lms -m 750 /var/lib/lms
install -d -o lms -g lms -m 755 /opt/lms
install -d -o root -g lms -m 750 /etc/lms

# Code is a git clone at /opt/lms/repo; current is a symlink so systemd paths stay stable.
if [ -d /opt/lms/repo/app ]; then
  ln -sfn /opt/lms/repo /opt/lms/current
  chgrp -R lms /opt/lms/repo 2>/dev/null || true
  chmod -R g+rX /opt/lms/repo
else
  install -d -o lms -g lms -m 755 /opt/lms/current
fi

install -m 644 "$APP_DIR/deploy/lms.service" /etc/systemd/system/lms.service
systemctl daemon-reload

if [ ! -f /etc/lms/lms.env ]; then
  install -m 640 -o root -g lms "$APP_DIR/deploy/lms.env.example" /etc/lms/lms.env
  echo "Created /etc/lms/lms.env from the example — edit it before starting."
else
  echo "/etc/lms/lms.env already exists, leaving it alone."
fi

install -m 440 "$APP_DIR/deploy/lms-deploy.sudoers" /etc/sudoers.d/lms-deploy

cat <<'NEXT'

Next, on this server:
  1. Edit /etc/lms/lms.env and set PHONEME_AUTH_CLIENT_SECRET (or leave
     PHONEME_AUTH_ENABLED=0 until the auth client is registered).
  2. Add the Caddy site block:
       cp <app>/deploy/Caddyfile.lms /etc/caddy/conf.d/lms.caddy
       (or append its contents to /etc/caddy/Caddyfile if conf.d is not imported)
       caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
  3. systemctl enable --now lms && curl -fsS http://127.0.0.1:4173/api/health

Do NOT install nginx on this host and do NOT apply deploy/nginx.conf: Caddy
already owns ports 80/443 for the other staging products.
NEXT
