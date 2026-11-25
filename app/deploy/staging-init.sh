#!/usr/bin/env bash
# First-time setup on the staging host. Run as root, once.
# Creates the deploy user, generates the READ-ONLY GitHub key, clones the repo,
# then hands off to deploy/bootstrap.sh.
#
#   bash staging-init.sh             # pauses so you can add the key in GitHub
#   bash staging-init.sh --key-added # key already added to the repo
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run as root on staging." >&2; exit 1; }
REPO_URL="${REPO_URL:-git@github.com:myphoneme/lms.git}"
REPO_DIR="${REPO_DIR:-/opt/lms/repo}"
KEY_ADDED=0
[ "${1:-}" = "--key-added" ] && KEY_ADDED=1

id lms >/dev/null 2>&1 || adduser --system --group --home /opt/lms --shell /usr/sbin/nologin lms
id lms-deploy >/dev/null 2>&1 || adduser --system --group --home /home/lms-deploy --shell /bin/bash lms-deploy

install -d -o lms -g lms -m 750 /var/lib/lms
install -d -o root -g lms -m 750 /etc/lms
install -d -o lms-deploy -g lms-deploy -m 700 /home/lms-deploy/.ssh
install -d -o lms-deploy -g lms-deploy -m 755 /opt/lms

KEY=/home/lms-deploy/.ssh/lms_github
if [ ! -f "$KEY" ]; then
  sudo -u lms-deploy ssh-keygen -t ed25519 -C "lms-staging-readonly" -f "$KEY" -N ""
fi

if [ "$KEY_ADDED" -eq 0 ]; then
  cat <<MSG

Add this public key to GitHub:
  repo → Settings → Deploy keys → Add deploy key
  title: lms staging (read-only)   |   Allow write access: NO

MSG
  cat "$KEY.pub"
  echo
  read -r -p "Press Enter once the key is added... " _
fi

CONFIG=/home/lms-deploy/.ssh/config
if ! grep -q "IdentityFile ~/.ssh/lms_github" "$CONFIG" 2>/dev/null; then
  sudo -u lms-deploy tee "$CONFIG" >/dev/null <<'CFG'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/lms_github
  IdentitiesOnly yes
CFG
  chown lms-deploy:lms-deploy "$CONFIG"
  chmod 600 "$CONFIG"
fi

sudo -u lms-deploy ssh-keyscan github.com >> /home/lms-deploy/.ssh/known_hosts 2>/dev/null || true
chown lms-deploy:lms-deploy /home/lms-deploy/.ssh/known_hosts
chmod 600 /home/lms-deploy/.ssh/known_hosts

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "Cloning $REPO_URL → $REPO_DIR"
  sudo -u lms-deploy git clone "$REPO_URL" "$REPO_DIR"
else
  echo "Repo already cloned at $REPO_DIR"
fi

echo "Bootstrap:"
cd "$REPO_DIR/app" && bash deploy/bootstrap.sh

echo
echo "Now edit /etc/lms/lms.env, add the Caddy site, then:"
echo "  systemctl enable --now lms && curl -fsS http://127.0.0.1:4173/api/health"
