# Security and legal checklists (2 November 2026)

The owner shared five checklists from social posts: "Security Maxxxxing your AI built website" parts 1 to 3 (63 items), "20 things to have Claude do so your app doesn't get sued" and a "Vibe coding? Save these" tools table. Every item was checked against `main` at `b9ca924`, the 28 October audit and the earlier [security-and-launch.md](security-and-launch.md) checklist pass.

Status: **Held** (already true, with where), **Fixed** (changed in the pull request that added this file), **MFA PR** (built in the follow-up pull request), **N/A** (doesn't apply to Orbit), **Owner** (needs the owner's account, wording or decision).

## Security, part 1

| # | Item | Status | Where / what |
|---|---|---|---|
| 1 | XSS | Held | React escapes all output; no `dangerouslySetInnerHTML`; nonce CSP with `strict-dynamic`, no eval (`src/lib/http-security.ts`) |
| 2 | CSRF | Held | Foreign-origin writes refused in `src/proxy.ts`; session cookie `SameSite=Lax`; Next checks Server Action origins |
| 3 | SQL injection | Held | Prisma and tagged `$queryRaw` only; no `*Unsafe` calls |
| 4 | NoSQL injection | N/A | PostgreSQL only |
| 5 | Insecure file uploads | Held | Real type from the bytes (`sniffMime`), size caps, private headers (`src/lib/file-response.ts`). Teamwork accepts any type and has no virus scan (accepted, audit 28 Oct #11) |
| 6 | Path traversal | Held | Files live in the database; backup file names must match `isBackupName` (`src/lib/backups.ts`) |
| 7 | SSRF | Held | The server only calls fixed addresses (Cloudflare, Google) with 10 s timeouts; the mail server is admin-only |
| 8 | Missing input validation | Held | zod on every server action and route |
| 9 | Permissive CORS | Held | No CORS headers are sent |
| 10 | IDOR / BOLA | Held | Record checks per role, company filter (`src/lib/company-scope.ts`), linked-id checks (#56), `tests/page-access.test.ts` |
| 11 | Mass assignment | Held | zod objects drop unknown fields; owner, role and employee ids never come from hidden fields |
| 12 | Weak password resets | Held | 256-bit one-use tokens, 30 minutes, hashed, all sessions ended after a reset |
| 13 | Account enumeration | Held | Same message and delay for a wrong email or password; recovery never says whether an account exists |
| 14 | Weak session management | Held | Database sessions, 12-hour idle sign-out, sign out other devices, `httpOnly` cookie. The cookie can't be `Secure` on the http office copy (accepted) |
| 15 | Vulnerable JWTs | Held | HS256 pinned in `jwtVerify`; every token is checked against a live session row |
| 16 | Missing rate limits | Held | PostgreSQL counters (`src/lib/rate-limit.ts`) plus lockout after 5 wrong passwords |
| 17 | Front-end-only payment checks | Held | Orbit takes no online payments; every payment is recorded and checked on the server |
| 18 | Open redirects | **Fixed** | The company switch and Inbox only checked for a leading `/`, so `/\evil.example` (which browsers read as another site) got through. Both now use `safeAppPath` (`src/lib/http-security.ts`, `tests/safe-redirect.test.ts`) |
| 19 | Unsigned webhooks | N/A | No inbound webhooks. The Vercel cron call is checked with a timing-safe secret |

## Security, part 2

| # | Item | Status | Where / what |
|---|---|---|---|
| 20 | Missing MFA | MFA PR | Owner chose authenticator-app codes, optional for everyone, with backup codes |
| 21 | Business logic flaws | Held | Nobody approves their own leave, timesheet or claim; HR can't see pay; money rules tested (`tests/business-rules.test.ts`, `tests/permissions.test.ts`) |
| 22 | Race conditions | Held | Document numbers taken under a lock; tokens used atomically; sign-in, reset and password change serialised |
| 23 | Webhook replays | N/A | No webhooks. Each reminder round claims its day, so a repeated cron call sends nothing |
| 24 | Loose CI/CD permissions | **Fixed** | CI token is now read-only (`permissions: contents: read`), checkout keeps no credentials, 30-minute job limit |
| 25 | Exposed deploy secrets | Held | CI holds no real secrets (throwaway database and session secret) |
| 26 | Untrusted GitHub Actions | **Fixed** | Only GitHub's own actions, now pinned to exact commits |
| 27 | Unpinned dependencies | Held | `package-lock.json` with `npm ci`; install scripts switched off in CI and Docker |
| 28 | Fail-open checks | Held | CAPTCHA, cron secret and rate limiter all refuse on error |
| 29 | No request timeouts | Held | Outbound calls time out at 10 s, mail at 15/60 s |
| 30 | Unsecured GraphQL | N/A | No GraphQL |
| 31 | Unsecured WebSockets | N/A | Messages poll an authenticated route; no sockets |
| 32 | Exposed legacy APIs | N/A | No old or versioned APIs |
| 33–37 | Prompt injection, AI data leaks, running AI output, overprivileged agents, unbounded AI use | N/A today | The expense-claims AI helper (#55) is built but switched off and used nowhere. When switched on: code runs in a no-network, read-only container with call, time and output limits (`src/lib/agent/sandbox.ts`), 6 turns and 2,048 tokens per answer. Staff must be told claim details go to an AI service abroad (DPDP) |
| 38 | Secrets in localStorage | Held, **Fixed** | No secrets are kept in the browser (password, file and hidden fields are never saved in drafts). New: signing out now clears unsaved drafts and recently viewed pages too (`src/components/sign-out-form.tsx`), for shared and school computers |
| 39 | Cross-tenant AI leaks | N/A today | The AI helper reads claims through the company-filtered `db` |

## Security, part 3

| # | Item | Status | Where / what |
|---|---|---|---|
| 40 | Exposed DB credentials | Held, **Owner** | The database port is not published by Docker. But from 3 to 18 October `docker-compose.yml` had a fixed default database password, still in Git history. If the office database was created then, it still uses it. Change it (steps in the PR) |
| 41 | Committed .env files | Held | No `.env` file in any of the 166 commits |
| 42 | Hard-coded API keys | Held | `npm run security:secrets` in CI; none found |
| 43 | Secrets in Git history | Held, **Owner** | Whole history scanned: no API keys or tokens. Only the old default database password (item 40) and an old default admin password, which had to be changed at first sign-in |
| 44 | Secrets in frontend JS | Held | No private `NEXT_PUBLIC_` values |
| 45 | Outdated auth | Held | bcrypt cost 12, 72-byte guard, current `jose` |
| 46 | No server-side auth | Held | `requireUser` / `getApiUser` everywhere, enforced by tests |
| 47 | Unprotected admin routes | Held | `src/lib/page-access.ts` plus the live role test |
| 48 | Overprivileged DB accounts | Accepted | The app connects as the table owner (documented in security-and-launch.md); RLS denies every other role |
| 49 | Public DBs and backups | Held, **Owner** | Database not exposed; backups superadmin-only (#56). Backups are not encrypted: keep the folder private |
| 50 | Loose Firebase rules | N/A | Not used |
| 51 | Loose Supabase rules | N/A | Not used |
| 52 | Public storage buckets | N/A | Files live in PostgreSQL; no buckets |
| 53 | Default credentials | Held | Docker refuses to start without your own `DB_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`; the first password must be changed |
| 54 | Exposed staging sites | **Owner** | The Vercel demo copy is on the open internet. Switch on Vercel Deployment Protection, or make sure every demo login has a password nobody can guess |
| 55 | Debug tools in prod | Held | Production build only; health page admin-only; no debug routes |
| 56 | Secrets in build logs | Held | CI and Docker builds print no secrets |
| 57 | Exposed stack traces | Held | Error pages show a plain message only (`src/app/error.tsx`, `global-error.tsx`) |
| 58 | Sensitive data in logs | Held | Telemetry keeps no raw errors, queries or personal data (`src/lib/telemetry.ts`) |
| 59 | Missing security headers | Held | CSP, frame, nosniff, referrer, permissions, COOP/CORP; HSTS on https |
| 60 | Unencrypted data | **Owner** | Mail password is sealed; messages, backups and the office http traffic are not. The fix is https for the office copy and an encrypted backup folder |
| 61 | Exposed source maps | Held | Browser source maps are off in production (Next default) |
| 62 | Outdated dependencies | **Fixed** | Next.js 16.4.2 → 16.4.3; Dependabot now opens monthly update PRs for packages and CI actions. Runtime audit: 0 issues. 16 moderate issues remain in lint tools only |
| 63 | No security monitoring | Held, **Owner** | Activity log, sign-in events and Admin → Health exist. Outside alerts (an uptime monitor or Sentry) need an account |

## Legal and trust (20 items)

| # | Item | Status | Where / what |
|---|---|---|---|
| 1 | Privacy policy | Held, **Owner** | `/privacy` and `/careers/privacy`. Needs a check against India's DPDP Act by someone qualified |
| 2 | Terms of service | Held, **Owner** | `/terms`, same review |
| 3 | Refund policy | N/A | Staff app; no sales. Refunds to schools go through credit notes |
| 4 | Cookie policy | Held | `/cookies` |
| 5 | Cookie consent banner | Held | Essential cookies only, so a notice is shown and there's nothing to accept or refuse |
| 6 | Form consents | Held | Careers form has a required consent box linking the privacy notice |
| 7 | Collect only needed data | Held, **Owner** | Rejected applicants deleted after 12 months. Messages and files are kept forever: decide a retention period |
| 8 | Audit third-party SDKs | Held | No third-party scripts; only optional Turnstile on public forms |
| 9 | Dark patterns | Held | None found |
| 10 | Hidden fees | N/A | No sales |
| 11 | Fake reviews | N/A | None |
| 12 | Unsupported claims | N/A | No marketing pages; the careers text is yours |
| 13 | Alt text | Held | `jsx-a11y` lint rules; every image has alt text |
| 14 | Colour contrast | Held | Fixed in #32/#34 and kept by the design rules; not formally WCAG-certified |
| 15 | Keyboard navigation | Held | Skip link, focus styles, Ctrl K, real buttons and links |
| 16 | Business details | **Owner** | Fill Admin → Settings (address, GSTIN, contact); they print on documents and legal pages |
| 17 | Age consent for kids | **Owner** | If workshop registrations or school data include under-18 students, the DPDP Act needs a parent's consent, collected when you sign them up |
| 18 | Unsubscribe link | Held | Every email is transactional (invoices, payslips, letters). Automatic payment reminders can be paused per school |
| 19 | Licensed stock images | Held | Only your own logo and brand files |
| 20 | Data deletion option | Held, **Owner** | My account → close login (anonymises it). Full erasure of HR records on request is an admin review: decide who handles it |

## Tools table

| Problem | Suggested tool | Orbit |
|---|---|---|
| Vibe-coded UI | Watermelon UI, Impeccable | N/A: Orbit has its own design system and a no-UI-kit rule ([DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)) |
| Untested website | Playwright | Held: 180+ tests, the live role test across 110 pages, browser screenshots in audits |
| Slow-loading site | Lighthouse, Bundlephobia | Held: ten runtime packages, local fonts, no chart or icon libraries |
| No authentication | Clerk | N/A: Orbit has its own sign-in with lockout, resets, device list and (MFA PR) codes. Clerk would send staff logins to an outside service |
| Bugs slipping through | TypeScript, Sentry | TypeScript held (strict, checked in CI). Sentry: **Owner** account, and it sends error data abroad |
| Re-explaining your codebase | Graphify | N/A: `AGENTS.md` and the `docs/` folder do this |
