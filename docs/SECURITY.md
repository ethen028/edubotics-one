# Security rules for changes

Orbit holds salaries, bank details, ID documents and the company's money records. Every change keeps these rules. How the protections work in detail, and the launch checklist: [security-and-launch.md](security-and-launch.md).

## Access

- Every page and server action calls `requireUser([...roles])` or `requireOwner()` (`src/lib/auth.ts`) before reading or writing. API route handlers use `getApiUser()`.
- Check the record, not only the role: managers act on their direct reports, employees on their own records. Nobody approves their own leave, attendance fix, timesheet or expense claim.
- Salary and payslip figures: admins and the employee only. HR never sees pay. Only the owner sees the owner dashboard and changes the owner's login.
- Sign-in codes (optional, My account → Sign-in codes): `src/lib/totp.ts` and `src/lib/sign-in-codes.ts`. A right password (or Google) only sets a 5-minute "code asked" cookie; the session starts at `/login/code`. Keys are sealed with `secret-box`, backup codes are stored as hashes and each works once, a used app code can't be reused, and wrong codes are limited to 5 per 15 minutes. Any new way to sign in must go through the same step. An admin can turn codes off in Users (owner and superadmin rules apply). A superadmin who loses both phone and backup codes needs the database: `UPDATE "User" SET "totpEnabledAt" = NULL, "totpSecret" = NULL WHERE "email" = '…';`.
- Staff messages are readable only by members of the conversation. Admins have no way in; don't add one. Chat files go through `/api/chat-files/[id]`, which checks membership and the date the person joined.
- Teamwork (Messages, Channels, Files, Meetings) uses `requireTeamwork()` / `getTeamworkApiUser()` so the company-domain setting is enforced on the server, not only in the menu. Meetings are visible to the organiser and invitees only.
- Companies: every business table has a `companyId`, and `db` (`src/lib/db.ts`) adds the current company to every query and create through `src/lib/company-scope.ts`, so pages never filter by company themselves. Writes are checked too: a row can't point at another company's row (an `organizationId`, a `connect`), except the superadmin's own login, which works in every company. `rawDb` skips that filter: use it only for sign-in, your own login, the superadmin's group pages and background jobs that loop over companies with `forEachCompany`. Raw SQL is not filtered: add `"companyId" = ${await currentCompanyId()}` by hand. A superadmin's login can only be changed by a superadmin. Group pages use `requireSuperadmin()`; backups (the whole database: every company and every private chat) use `requireBackupAdmin()`, which lets in the superadmin only.
- New pages need a row in `src/lib/page-access.ts` with the same roles as their `requireUser` call, and a menu entry in `src/lib/nav.ts` only for roles that can open them. `tests/page-access.test.ts` fails otherwise, and also fails if a server action reads the database before checking the role or a download skips `getApiUser()`.

## Data

- Query through Prisma. Don't use `$queryRawUnsafe` / `$executeRawUnsafe` or build SQL from input; tagged `$queryRaw` is fine.
- New tables get row-level security switched on in their migration (`ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;`). `npm run test:security` checks every table.
- Validate every input with zod on the server. Never trust hidden fields for ids the user shouldn't choose (owner, role, employee).
- Log deletes, role changes, sign-in events and settings changes with `logActivity`.

## Files

- Uploads are stored in PostgreSQL and served only through permission-checked handlers in `src/app/api/` with `privateFileHeaders` (`src/lib/file-response.ts`).
- Check the real file type with `sniffMime` (`src/lib/hr-constants.ts`), not the browser's MIME type or extension. Keep the size limits (5 MB per document; project, chat and Files uploads 10 MB each, 25 MB per upload, and the Teamwork storage cap). Public uploads read the body with `limitedFormData` (`src/lib/request-body.ts`).
- Unknown document types are admin-only by default.

## Secrets

- Secrets live in environment variables (`.env`, never committed) or, for the mail password, sealed in the database with `src/lib/secret-box.ts`. Don't log them or send them to the browser.
- Don't add `NEXT_PUBLIC_` variables holding anything private.
- `npm run security:secrets` and `npm run security:dependencies` run in CI.

## CI and dependencies

- The CI token is read-only (`permissions: contents: read`). Don't widen it; a job that needs to write gets its own workflow and a reason in the PR.
- GitHub Actions are pinned to a full commit SHA with the version in a comment. Use only actions from GitHub (`actions/*`) unless the PR says why.
- Dependabot (`.github/dependabot.yml`) opens monthly update PRs for packages and actions. Major versions are left for a planned upgrade.

## Web

- Don't weaken `src/proxy.ts` (CSP with nonces, write-origin check, rate limits, careers-only public host) or `src/lib/http-security.ts` without a reason in the PR.
- No `dangerouslySetInnerHTML` with user content (there is none today).
- Redirects to a path taken from a form, a query string or a stored link go through `safeAppPath` (`src/lib/http-security.ts`). Checking for a leading `/` is not enough: browsers treat `/\evil.example` as another site.
- Anything Orbit keeps in the browser (`localStorage`) uses an `orbit:` key so sign-out can clear it (`src/components/sign-out-form.tsx`). Never keep passwords, tokens or pay there.
- The office copy is plain HTTP on the office Wi-Fi. Anything that needs HTTPS (Google sign-in, secure cookies, the careers page on the internet) stays off there.

## Checklist status

The last full pass against outside checklists (63 security items, 20 legal items and a tools table) is [security-checklists-2026-11.md](security-checklists-2026-11.md), 2 November 2026. Open items that need the owner:

- Change the office database password if the database was first created between 3 and 18 October (the old default is in Git history). The port isn't published, so the risk is low.
- Protect the Vercel demo copy (Deployment Protection) or give every demo login a password nobody can guess.
- https for the office copy, so passwords, cookies and messages aren't sent in plain text on the Wi-Fi; an encrypted or private backup folder.
- A legal check of `/privacy` and `/terms` against India's DPDP Act, a retention period for messages and files, who handles deletion requests, and parents' consent if any under-18 students are signed up.
- Outside alerting (an uptime monitor or Sentry) if wanted; both need an account.

## Reporting a problem

This is a private internal app. Tell the owner (repo owner on GitHub) directly; don't open a public issue with details.
