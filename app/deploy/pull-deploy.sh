#!/usr/bin/env bash
# Pull-based deploy. Runs on the staging server as the `lms-deploy` user.
# CI triggers it over SSH; it fetches origin/main itself, so no files are copied
# from a laptop or from the Actions runner.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/lms/repo}"
BRANCH="${BRANCH:-main}"
APP_USER="${APP_USER:-lms}"

cd "$REPO_DIR"
echo "==> repo:   $REPO_DIR"
echo "==> before: $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"

git fetch --prune origin "$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd

node --check app/server.js
node --check app/oidc.js

sudo -n /bin/systemctl restart lms

ok=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4173/api/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
if [ "$ok" -ne 1 ]; then
  echo "!! health check failed after restart" >&2
  sudo -n /usr/bin/journalctl -u lms -n 50 --no-pager || true
  exit 1
fi

echo "==> after:  $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"
echo "==> health: $(curl -fsS http://127.0.0.1:4173/api/health)"
