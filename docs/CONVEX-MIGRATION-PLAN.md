# Moving Orbit to Convex: plan

Status: **proposal only, 4 Nov 2026.** No code has changed. Nothing here starts until the owner picks an option (end of this doc).

This plan replaces Prisma + PostgreSQL with [Convex](https://www.convex.dev) as Orbit's database and backend. It keeps Next.js for the pages, the look, and the phone app's routes.

## 1. What we are moving (measured on `main`, cb896db)

| Thing | Size today | What it becomes in Convex |
| --- | --- | --- |
| Prisma models | 110 models, 67 enums, 399 relations, 3,810 schema lines | 110 tables in `convex/schema.ts` with indexes; enums become string unions |
| Migrations | 50 SQL migrations | Gone. Schema changes deploy with `npx convex deploy`; data reshaping uses Convex migrations (`@convex-dev/migrations`) |
| Prisma calls | about 1,360 in `src/` (50 of them `groupBy` / `aggregate`) | Convex `ctx.db` reads and writes, rewritten by hand |
| Server actions | 320 exported actions in 38 `actions.ts` files | Each becomes a Convex mutation (or action); the Next server action stays as a thin wrapper so forms and `ActionForm` don't change |
| Pages | 164 `page.tsx` | Keep as server components; their data calls move from Prisma to `fetchQuery` / `preloadQuery`, and live lists use `useQuery` |
| API routes | 25 (files, mobile, cron, poll, health) | File routes and mobile routes stay in Next and call Convex; `/api/messages/poll` and the cron route go away |
| Money columns | 101 `Decimal` fields | Integers in paise (`v.int64()` or whole-number `v.number()`); no Decimal type exists in Convex |
| Unique keys | 58 `@unique` / `@@unique` | No unique constraints in Convex. Each becomes an index plus a check inside the mutation |
| Raw SQL | 19 places, mostly `SELECT ... FOR UPDATE` row locks | Not needed: every Convex mutation is a serialisable transaction. The two raw reports (message counts, low stock) become indexed queries |
| Files in the database | 12 `Bytes` columns (documents, receipts, chat, project, shared, helpdesk, notices, purchases, recruitment, checklist photos, two signatures) | Convex file storage (`ctx.storage`), table rows keep a `storageId` |
| Unit tests | 36 files in `tests/` | The pure `*-math.ts` / `*-rules.ts` tests stay. Database scripts (smoke, roles, security, acceptance) are rewritten with `convex-test` |

The pure business rules (GST, TDS, payroll, commission, leave, numbering rules, letter wording) are plain TypeScript in `src/lib/*-math.ts` and `*-rules.ts`. They move across as they are. The work is the data layer around them.

## 2. Target architecture

```
Browser ──► src/proxy.ts ──► page.tsx (server component) ──► fetchQuery / preloadQuery ──► Convex query
                │                 └─ <ActionForm> ──► actions.ts ("use server") ──► fetchMutation ──► Convex mutation
                │                                                                        │
                └─ client lists (messages, approvals, notifications) ── useQuery (live) ──┘
Convex: convex/schema.ts, convex/<module>.ts (queries, mutations), convex/crons.ts, file storage
Node actions ("use node"): email (nodemailer), PDFs (@react-pdf/renderer), backups export
```

- **Folder layout.** A new top-level `convex/` folder, one file per area (`convex/crm.ts`, `convex/leave.ts`, `convex/payroll.ts` ...), mirroring `src/lib/`. `src/lib/*-math.ts` and `*-rules.ts` are imported from both sides.
- **Company scope.** Today `src/lib/company-scope.ts` adds `companyId` to every Prisma call. In Convex we write custom function builders with `convex-helpers` (`customQuery`, `customMutation`): `companyQuery` and `companyMutation` read the signed-in user, work out the current company, and hand the function a `db` wrapper that only reads through `by_company...` indexes and stamps `companyId` on every insert. A lint rule forbids plain `query` / `mutation` imports outside `convex/auth/` and `convex/group/`. Every table index starts with `companyId`.
- **Permissions.** `requireUser([...roles])` and `requireOwner()` move into those builders (`companyMutation({ roles: ["ADMIN", "HR"] }, ...)`), so the check runs inside Convex, next to the data. The Next page still calls the same check first for the redirect to `/login` or `/no-access`.
- **Validation.** zod stays for parsing `FormData` in the Next action; Convex argument validators (`v.*`) check again at the function boundary.

## 3. Module by module

"Q" = queries, "M" = mutations, "A" = actions (can call outside services), "C" = scheduled (crons or `ctx.scheduler`), "F" = file storage.

| Module (folder) | Size today | Convex shape | Notes and hard parts |
| --- | --- | --- | --- |
| Sign-in, sessions, sign-in codes, lockouts, account tokens | `auth.ts`, `session-store.ts`, `sign-in*.ts`, `account-*.ts` | Q, M, A (email) | See section 4. Backup-code removal (`array_remove`) becomes a read-modify-write in one mutation |
| Group of companies, Admin, settings, users, roles (`admin`, `companies`) | 8 pages, 23 actions | Q, M | Superadmin company switch stays on the session row. Mail password still sealed with `secret-box.ts` (move the key into a Convex env var) |
| HR: people, departments, attendance, leave, holidays, onboarding, documents, assets, training, letters, exit, performance (`hr`) | 25 pages, 65 actions, 6,700 lines | Q, M, F, A (PDF letters, ID cards) | Biggest module. Leave balances and attendance locks become plain mutations. Holiday seed becomes an internal mutation |
| Payroll (`payroll`) | 4 pages, 10 actions | Q, M, A (payslip PDFs, payslip emails via scheduler) | Money in paise. A payroll run for 10 people is far inside Convex limits. Statutory switches stay off |
| CRM: leads, contacts, institutions, deals, follow-ups (`crm`) | 13 pages, 18 actions | Q, M | Lists use `.paginate()` (replaces `src/lib/paging.ts`). Name search uses a Convex search index |
| Projects, My work, timesheets, approvals, daily pulse, plan (`projects`, `work`, `timesheets`, `approvals`, `plan`) | 14 pages, 41 actions | Q (live), M, F | Approvals inbox becomes live with `useQuery`. Timesheet advisory lock disappears (mutations are serialised) |
| Operations / school sessions (`operations`) | 8 pages, 11 actions | Q, M | Programme, trainer and session tables, straight port |
| Workshops and certificates (`workshops`) | 6 pages, 18 actions | Q, M, A (certificate PDFs) | Certificate numbers EBG/CERT need the numbering counter (below) |
| Billing: invoices, quotes, credit notes, payments, accounts summary, payment reminders (`invoices`, `quotes`, `credit-notes`, `accounts`) | 11 pages, 19 actions | Q, M, A (PDF, email), C (daily reminders) | **Document numbers**: today a unique `(companyId, fy, seq)` key. In Convex: a `counters` table row per company + series + FY, read and bumped inside the same mutation that inserts the invoice. Convex retries on conflict, so no duplicates. Accounts summary aggregates (GST by month) become either a bounded query over the year's invoices or a running `monthTotals` table updated on each write |
| Purchases and vendor bills (`purchases`) | 9 pages, 13 actions | Q, M, F | Bill files to storage |
| Inventory (`inventory`) | 5 pages, 9 actions | Q, M | Stock on hand: keep a `qtyOnHand` field updated in the movement mutation (replaces the raw SQL sum) |
| Expenses (`expenses`) | 2 pages, 4 actions | Q, M, F | Receipts to storage |
| Recruitment, careers page (`recruitment`, `/careers`) | 8 pages, 15 actions | Q, M, F, C (applicant clean-up) | Public careers form calls a public mutation with rate limiting (`@convex-dev/rate-limiter`) |
| Helpdesk, notice board, recognition, checklists (`helpdesk`, `notices`, `recognition`, `checklists`) | 16 pages, 20 actions | Q, M, F, C (checklist schedule) | Checklist photos to storage |
| Messages, channels, Teamwork files, meetings (`messages`, `channels`, `files`, `meetings`) | 10 pages, 23 actions | Q (live), M, F | **Best fit for Convex.** The 5-second polling of `/api/messages/poll` goes away; chat updates instantly with `useQuery`. Unread counts become a per-member `lastReadAt` plus an indexed count |
| Video calls | `teamwork-rules.ts` | No change | Calls are Jitsi links in a new tab. Only the meeting rows move. Nothing in Convex touches the call itself |
| Email (account emails, payslips, reminders, `emails`) | `mail.ts`, `account-mailer.ts`, `EmailLog`, `AccountMailJob` | A in `"use node"` + C | nodemailer runs in a Node action. The `AccountMailJob` queue table becomes `ctx.scheduler.runAfter(0, internal.mail.send, ...)`, with retries and the `EmailLog` row written by the action. This also solves the speed-checklist to-do "bulk payslip emails in the background" |
| PDFs (`src/lib/pdf/`) | 8 document types | A in `"use node"`, or keep in a Next route | Simplest: keep PDF routes in Next; they fetch data with `fetchQuery` and render as today. No reason to move rendering into Convex |
| Dashboards, calendar, inbox, notifications, Find (Ctrl K) | 7 pages | Q (live) | Notification bell becomes live. Find uses Convex search indexes per table (one search field per index, so a combined `searchText` field per table) |
| Audit log (`ActivityLog`), rate limits (`RateLimitBucket`, `LoginAttempt`) | lib helpers | M, C (clean-up) | Rate limits move to `@convex-dev/rate-limiter`. Origin check and CSP stay in `src/proxy.ts` |
| Backups (`backups.ts`, backup container) | Docker service + Admin page | A + C, or the CLI | See section 6 |
| Phone app (`mobile-app/`, `api/mobile/*`) | 8 routes | No app change in phase 1 | Routes stay in Next and call Convex. Later the native screens could use the Convex React Native client directly and get live data |

## 4. Sign-in and sessions

Orbit's sign-in is more than a login form: password + lockout after 5 wrong tries, optional authenticator codes with backup codes, Google sign-in (off), email verification, password reset, superadmin company switch, the phone app's one-time "open" codes, and "sign out everywhere".

Two ways to do it:

1. **Convex Auth** (the `@convex-dev/auth` library with its Password provider). Less of our own code, but it has its own session model. Authenticator codes, lockout rules, the phone app's open codes and the superadmin switch would all be rebuilt on top of it. Still marked beta.
2. **Keep Orbit's own sign-in (recommended).** Sessions, password checks and sign-in codes stay as they are, but their tables move to Convex. When a request comes in, Next reads the cookie as today and mints a short-lived JWT (with `jose`, already a dependency) for that session. Convex is set up with a custom JWT provider (`auth.config.ts`) that checks it against Orbit's public key (a JWKS route in Next). Inside Convex, `ctx.auth.getUserIdentity()` gives the session id; the company builders look up the session, user and company.

Option 2 keeps every rule from PR #26, #60 and #70 as written and keeps `npm run test:security` meaningful. The cost is one JWKS route and key pair. **Watch:** rotating `SESSION_SECRET` (still owed after the leaked `.env`) is easiest to do *before* the move.

## 5. Data migration (office Postgres, then Neon)

Where the data actually is: **the real office data is in the office computer's Postgres** (Docker volume `db-data`). Neon holds demo data only (Preview) and a separate Production database. So the migration that matters is the office one; Neon is a rehearsal.

Steps:

1. **Freeze and back up.** Take the normal 5 PM backup plus a fresh `pg_dump` by hand. Stop the `app` service so nothing changes.
2. **Export.** A script (`scripts/export-for-convex.ts`) reads every table through Prisma, in dependency order, and writes one JSONL file per table: Decimals converted to paise (integers, with a check that nothing was lost to rounding), dates to milliseconds, enums to strings, `Bytes` files written out as separate files with a manifest.
3. **Import.** `npx convex import` loads the JSONL into tables, keeping the old Postgres id in a `legacyId` field. A second pass (an internal Convex migration) rewrites every foreign key from `legacyId` to the new Convex `_id`. Files are uploaded to Convex storage and their `storageId` set on the row.
4. **Check.** A comparison script counts rows per table and per company, sums every money column per company and FY, and checks document number series have no gaps or duplicates. Both sides must match before staff use it.
5. **Rehearse first** on a copy of the office backup restored locally, then on the Neon demo database, then the real office cut-over on a weekend.
6. **Rollback.** The old Postgres volume is left untouched. If anything is wrong in week one, switch `docker-compose.yml` back to the old image and the old data is there (anything typed in Convex in between would need re-entry).

## 6. The office Docker copy

Convex's normal home is its hosted cloud. For the office there are two choices.

**A. Self-host Convex in the office (viable, recommended for the office copy).** Convex publishes its backend as open source (FSL 1.1, turns Apache 2.0 after two years; fine for internal use) with Docker images `ghcr.io/convex/convex-backend` and `ghcr.io/convex/convex-dashboard`. It can store data in SQLite on a volume or in PostgreSQL, so the existing `db` container can stay as its store. `docker-compose.yml` would have:

| Service | Today | With Convex |
| --- | --- | --- |
| `db` | Postgres 16 (Orbit's data) | Postgres 16 (Convex's internal store, database `convex_self_hosted`) |
| `convex` | none | Convex backend, port 3210/3211, files on a volume |
| `convex-dashboard` | none | Admin dashboard, port 6791, bound to localhost only |
| `app` | Next.js | Next.js, talks to `http://convex:3210`; `start.sh` runs `npx convex deploy` (with the admin key) instead of `prisma migrate deploy` |
| `backup` | `pg_dump` at 5 PM | `npx convex export` to a zip at 5 PM (data + files). Restore with `npx convex import --replace`. A `pg_dump` of Convex's store is not a usable backup on its own |
| `gateway` | Caddy (optional https) | Caddy, also routing the Convex URL, because browsers need to reach Convex directly for live updates |

Limits of self-hosting: one machine only (fine for 10 staff), upgrades are by pinned image versions with an export first, and we look after backups ourselves (we already do). The browser must reach the Convex backend directly (websocket), so the office Wi-Fi URL for Convex must be set (`CONVEX_CLOUD_ORIGIN`), and once https is set up both need it. Docker Desktop memory goes up by roughly 0.5-1 GB.

**B. Use Convex cloud for the office too.** Simpler to run, but the office then depends on internet access for every click, and data sits outside India: Convex cloud regions are US East, Ireland, Sydney and Canada (non-US cost 30% more); none in India. From Kochi, Sydney or Ireland adds noticeable delay per request compared with today's local database. Orbit's own rule today is "everything works on one machine with no outside services", so B would reverse that.

**Vercel demo:** use Convex cloud (free plan is enough for demo data: 0.5 GB database, 1 GB files, 1 M function calls a month). The Vercel build runs `npx convex deploy --cmd "npm run build"`. Neon can be cancelled after the move.

## 7. What changes in the repo's rules

`AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/TESTING.md` and `docs/CODE_STYLE.md` are rewritten: no Prisma, no migrations folder, no row-level security, no `rawDb`. New rules: every function uses `companyQuery` / `companyMutation`; every index starts with `companyId`; money is integer paise; files go through storage with a permission-checked URL. Dependencies: `+convex`, `+convex-helpers` (and the rate limiter / migrations components), `-@prisma/client`, `-prisma`. Count stays about the same.

## 8. Effort

Assumes the same way of working as now (Claude builds one module per PR, the owner reviews and tries it), with the office move at the end.

| Phase | Work | Weeks |
| --- | --- | --- |
| 0. Trial | Convex in Docker, sign-in bridge (JWT), company builders, one small module end to end (Notice board), export/import of that module, measure speed on the office machine | 1-1.5 |
| 1. Core | Companies, users, sessions, settings, employees, departments (everything else points at these) | 1.5 |
| 2. HR + payroll | HR (largest), leave, attendance, payroll, letters | 2.5-3 |
| 3. Money | Invoices, quotes, credit notes, payments, numbering, accounts summary, purchases, expenses, inventory | 2-2.5 |
| 4. Work | Projects, timesheets, approvals, plan, operations, workshops, checklists | 2 |
| 5. People and talk | CRM, recruitment, careers, helpdesk, notices, recognition, messages, Teamwork files, meetings, notifications, dashboards, Find | 2-2.5 |
| 6. Ops | Email and crons, backups, phone app routes, test scripts rewritten, docs | 1 |
| 7. Move | Rehearsals, office cut-over, one week of watching | 1 |
| **Total** | | **about 13-15 weeks** |

During phases 1-6 Orbit runs on two backends at once only in a branch; `main` keeps working on Postgres until the cut-over, so new features either wait or get built twice. Realistically, **no new features for about three months.**

## 9. Main risks

1. **It's a rewrite of a working app.** About 1,360 database calls and 320 actions are rewritten by hand. Each one is a chance for a bug in something that works today. Mitigation: module-by-module PRs, the role and security test scripts rewritten first, side-by-side comparison on a copy of office data.
2. **Money.** `Decimal` to integer paise touches 101 columns and every GST/TDS/payroll path. Mitigation: convert at the boundary, keep the existing math tests, add a paise round-trip test per column.
3. **Uniqueness and numbering.** Postgres enforces 58 unique keys today; Convex enforces none, so each becomes code. A missed one means duplicate emails or invoice numbers. Mitigation: a test per key.
4. **Reports and limits.** A Convex query may scan at most 32,000 documents and read 16 MiB. Orbit's data is small (10 staff), but year-long reports (accounts summary, attendance history, audit log) need running totals or paging so they don't hit the limit as years pile up.
5. **Company isolation.** Today one Prisma extension protects every query. In Convex it depends on every function using the custom builders. Mitigation: lint rule plus the role test script against two companies.
6. **Office copy gets more complex.** Two extra containers, a websocket URL staff browsers must reach, new backup format, version-pinned upgrades. The owner runs the office update by hand, so every one of these is a step in his instructions.
7. **No India region on Convex cloud** (speed, and data held abroad for the DPDP review still on his list) if cloud is used for real data.
8. **Owed work collides.** The office copy has not been updated since 25 Oct, the phone app is mid-build (PR #74 open), and secrets rotation is still owed. Starting a rewrite on top of these multiplies the moving parts.

## 10. What Orbit gains

- Live updates everywhere without polling: messages, approvals, notifications, dashboards.
- No migrations folder, no SQL, no row locks; every write is a transaction by default.
- Built-in scheduler and file storage replace the in-process timers, the mail queue table and files stored in the database.
- The phone app can later use live data directly.

Most of Orbit is forms and tables for 10 people, where Postgres already works well. The clearest gain is in Messages, Approvals and notifications.

## 11. Decision

| Option | What happens |
| --- | --- |
| **A. Full move now** | Start phase 0 this week. Phone app work and new features pause for about three months. |
| **B. Move after the phone app work (recommended)** | Finish the open phone-app PRs and the owed office update first, then start with the one-week trial (phase 0). Go on with the full move only if the trial runs well on the office computer. |
| **C. Stay on Postgres** | No move. If live chat is the main want, add live updates to Messages only (server-sent events) in about a week. |
