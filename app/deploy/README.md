# Staging deployment — lms.phoneme.in

> **This staging host already runs Caddy for another product (GiveWings).**
> Do **not** install nginx and do **not** apply `deploy/nginx.conf` here: it would bind
> ports 80/443 and take that site down. Use `deploy/Caddyfile.lms` as an additional
> Caddy site block. `deploy/nginx.conf` is kept only for a dedicated LMS host.

Target: one Ubuntu 22.04/24.04 VM reachable as `staging.phoneme.in`, serving the LMS at
`https://lms.phoneme.in`, with staff signing in through **Phoneme Auth** (OIDC).

```
browser ──TLS──> nginx (lms.phoneme.in) ──> node server.js 127.0.0.1:4173 ──> SQLite /var/lib/lms/app.db
                                   │
                                   └──OIDC──> https://auth.phoneme.in
```

`staging.phoneme.in` is the machine. `lms.phoneme.in` is the product and the URL users see.
Point both at the same IP; nginx redirects the staging hostname to the product hostname.

---

## 1. DNS

| Record | Type | Value | Purpose |
|---|---|---|---|
| `lms.phoneme.in` | A | staging VM public IP | product URL, OIDC redirect base |
| `staging.phoneme.in` | A / CNAME | same IP | hostname alias only |

Wait for propagation before requesting certificates: `dig +short lms.phoneme.in`.

## 2. Server bootstrap (once)

```bash
sudo adduser --system --group --home /opt/lms lms
sudo adduser --system --group --home /home/lms-deploy lms-deploy
sudo mkdir -p /opt/lms/current/app /var/lib/lms /etc/lms
sudo chown -R lms:lms /opt/lms /var/lib/lms
sudo chmod 750 /var/lib/lms

# Node 22 LTS (node:sqlite needs 22.5+)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx rsync
node -v    # must print v22.x or newer
```

## 3. Phoneme Auth client registration

Ask the auth team to register a **confidential web client**:

| Setting | Value |
|---|---|
| Client ID | `lms` |
| Client secret | issued by the auth team (or generate with `openssl rand -hex 32` and give it to them) |
| Redirect URI | `https://lms.phoneme.in/auth/callback` — exact match |
| Post-logout redirect | `https://lms.phoneme.in` |
| Scopes | `openid profile email` |
| Grant | authorization code + PKCE (S256) |
| Token auth | `client_secret_post` (if they require `client_secret_basic`, set `PHONEME_AUTH_TOKEN_AUTH=basic`) |
| ID token signing | RS256 or ES256, with `kid` in the header and a reachable JWKS |
| Claims used | `email`, `name`, group claim (default `groups`) |

The adapter verifies signature, issuer, audience, expiry and nonce. It needs no other endpoint
than the standard discovery document: `https://auth.phoneme.in/.well-known/openid-configuration`.

Group names expected (change the env values if the auth team uses different ones):

- `lms-admins` → administrator (grading, roster, branding)
- `lms-coordinators` → course coordinator (curriculum, review, complexity)
- no group → learner

### If ssh says the host key changed

A rebuilt staging VM produces new host keys, and strict checking refuses to continue. That warning
is correct: verify before you trust it. On the server console run:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Compare the SHA256 fingerprint with the one your laptop reports for the host. If they match, clear
the stale entries and record the new key:

Run this **on your laptop**, not on the server — the keypair lives on your machine:

```bash
ssh-keygen -R staging.phoneme.in
ssh-keyscan -t ed25519 staging.phoneme.in >> ~/.ssh/known_hosts
ssh root@staging.phoneme.in 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub'
```

Once the fingerprint matches, install the deploy key for CI (after `bootstrap.sh`
has created `lms-deploy`):

```bash
cat ~/.ssh/lms_deploy.pub | ssh root@staging.phoneme.in \
  'install -d -m700 -o lms-deploy -g lms-deploy /home/lms-deploy/.ssh && \
   tee -a /home/lms-deploy/.ssh/authorized_keys >/dev/null && \
   chown lms-deploy:lms-deploy /home/lms-deploy/.ssh/authorized_keys && \
   chmod 600 /home/lms-deploy/.ssh/authorized_keys'
```

If they do not match, stop and ask whoever provisioned the VM. Do not disable host checking.
CI uses `STAGING_KNOWN_HOSTS`, so refresh that secret with the same verified `ssh-keyscan` output.

## 4. Environment file — the keys

Install `/etc/lms/lms.env` from `deploy/lms.env.example`. Never commit the real file.

```bash
sudo install -o root -g lms -m 640 deploy/lms.env.example /etc/lms/lms.env
sudo nano /etc/lms/lms.env
```

| Key | Where it comes from | Notes |
|---|---|---|
| `APP_BASE_URL` | you | `https://lms.phoneme.in`. Cookies are marked `Secure` because this is https. A wrong value breaks the OIDC redirect. |
| `DB_PATH` | you | `/var/lib/lms/app.db` — outside the code directory so deploys never touch data. |
| `PHONEME_AUTH_ISSUER` | auth team | Base URL only, no trailing slash. Must match the `iss` claim exactly. |
| `PHONEME_AUTH_CLIENT_ID` | auth team | `lms` |
| `PHONEME_AUTH_CLIENT_SECRET` | auth team | **the only real secret.** `openssl rand -hex 32` if they let you set it. |
| `PHONEME_AUTH_REDIRECT_URI` | you | Must be byte-identical to what is registered. |
| `PHONEME_AUTH_ALLOWED_DOMAIN` | you | `phoneme.in`. Blocks personal accounts. |
| `PHONEME_TENANT_SLUG` | you | Workspace SSO users land in; create it first (step 7). |
| `PHONEME_AUTH_LOCAL_LOGIN` | you | `1` keeps a break-glass owner login. Set `0` when SSO admin access is proven. |

There is **no cookie-signing secret and no JWT secret** to set: sessions are 256-bit random tokens
stored server-side, and ID tokens are verified against the provider's public keys.

Permissions and rotation:

```bash
sudo chown root:lms /etc/lms/lms.env && sudo chmod 640 /etc/lms/lms.env
# rotate the client secret at the IdP, update the file, then:
sudo systemctl restart lms
```

If a secret is ever committed, rotate it at the IdP first; scrubbing git history is secondary.

## 5. Code, service, TLS

Copy the code from your machine (the key copy in step 6 is for CI; for the first
deploy, root over SSH is fine):

```bash
rsync -az --delete --exclude 'data/' --exclude 'node_modules/' \
  app/ root@staging.phoneme.in:/opt/lms/current/app/
```

Then on the server:

```bash
cd /opt/lms/current/app && bash deploy/bootstrap.sh
```

`bootstrap.sh` creates `lms` and `lms-deploy`, `/var/lib/lms`, `/etc/lms`, installs Node 22
if missing, installs the systemd unit and the sudoers rule. It does **not** touch Caddy.

TLS is handled by the existing Caddy, not certbot/nginx:

```bash
sudo cp /opt/lms/current/app/deploy/Caddyfile.lms /etc/caddy/conf.d/lms.caddy
# if /etc/caddy/Caddyfile does not import conf.d, append the block instead
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Publish the DNS record **before** reloading Caddy: `lms.phoneme.in` A → the staging IP.
Caddy then issues the certificate on first request. No certbot step.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lms
curl -fsS http://127.0.0.1:4173/api/health
```

TLS and nginx:

```bash
Only `127.0.0.1:4173` is exposed; the Node process is never public. TLS and HSTS come
from the Caddy block in `deploy/Caddyfile.lms`.

## 6. Git — repository and keys

Create the repo once (GitHub organisation `myphoneme`, repo `lms`), then push from your machine.

### Your push key

```bash
ssh-keygen -t ed25519 -C "you@phoneme.in" -f ~/.ssh/lms_github
cat ~/.ssh/lms_github.pub    # add to GitHub → Settings → SSH and GPG keys
```

`~/.ssh/config`:

```
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/lms_github
  IdentitiesOnly yes
```

Then:

```bash
cd "/Users/DELL/workspace/Training Courses"
git remote add origin git@github.com:myphoneme/lms.git
git push -u origin main
```

Verify: `ssh -T git@github.com` → "Hi <user>! You've successfully authenticated".

If `git push` says **Permission to myphoneme/lms.git denied**, the key is authenticated but has no
write access to that repo. Two fixes, either is fine:

1. Add your GitHub user as a collaborator with **Write** on `myphoneme/lms` (repo → Settings →
   Collaborators), then push over `git@github.com:myphoneme/lms.git`.
2. Add a **new deploy key with write access** (repo → Settings → Deploy keys → Add, tick
   "Allow write access") for a key you control, and use the SSH host alias that selects it.
   Existing deploy keys are often read-only, which produces exactly this error.

A personal access token with `Contents: write` on that repo also works as the HTTPS password.

Alternative to SSH: a fine-grained PAT scoped to `myphoneme/lms` with **Contents: read/write**,
used once as the password for an HTTPS remote. SSH keys are preferable for daily use.

### CI deploy key (separate from your personal key)

Never reuse your personal key in CI. Generate a dedicated keypair with no passphrase:

```bash
ssh-keygen -t ed25519 -C "github-actions@lms" -f ./lms_deploy -N ""
# public half → staging server:
ssh-copy-id -i ./lms_deploy.pub lms-deploy@staging.phoneme.in
# private half → GitHub repo → Settings → Secrets and variables → Actions
```

Add the deploy user to sudoers with only the restart permission:

```bash
sudo install -m 440 deploy/lms-deploy.sudoers /etc/sudoers.d/lms-deploy
```

### GitHub Actions secrets

| Secret | Value |
|---|---|
| `STAGING_HOST` | `staging.phoneme.in` |
| `STAGING_USER` | `lms-deploy` |
| `STAGING_SSH_KEY` | full private key including `-----BEGIN…` lines |
| `STAGING_KNOWN_HOSTS` | output of `ssh-keyscan -H staging.phoneme.in` |

`../.github/workflows/deploy-staging.yml` validates the curriculum, rsyncs `app/`, restarts the
service and fails the job if `https://lms.phoneme.in/api/health` does not answer.

Server-side DNS for git is not needed; the staging VM does not pull from GitHub. If you prefer
pull-based deploys later, add a read-only **deploy key** to the repo instead of the CI ssh key.

## 7. First run

1. Open `https://lms.phoneme.in/setup` and create the **Phoneme** workspace. Use slug `phoneme`
   to match `PHONEME_TENANT_SLUG`. This account is the owner (break-glass).
2. Sign out and sign in with Phoneme Auth. Confirm the admin group maps to administrator.
3. Create the first coordinator: **Control room → Roster → Add a person → Course coordinator**.
   Coordinators can then add/remove topics, verify content and adjust complexity and grading
   without seeing the roster or branding.
4. Set `PHONEME_AUTH_LOCAL_LOGIN=0` once SSO is confirmed, and restart.

## 8. Operations

```bash
sudo journalctl -u lms -f                       # logs
curl -fsS https://lms.phoneme.in/api/health     # health
sudo systemctl restart lms                      # restart
```

Backup (SQLite WAL — copy all three files or use the backup API):

```bash
sudo -u lms sqlite3 /var/lib/lms/app.db ".backup '/var/backups/lms-$(date +%F).db'"
```

Rollback: `git revert <sha>`, push, let the workflow redeploy. The database is untouched by deploys.

## 9. Security checklist

- [ ] `/etc/lms/lms.env` is `640 root:lms`; the secret exists only there and in the IdP.
- [ ] `PHONEME_AUTH_ALLOWED_DOMAIN=phoneme.in`; test a personal account is refused.
- [ ] Local login disabled after SSO admin is proven.
- [ ] HSTS, TLS 1.2+, `X-Frame-Options: DENY` present (nginx config).
- [ ] Node bound to `127.0.0.1`; only nginx is public.
- [ ] `/var/lib/lms` is 750 and included in backups.
- [ ] Deploy key is dedicated, no passphrase, restricted to this repo/environment.
- [ ] `git log --all -- .env` prints nothing.
