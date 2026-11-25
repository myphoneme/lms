# Staging deployment — lms.phoneme.in

> **This staging host already runs Caddy for another product (GiveWings).**
> Do **not** install nginx and do **not** apply `deploy/nginx.conf` here: it would bind
> ports 80/443 and take that site down. Add `deploy/Caddyfile.lms` as a new Caddy site.
> `deploy/nginx.conf` is kept only for a dedicated LMS-only host.

Target: the existing Ubuntu VM at `staging.phoneme.in`, serving the LMS at
`https://lms.phoneme.in`, with staff signing in through **Phoneme Auth** (OIDC).

```
Mac: test → git push
        │
        └─ GitHub Actions ──SSH──> staging: /opt/lms/repo/deploy/pull-deploy.sh
                                        │ git fetch + reset (read-only deploy key)
                                        ▼
                                   /opt/lms/repo  ──> systemd: lms (127.0.0.1:4173)
                                        │
browser ──TLS──> Caddy (lms.phoneme.in) ─┘        SQLite /var/lib/lms/app.db
```

**Deploy model:** the runner never copies files. It SSHes to staging and runs a script that
does `git fetch && git reset --hard origin/main`, restarts the service and checks `/api/health`.

`staging.phoneme.in` is the machine; `lms.phoneme.in` is the product. Do not redirect the
staging hostname — another product lives there.

---

## 1. DNS

| Record | Type | Value | Purpose |
|---|---|---|---|
| `lms.phoneme.in` | A | `129.121.103.6` | product URL, OIDC redirect base |
| `staging.phoneme.in` | A | already set | existing host; leave alone |

`dig +short lms.phoneme.in` must return the staging IP before Caddy can issue a certificate.

## 2. One-time server preparation

```bash
# system users (idempotent)
adduser --system --group --home /opt/lms --shell /usr/sbin/nologin lms 2>/dev/null || true
adduser --system --group --home /home/lms-deploy --shell /bin/bash lms-deploy 2>/dev/null || true

install -d -o lms -g lms -m 750 /var/lib/lms
install -d -o root -g lms -m 750 /etc/lms
install -d -o lms-deploy -g lms-deploy -m 755 /opt/lms

# Node 22 LTS (node:sqlite needs 22.5+)
if ! node -v >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs rsync sqlite3 ca-certificates curl
fi
node -v
```

Do **not** install nginx or certbot on this host.

## 3. Three keys — do not mix them up

| Key | Lives on | Purpose | Access |
|---|---|---|---|
| **Personal push key** | your Mac (`~/.ssh/lms_github`) | `git push` to `myphoneme/lms` | repo **write** (collaborator) |
| **Staging read-only key** | staging, `/home/lms-deploy/.ssh/lms_github` | lets staging run `git fetch` | repo **read** deploy key |
| **CI inbound key** | Mac `~/.ssh/lms_deploy` → GitHub secret; public half in `lms-deploy` authorized_keys | lets Actions SSH to staging and run the deploy script | shell as `lms-deploy` |

### 3a. Staging read-only key (one time)

Fast path — as root on staging, run the initialiser. It creates the users, generates the
read-only key, waits while you add it in GitHub, clones the repo and runs the bootstrap:

```bash
bash /path/to/lms/app/deploy/staging-init.sh
# if the key is already added:
bash /path/to/lms/app/deploy/staging-init.sh --key-added
```

The manual equivalent follows.

On staging, as root:

```bash
install -d -o lms-deploy -g lms-deploy -m 700 /home/lms-deploy/.ssh
sudo -u lms-deploy ssh-keygen -t ed25519 -C "lms-staging-readonly" \
  -f /home/lms-deploy/.ssh/lms_github -N ""
cat /home/lms-deploy/.ssh/lms_github.pub
```

GitHub → `myphoneme/lms` → **Settings → Deploy keys → Add deploy key** → paste, leave
"Allow write access" **unchecked** (read-only is enough for pulling).

```bash
sudo -u lms-deploy ssh-keyscan github.com >> /home/lms-deploy/.ssh/known_hosts
sudo -u lms-deploy tee /home/lms-deploy/.ssh/config >/dev/null <<'CFG'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/lms_github
  IdentitiesOnly yes
CFG
chown lms-deploy:lms-deploy /home/lms-deploy/.ssh/config
chmod 600 /home/lms-deploy/.ssh/config
```

Then clone once (repo stays a normal checkout):

```bash
sudo -u lms-deploy git clone git@github.com:myphoneme/lms.git /opt/lms/repo
sudo -u lms-deploy git -C /opt/lms/repo log --oneline -1
```

### 3b. CI inbound key

On your Mac:

```bash
ssh-copy-id -i ~/.ssh/lms_deploy.pub lms-deploy@staging.phoneme.in
# or, since you have root:
cat ~/.ssh/lms_deploy.pub | ssh root@staging.phoneme.in \
  'install -d -m700 -o lms-deploy -g lms-deploy /home/lms-deploy/.ssh && \
   tee -a /home/lms-deploy/.ssh/authorized_keys >/dev/null && \
   chown lms-deploy:lms-deploy /home/lms-deploy/.ssh/authorized_keys && \
   chmod 600 /home/lms-deploy/.ssh/authorized_keys'
```

GitHub → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `STAGING_HOST` | `staging.phoneme.in` |
| `STAGING_USER` | `lms-deploy` |
| `STAGING_SSH_KEY` | full contents of `~/.ssh/lms_deploy` (BEGIN/END lines included) |
| `STAGING_KNOWN_HOSTS` | `ssh-keyscan -H staging.phoneme.in` from your Mac |

If SSH warns that the host key changed, see Troubleshooting.

## 4. First bootstrap

```bash
cd /opt/lms/repo/app && bash deploy/bootstrap.sh
```

Creates/repairs `lms` and `lms-deploy`, `/var/lib/lms`, `/etc/lms`, Node 22 if missing, the
systemd unit, the sudoers rule for restart-only, and the symlink `/opt/lms/current → /opt/lms/repo`.
It does not touch Caddy and does not start the service until the env file exists.

```bash
nano /etc/lms/lms.env        # APP_BASE_URL, DB_PATH, SSO values
systemctl enable --now lms
curl -fsS http://127.0.0.1:4173/api/health
```

For the first boot without an auth client yet: `PHONEME_AUTH_ENABLED=0`.

## 5. Caddy and TLS

DNS first, then:

```bash
cp /opt/lms/repo/app/deploy/Caddyfile.lms /etc/caddy/conf.d/lms.caddy
# if /etc/caddy/Caddyfile does not `import /etc/caddy/conf.d/*`, append that file instead
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Caddy obtains and renews the certificate automatically. The existing GiveWings site and its
certificate are untouched.

## 6. CI/CD pipeline

Every push to `main` runs [`.github/workflows/deploy-staging.yml`](../.github/workflows/deploy-staging.yml):

1. **verify** — rebuilds curriculum and coverage, checks syntax, and fails if generated files
   differ from what was committed. Run the same locally with `npm run preflight` in `app/`.
2. **deploy** — SSHes to staging and runs `deploy/pull-deploy.sh`, which:
   - records the current SHA,
   - `git fetch` + `git reset --hard origin/main` + `git clean -fd`,
   - syntax-checks the server entrypoints,
   - restarts `lms`,
   - polls `/api/health` for up to 30 seconds, prints the new SHA, and fails the job (with
     `journalctl` output) if the service does not come back.

Manual deploy, same path:

```bash
sudo -u lms-deploy /opt/lms/repo/deploy/pull-deploy.sh
```

## 7. Environment keys

Install `/etc/lms/lms.env` from `deploy/lms.env.example`, `640 root:lms`.

| Key | Where it comes from | Notes |
|---|---|---|
| `APP_BASE_URL` | you | `https://lms.phoneme.in`; enables Secure cookies; must match the OIDC redirect base |
| `DB_PATH` | you | `/var/lib/lms/app.db`, outside the checkout so `git clean` cannot touch it |
| `PHONEME_AUTH_ISSUER` | auth team | base URL, no trailing slash; must match `iss` |
| `PHONEME_AUTH_CLIENT_ID` | auth team | `lms` |
| `PHONEME_AUTH_CLIENT_SECRET` | auth team | the only real secret; `openssl rand -hex 32` if they let you choose |
| `PHONEME_AUTH_REDIRECT_URI` | you | `https://lms.phoneme.in/auth/callback`, byte-identical to the registration |
| `PHONEME_AUTH_ALLOWED_DOMAIN` | you | `phoneme.in` |
| `PHONEME_TENANT_SLUG` | you | `phoneme` — create that workspace first |
| `PHONEME_AUTH_LOCAL_LOGIN` | you | `1` for break-glass; `0` once SSO admin works |

No cookie-signing or JWT secret exists to configure: sessions are random server-side tokens and
ID tokens are verified against the provider's public keys. TLS keys belong to Caddy.

## 8. Phoneme Auth client registration

| Setting | Value |
|---|---|
| Client ID | `lms` |
| Redirect URI | `https://lms.phoneme.in/auth/callback` (exact) |
| Post-logout redirect | `https://lms.phoneme.in` |
| Scopes | `openid profile email` |
| Grant | authorization code + PKCE (S256) |
| Token auth | `client_secret_post` (set `PHONEME_AUTH_TOKEN_AUTH=basic` if required) |
| Signing | RS256 or ES256 with a reachable JWKS |
| Claims | `email`, `name`, group claim (default `groups`) |

Group mapping: `lms-admins` → administrator, `lms-coordinators` → course coordinator, none → learner.
Rename the env values if the auth team uses different groups.

## 9. First run

1. `https://lms.phoneme.in/setup` → create the **Phoneme** workspace, slug `phoneme`, owner account.
2. Sign out, sign in through Phoneme Auth, confirm the admin group maps to administrator.
3. **Control room → Roster → Add a person → Course coordinator**, or add the person to
   `lms-coordinators` and let SSO carry the role.
4. Set `PHONEME_AUTH_LOCAL_LOGIN=0`, restart, and confirm you can still sign in through SSO.

## 10. Operations

```bash
journalctl -u lms -f
curl -fsS https://lms.phoneme.in/api/health
sudo -u lms-deploy /opt/lms/repo/deploy/pull-deploy.sh      # deploy now
git -C /opt/lms/repo log --oneline -5                        # what is running
```

Backup:

```bash
sqlite3 /var/lib/lms/app.db ".backup '/var/backups/lms-$(date +%F).db'"
```

Rollback: `git revert <sha>` and push (the pipeline redeploys), or temporarily:

```bash
sudo -u lms-deploy git -C /opt/lms/repo reset --hard <good-sha>
sudo systemctl restart lms
```

The next pipeline run resets to `origin/main`, so make the revert permanent in git.

## 11. Troubleshooting

**`Permission denied (publickey)` from GitHub Actions** — `STAGING_SSH_KEY` does not match an
`authorized_keys` entry for `lms-deploy`. Re-copy the public key (3b) and confirm
`ssh -i ~/.ssh/lms_deploy lms-deploy@staging.phoneme.in 'id'`.

**`Permission denied (publickey)` when staging pulls** — the read-only deploy key is not on the
repo, or `~/.ssh/config` is missing. Test:
`sudo -u lms-deploy git -C /opt/lms/repo fetch origin main`.

**Host key changed** — a rebuilt VM. Verify from the server console:
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. If it matches what your Mac sees, then on
your **Mac**:

```bash
ssh-keygen -R staging.phoneme.in
ssh-keyscan -t ed25519 staging.phoneme.in >> ~/.ssh/known_hosts
ssh-keyscan -H staging.phoneme.in > /tmp/staging-known-hosts   # refresh the CI secret
```

Do not disable host checking.

**Health check fails after deploy** — `journalctl -u lms -n 80 --no-pager`; the previous release is
still in git, so fixing forward is one revert away.

**Caddy serves no certificate for lms** — DNS not propagated, or ports 80/443 not reachable from
the internet. `dig +short lms.phoneme.in`, then `journalctl -u caddy -n 50`.

## 12. Security checklist

- [ ] `/etc/lms/lms.env` is `640 root:lms`; the client secret exists only there and at the IdP.
- [ ] Staging deploy key is **read-only**; CI inbound key is separate and limited to `lms-deploy`.
- [ ] `PHONEME_AUTH_ALLOWED_DOMAIN=phoneme.in`; a personal account is refused.
- [ ] Local login disabled after SSO admin is proven.
- [ ] HSTS + frame denial from the Caddy block; Node bound to `127.0.0.1`.
- [ ] `/var/lib/lms` is 750 and backed up.
- [ ] `git log --all -- .env` prints nothing.
