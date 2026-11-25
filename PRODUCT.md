# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Self-contained Node + SQLite web app (`node:sqlite`, zero runtime dependencies), served as a single process, deployable inside the company network. Confirmed by the user; chosen over a static site because the leaderboard and certificates need shared state.

## Users

Fresh graduates hired into a datacenter + cloud solutions company, mostly non-CS backgrounds, with no prior job context. They sit at L1 service desk / NOC / cloud support, live in tickets and handovers, and are expected to stop escalating work that L1 can finish. They use a laptop in an office or on a shift, often between calls, in 30–45 minute blocks. A second audience is the training admin at the company (and, for the white-label product, the admin at a client company) who needs branding, roster, and grading without a developer.

## Product Purpose

A self-education system that turns a topic list into job-ready capability. Each lesson starts from a real ticket or task the employee will actually face, teaches only what that task needs, and ends with something submitted and graded. Success means measurable movement: fewer avoidable L1→L2 escalations, a passed module quiz, a graded practical, a certificate at 80%.

## Positioning

The curriculum is derived from a company's own topic sheet and real ticket pain, not from a generic certification syllabus. Every teaching unit is anchored to a workplace scenario, every module is gated by a scored MCQ test, and every week ends in graded evidence — not video completion. Resource curation is deliberately non-obvious: sources chosen for the actual confusions people post on Reddit and Stack Overflow, not the most-viewed videos.

## Operating Context

8-week cohort, 4–5 hours per week, five short practicals per week. Modules: networking, Linux, Windows/PowerShell, security fundamentals, VAPT, SOC/SIEM, incident response, automation. Admin runs the cohort, provisions learners by invite code or CSV, grades evidence against a rubric, exports progress. Certificates are verifiable by code. The platform is white-label: company name, logo, colours, signatory, pass thresholds and certificate title are set at configuration time by the buying company.

## Capabilities and Constraints

- 8 modules, 48 lessons, 40 increasing-complexity daily practicals, 8 module MCQ tests, 1 diagnostic pre-assessment.
- Grading rules (confirmed): 70% pass, 3 attempts, best attempt counts; certificate at 80% overall plus all modules passed.
- Lessons contain text, an authored animated diagram, and a curated short video.
- Node >= 22.5 for `node:sqlite`; no npm install required; data in `data/app.db`.
- English only. No LMS dependency. No third-party analytics. Video is embedded from YouTube via click-to-load (no cookie until play).
- Content is data (JSON) so a company can edit or extend without touching code.
- Out of scope: live proctoring, native mobile apps, payment/billing, SSO.

## Brand Commitments

None supplied. The platform ships unbranded and takes the tenant's name, logo text, primary and accent colour at setup. Default demo tenant is a placeholder and must not be presented as a real customer.

## Evidence on Hand

- `Complete traning Topics .html` — the source topic sheet (144 rows, 8 clusters).
- No customer logos, testimonials, benchmark figures, or pricing exist. Future work must not fabricate them.

## Product Principles

1. Start from the ticket, not the syllabus. A lesson that does not end in a workplace action is cut.
2. Earn the escalation. L1 skill is measured by what stops at L1.
3. Evidence over attendance. Grades come from submitted work and scored tests.
4. Reward the cohort, not the celebrity. Leaderboard is scoped to the learner's own company.
5. Configurable, not forkable. A buyer brands and tunes thresholds; content stays one codebase.

## Accessibility & Inclusion

WCAG 2.1 AA target: body contrast >= 4.5:1, visible focus rings, full keyboard operation for quizzes and forms, `prefers-reduced-motion` honoured for diagram animation, video always has a text alternative in the lesson body, no colour-only status encoding.
