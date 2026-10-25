# Architecture

One Next.js app talks straight to one PostgreSQL database. There is no separate API server, no client-side data store and no public API.

```
Browser ──► src/proxy.ts ──► page.tsx (server component) ──► src/lib/* ──► Prisma ──► PostgreSQL
            (CSP, origin       │                                                     (files stored
             check, rate       └─ <ActionForm> ──► actions.ts ("use server")          as Bytes too)
             limits, careers       zod parse → requireUser → db → revalidatePath
             host lock)
```

## Stack

| Layer | Used | Notes |
| --- | --- | --- |
| Framework | Next.js 16.4 App Router, React 19.2, TypeScript 5 (strict) | Read `node_modules/next/dist/docs/` before using a Next API; this version differs from older docs |
| Styling | Tailwind CSS 4 | Tokens and component classes in `src/app/globals.css`, dark mode in `src/app/theme-dark.css` |
| Database | PostgreSQL 16, Prisma 6 | `prisma/schema.prisma` (about 100 models), migrations in `prisma/migrations/` |
| Auth | Own email + password | bcryptjs hashes; a `jose`-signed HTTP-only cookie names a `Session` row. Google sign-in is built but off (needs HTTPS) |
| Validation | zod 4 | Every server action parses its `FormData` |
| PDFs | `@react-pdf/renderer` | `src/lib/pdf/`: invoices, quotes, credit notes, payslips, receipts, certificates, HR letters and ID cards (wording in `src/lib/letter-rules.ts`) |
| Email | nodemailer over the company's SMTP | Configured in Admin > Settings > Email; mail password sealed with `src/lib/secret-box.ts` |
| Tests | `node:test` via tsx | See [TESTING.md](TESTING.md) |

## Folders

```
src/
  proxy.ts               Next 16's middleware: CSP, write-origin check, rate limits, public careers host
  app/
    (app)/<module>/      Signed-in pages, one folder per menu group (crm, hr, payroll, invoices, operations, ...)
                         page.tsx, plus actions.ts (server actions), forms.tsx (client forms), data.ts (queries)
    (app)/layout.tsx     Shell: icon rail, top bar, Find anything, notifications
    api/                 Route handlers only where a page can't do it: file downloads, health,
                         message polling, client error reports, the payment-reminder cron
    login, careers, ...  Public and pre-sign-in pages
    globals.css          Design tokens and shared classes
  components/            Shared UI: ui.tsx, action-form.tsx, sidebar.tsx, icons.tsx, logo.tsx, ...
  lib/                   Business logic, one file per area (invoices.ts, payroll.ts, leave.ts, ...)
    *-math.ts, *-rules.ts  Pure calculations, unit tested
    auth.ts, permissions.ts  Who may do what
    nav.ts               The whole role-aware menu as data (sidebar, tabs and search read it)
    page-access.ts       Who may open each page: one row per route, checked against every page by tests
    pdf/                 PDF documents
prisma/                  Schema, migrations, seed (reference data, Kerala holidays)
scripts/                 Demo seed, smoke/acceptance/role/security test scripts, secret and dependency checks
tests/                   Unit tests (no database)
docker/                  start.sh (migrate + seed + start), backup worker, restore, Caddy for HTTPS
docs/                    Run, deploy, backup and security guides, and these docs
```

## How a request flows

1. `src/proxy.ts` sets security headers, refuses cross-origin writes, rate-limits every write and API call per client address (sign-in also locks an account after 5 wrong passwords), and, if `PUBLIC_CAREERS_HOST` is set, lets that host reach only the careers pages.
2. A page in `src/app/(app)/` is a server component. It calls `requireUser([...roles])` (or `requireOwner()`), which redirects to `/login`, `/change-password` or the "Not for your role" page (`/no-access`) as needed, then reads data with Prisma, scoped to what that user may see.
3. Forms are `<ActionForm action={...}>` from `src/components/action-form.tsx`, bound to a server action. The action checks the user again, parses input with zod, writes, logs important changes with `logActivity`, calls `revalidatePath`, and returns `{ ok }` or `{ error }` (or redirects).
4. Files (documents, receipts, resumes, photos) are stored in PostgreSQL as `Bytes` and served only by route handlers under `src/app/api/` that check the user and send them with `privateFileHeaders` (`src/lib/file-response.ts`).

## Roles

Four roles in the `Role` enum: `ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`. The company owner is an admin with `User.isOwner` (only one; the first admin; handed over with "Make owner" in Admin > Users). Managers act on their direct reports (the employee's "reports to"). Four dashboards: Owner `/dashboard`, Admin `/dashboard/admin`, HR `/dashboard/hr`, My dashboard `/dashboard/me`. Helpers: `src/lib/auth.ts`, `src/lib/permissions.ts`. The full table of who can do what is shown in the app at Admin > Roles and permissions (`PERMISSION_ROWS` in `permissions.ts`).

## Background work

`src/instrumentation.ts` starts in-process schedulers when the server starts (not on Vercel): the account email sender, payment reminders, the backup check and the applicant clean-up.

- **Payment reminders**: on the office copy, the in-process scheduler; on Vercel, a daily cron calling `/api/cron/payment-reminders` (`vercel.json`, needs `CRON_SECRET`). Off until switched on in Admin > Settings > Email.
- **Backups**: the `backup` Docker service runs `pg_dump` daily at 5 PM (`docker/backup-worker.sh`). See [backups.md](backups.md).
- **Messages and channels**: the browser polls `/api/messages/poll` every 5 seconds; there are no websockets. A channel is a `Conversation` with `isGroup` and `isChannel` set, so it reuses the group chat code.
- **Teamwork access**: every Teamwork page, action and file route starts with `requireTeamwork()` / `getTeamworkApiUser()` (`src/lib/teamwork.ts`), which add the company-domain check to `requireUser`. People pickers use `teammateWhere()`. Pure rules (domain, folder access, call links) are in `src/lib/teamwork-rules.ts` with tests.

## Where it runs

- **Office (production)**: one Windows computer with Docker Desktop, `docker compose up -d --build` (services `db`, `app`, `backup`, optional `gateway`). Staff use it over the office Wi-Fi. The app container applies migrations and the reference seed on every start. Guide: [run-on-your-computer.md](run-on-your-computer.md).
- **Vercel (demo)**: protected demo on Neon PostgreSQL, demo data only. Every deploy needs `npx prisma migrate deploy` against that database. Guide: [vercel-deployment.md](vercel-deployment.md).

## Choices to keep

- Server-side permission checks on every read and write.
- Money in `Decimal` columns, calculated in tested functions, shown with `formatINR` / `formatMoney`.
- Document numbers (invoices, quotes, credit notes, receipts, certificates, HR letters) per financial year (April to March, written `26-27`), guarded by a unique `(fy, seq)` key so two people never get the same number.
- Everything works on one machine with no outside services; email is the only optional external call.
