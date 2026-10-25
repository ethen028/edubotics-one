# Security rules for changes

Orbit holds salaries, bank details, ID documents and the company's money records. Every change keeps these rules. How the protections work in detail, and the launch checklist: [security-and-launch.md](security-and-launch.md).

## Access

- Every page and server action calls `requireUser([...roles])` or `requireOwner()` (`src/lib/auth.ts`) before reading or writing. API route handlers use `getApiUser()`.
- Check the record, not only the role: managers act on their direct reports, employees on their own records. Nobody approves their own leave, attendance fix, timesheet or expense claim.
- Salary and payslip figures: admins and the employee only. HR never sees pay. Only the owner sees the owner dashboard and changes the owner's login.
- Staff messages are readable only by members of the conversation. Admins have no way in; don't add one.
- New pages need a row in `src/lib/page-access.ts` with the same roles as their `requireUser` call, and a menu entry in `src/lib/nav.ts` only for roles that can open them. `tests/page-access.test.ts` fails otherwise, and also fails if a server action reads the database before checking the role or a download skips `getApiUser()`.

## Data

- Query through Prisma. Don't use `$queryRawUnsafe` / `$executeRawUnsafe` or build SQL from input; tagged `$queryRaw` is fine.
- New tables get row-level security switched on in their migration (`ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;`). `npm run test:security` checks every table.
- Validate every input with zod on the server. Never trust hidden fields for ids the user shouldn't choose (owner, role, employee).
- Log deletes, role changes, sign-in events and settings changes with `logActivity`.

## Files

- Uploads are stored in PostgreSQL and served only through permission-checked handlers in `src/app/api/` with `privateFileHeaders` (`src/lib/file-response.ts`).
- Check the real file type with `sniffMime` (`src/lib/hr-constants.ts`), not the browser's MIME type or extension. Keep the size limits (5 MB per document; project files 10 MB each, 25 MB per update). Public uploads read the body with `limitedFormData` (`src/lib/request-body.ts`).
- Unknown document types are admin-only by default.

## Secrets

- Secrets live in environment variables (`.env`, never committed) or, for the mail password, sealed in the database with `src/lib/secret-box.ts`. Don't log them or send them to the browser.
- Don't add `NEXT_PUBLIC_` variables holding anything private.
- `npm run security:secrets` and `npm run security:dependencies` run in CI.

## Web

- Don't weaken `src/proxy.ts` (CSP with nonces, write-origin check, rate limits, careers-only public host) or `src/lib/http-security.ts` without a reason in the PR.
- No `dangerouslySetInnerHTML` with user content (there is none today).
- The office copy is plain HTTP on the office Wi-Fi. Anything that needs HTTPS (Google sign-in, secure cookies, the careers page on the internet) stays off there.

## Reporting a problem

This is a private internal app. Tell the owner (repo owner on GitHub) directly; don't open a public issue with details.
