# L1 Academy

A self-contained, white-label training platform for freshers joining a datacenter / cloud / security services company. It turns a topic sheet into eight weeks of job-shaped lessons, scored tests, graded daily drills and a verifiable certificate — with a leaderboard scoped to one company.

Built for one specific failure: **L1 escalating work it should close.** Every lesson starts from a real ticket, ends with the check that closes or correctly escalates it, and the scoreboard measures evidence rather than attendance.

---

## Run it

Requires **Node 22.5+** (uses the built-in `node:sqlite`). No `npm install`, no build step, no external service.

```bash
cd app
node server.js                 # http://127.0.0.1:4173
```

First run opens the setup wizard: company name, code, colours, signatory, pass mark and the owner account. That is the "configure at purchase" step a buying company fills in.

To explore with a realistic cohort instead:

```bash
node scripts/seed_demo.mjs --reset
# admin    admin@northwind.example / demo12345
# learner  asha@northwind.example / demo12345
```

The demo tenant is fictional. Delete `data/app.db` to start clean.

| Env | Default | Meaning |
|---|---|---|
| `PORT` | `4173` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address — keep loopback behind nginx |
| `APP_BASE_URL` | `http://host:port` | Public URL; enables Secure cookies and the OIDC redirect |
| `DB_PATH` | `data/app.db` | Put this outside the deploy directory in production |
| `PHONEME_AUTH_*` | unset | OIDC SSO. See `deploy/README.md` and `deploy/lms.env.example` |

---

## Roles

| Role | Sees | Can |
|---|---|---|
| Learner | Today, Course, Practice, Leaderboard, Library, Certificate | take the diagnostic, lessons, tests, drills |
| **Course coordinator** | Control room: Curriculum, Review queue, Complexity & grading | add/remove topics for the company, verify content, set per-topic complexity, read and adjust pass/attempts/certificate rules |
| Administrator | all coordinator tabs + Grading, Roster, Brand & rules | everything above, grade drills, create accounts (including coordinators), branding |
| Owner | all administrator tabs + Companies | provision additional tenants |

Coordinators are created in **Control room → Roster → Add a person**. With SSO, a member of the
`lms-coordinators` group is mapped to the role automatically. A coordinator never sees the roster,
brand settings, grading queue or other companies.

Curriculum changes are **per company**: removing a shared topic hides it for that tenant only,
while coordinator-added topics are tenant-owned. Review decisions (verified / changes requested)
record the reviewer's name and timestamp, and a verified lesson shows a badge to learners.

## What the learner does

1. **Diagnostic** — 15 questions across networking, Linux, Windows, security, SOC, IR and automation. Scored by domain; returns a weakest-three profile and a recommended starting track. Not graded, but gates the course so nobody skips straight to lesson 1 without a baseline.
2. **Lessons** — 48 lessons across 8 modules. Each has a work order (ticket), 4–6 prose sections, an authored animated diagram, one curated short video, a command table, pitfalls, takeaways and a 5–10 minute drill.
3. **Module test** — 10 MCQs, 70% to pass, 3 attempts, best score counts. Explanations arrive after submission, never in the payload.
4. **Daily drills** — 40 practicals, five per week, level 1→4. Submit commands + output + conclusion. A mentor grades against a 3-criterion rubric (weights sum to 100).
5. **Leaderboard** — points from quiz average, graded drills and lesson completion; rank is per company.
6. **Certificate** — issued automatically at 80% readiness, all 8 modules passed, and 32+ drills graded 70+. Carries a verification code and a public `/verify/<code>` page.

## Curriculum coverage

All 144 rows of the source sheet are mapped. 129 data rows + 15 section headers; the mapping is enforced by `covers` in `content/skeleton.json` and checked at build time.

`node scripts/build_coverage.mjs` writes `research/Topic_Coverage.csv` — one line per sheet row with the lesson that teaches it. Current result: **129/129 mapped, 0 unmapped**.

Curated library: `research/L1_Academy_Resource_Library.xlsx` (96 resources, 12 per module, every link checked). The same list is served in-app under **Library**, with a download button.

| # | Module | Lessons | Drills |
|---|---|---|---|
| 1 | Networking foundations | 6 | 5 |
| 2 | Linux for the desk | 6 | 5 |
| 3 | Windows and PowerShell | 6 | 5 |
| 4 | Security fundamentals | 6 | 5 |
| 5 | Offensive security, legally | 6 | 5 |
| 6 | SOC, SIEM and detection | 6 | 5 |
| 7 | Incident response and forensics | 6 | 5 |
| 8 | Automation and scripting | 6 | 5 |

Reference cards (ports, Linux/Windows commands, Wireshark filters, Windows event IDs, vulnerability→fix, capstones) live in the Library.

## Grading, exactly

```
quizAvg        = mean(best % across the 8 module tests)
drillAvg       = sum(graded drill scores) / 40        (missing = 0)
overall        = 0.5 * quizAvg + 0.5 * drillAvg
points         = quizAvg*10 + drillAvg*10 + lessonsCompleted*2
certificate    = overall >= cert_pct(80)
                 AND all 8 quizzes >= pass_pct(70)
                 AND drills scored >=70 count >= 32
```

`pass_pct`, `attempts` and `cert_pct` are per-company settings, not constants.

## White-label / multi-tenant

- One deployment, many companies. Each tenant has its own slug (login code), invite code, branding, signatory, certificate title, pass mark, cohort roster, leaderboard and certificates.
- Owner (first account) can create further companies from **Control room → Companies**.
- Learner-facing surfaces never expose another tenant's data; every admin query is scoped by `tenant_id`.
- Configure branding at any time in **Control room → Brand & rules**; changes apply on next page load.

## Admin operations

- **Grading** — queue of submitted drills, evidence, rubric with weights, weighted total, written feedback. Publishing a grade can immediately unlock a certificate.
- **Roster** — baseline score, readiness, modules passed, drills graded. CSV paste import (`name,email[,password]`) generates passwords once.
- **Export** — `/api/admin/export.csv`, per company.
- **Content reload** — `POST /api/admin/reload` (owner) after editing JSON, no restart.

## Content model

```
content/
  skeleton.json          module + lesson metadata, sheet-topic coverage map
  curriculum.json        generated: lessons, quizzes, assignments
  references.json        printable reference cards
  preassessment.json     15-question diagnostic
  resources.json         curated library (built from research/)
  modules/m1..m8/*.json  authored source: lessons-a, lessons-b, quiz-assignments
  CONTENT_SPEC.md        the writing spec every lesson follows
```

Rebuild after editing module files:

```bash
node scripts/build_curriculum.mjs   # validates schema, rubric sums, coverage, video IDs
node scripts/verify_content.mjs     # live oEmbed check on every video + duplicate/slop scan
```

Lessons are data. A company can add a module without touching the server: add to `skeleton.json`, write `content/modules/m9/*.json`, rebuild, reload.

## What was verified

- 48/48 lessons, 8/8 quizzes (80 questions), 40/40 drills assemble with schema validation and zero errors.
- 43,124 words of prose; average 898 words per lesson.
- Every video ID checked against YouTube oEmbed (47 unique, 0 failing).
- Every curated library link checked at build time (`content/resource-check.json`).
- 129/129 source-sheet rows mapped to a lesson (`research/Topic_Coverage.csv`).
- 25 API checks: auth, attempt caps, answer non-leakage, admin scoping, CSV export, certificate verification and cross-tenant isolation.
- End-to-end browser test: register → diagnostic → drill submission → admin grading → certificate; quiz with no answer leakage; mobile navigation; zero console errors.

## Phoneme Auth (SSO)

`oidc.js` implements the authorization-code flow with PKCE, state, nonce and RS256/ES256 ID-token
verification against the provider's JWKS. It is off unless `PHONEME_AUTH_ENABLED=1`; local
email/password login keeps working as break-glass.

- Group claim → role: admin group → administrator, coordinator group → course coordinator, else learner.
- Only `PHONEME_AUTH_ALLOWED_DOMAIN` accounts are accepted.
- New SSO users are provisioned into the `PHONEME_TENANT_SLUG` workspace on first sign-in.
- Logout ends the local session and, when the provider advertises one, the IdP session.

The full staging runbook — DNS, TLS, systemd, nginx, git keys, GitHub secrets — is
[`deploy/README.md`](deploy/README.md).

## Security posture

- Passwords: `scrypt` with per-user salt; constant-time comparison.
- Sessions: 256-bit random token, `HttpOnly; SameSite=Lax` cookie, 30-day expiry, server-side revocation on logout.
- Tenant isolation on every query that returns learner or admin data.
- No third-party analytics, no external fonts, no CDN. YouTube is embedded click-to-load; no cookie is set until the learner presses play.
- Quiz answers and assignment model answers are never sent to the browser.
- Evidence submissions are plain text (no file upload surface).

## Deploy notes

Run behind a TLS-terminating reverse proxy. Keep `data/` on persistent storage and back up `data/app.db` (WAL mode — copy all three files or use `sqlite3 .backup`). Single-node by design: SQLite is the concurrency boundary, which is right for a cohort of tens, not thousands.

```
[Unit]
Description=L1 Academy
After=network.target
[Service]
WorkingDirectory=/srv/l1-academy
ExecStart=/usr/bin/node server.js
Environment=PORT=4173 HOST=127.0.0.1
Restart=always
[Install]
WantedBy=multi-user.target
```

## Known limits

- Videos are YouTube embeds; if the corporate network blocks YouTube, replace them in `content/modules/*` with internal links (the lesson layout does not care where the URL points, but the facade expects YouTube).
- No SSO/SCIM; accounts are invite-code or CSV. Add an OIDC layer if the company requires it.
- Certificates are verifiable inside the deployment (`/verify/<code>`). They are not blockchain-anchored, by design.
- English only.

## File map

```
app/
  server.js                 zero-dependency HTTP + SQLite API and static server
  oidc.js                   Phoneme Auth (OIDC) adapter with PKCE + JWKS verification
  deploy/                   env template, systemd, nginx, sudoers, staging runbook
  public/                   SPA: shell, views, diagrams, design system
  content/                  curriculum, references, diagnostic, library, spec
  scripts/                  build, verify, seed
  data/app.db               tenants, users, attempts, submissions, certificates
```
