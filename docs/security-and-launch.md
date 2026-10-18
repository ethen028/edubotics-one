# Security and launch implementation

Implemented from the five supplied checklists on 17 October 2026. Repeated items share the same control. A control that needs a provider account or owner decision is not claimed as configured.

## Architecture and boundaries

Edubotics One is a server-rendered internal operations application, not a browser-to-database multi-tenant SaaS. Browsers receive no database or service-role credentials. PostgreSQL RLS is enabled with default-deny behavior for non-owner roles on every application table, and PUBLIC table privileges are revoked. The trusted backend connects as the migration/table owner and bypasses RLS intentionally. Staff-level row access is enforced by server authorization and resource scope helpers. Do not hand the owner connection to a browser, reporting user, or third party. New tables need an equivalent RLS migration. Integration tests prove a non-owner role granted SELECT still sees no User rows.

All eight existing private-file API routes were reviewed for resource permissions and now also enforce temporary-password and optional verified-email gates. The new client-error endpoint requires authentication, accepts no body, and records no raw error. Server actions retain server-side role, scope and Zod checks. Prisma uses parameterized queries; no user-built raw SQL was introduced.

## Accounts and secrets

- Password recovery at `/forgot-password` queues encrypted destinations without checking account existence in the request. A long-running Node process drains the queue every ten seconds. Configure a verified SMTP sender and `APP_URL`; no email delivery is claimed until tested against an inbox. Queue entries expire after 15 minutes. A serverless process that cannot run the worker needs a separately deployed worker before recovery is usable.
- Recovery tokens have 256 bits of randomness, only SHA-256 digests in the database, a 30-minute lifetime, purpose/email binding and one-use atomic consumption. Verification tokens last one hour. Visiting a link does not consume it; a POST confirmation does. Row locks serialize issuance, resets, sign-ins and password changes. Password resets end all sessions. Stale credential checks cannot create a new session after a reset.
- Work email verification is available in My account and `/verify-email`; Google verifies matching current email addresses on successful OIDC sign-in. `REQUIRE_VERIFIED_EMAIL=true` enables enforcement after SMTP and existing users are ready. It defaults off for compatibility and must not be described as enforced until configured.
- The account-login deletion button requires the current password and typed confirmation, checks the live session under lock, prevents closing the last admin, anonymizes login identity and ends sessions. Linked HR, payroll, projects, emails, audit records and backups remain. The UI explicitly explains this; full personal-data erasure requires an administrator retention review.
- New password hashes use bcrypt cost 12 and reject inputs over 72 UTF-8 bytes to prevent silent truncation. Existing hashes remain usable until changed.
- Secrets remain server-side environment variables or encrypted settings. Local `.env` files are ignored. Source-pattern scanning and a dependency gate run in CI. This archive has no Git history to scan. Pattern scans cannot certify the absence of every secret.
- Session-secret rotation also affects existing encrypted SMTP/Google settings and queued recovery destinations. Plan rotation with the owner, re-enter affected settings and invalidate old sessions. Never rotate production keys or remove owner access without a deliberate handover.

## HTTP, uploads and abuse controls

- Every page receives a per-request nonce CSP; production scripts prohibit eval. Existing inline styles are supported. Other controls include no-referrer, nosniff, frame restrictions, Permissions-Policy, same-origin opener/resource policies, private download cache controls and removal of the framework header.
- Browser writes reject foreign origins; no permissive CORS headers are emitted. Next also checks Server Action origins. HTTPS redirects use canonical configured origins; HSTS is sent on HTTPS. Forwarded address/protocol headers are ignored unless `TRUST_PROXY_HEADERS=true`.
- PostgreSQL-backed atomic rate counters survive process restarts and share limits between workers. General writes/APIs: 120/minute per trusted address; password login: 30/15 minutes plus existing email lockouts; recovery: 10/address/15 minutes, 3/email/hour and 60/hour overall; applications: 5/address/hour and 60/hour overall. Counters use hashed keys and expired counters are removed. Without a trusted ingress, users share the conservative `unknown` address bucket. The ingress must overwrite forwarding headers and the application port must not be exposed publicly.
- Public careers submissions enforce a six-MB body cap while streaming before multipart parsing. Uploads validate format envelopes and signatures rather than browser MIME/extension. Private downloads recheck historical bytes; unknown content is forced to download. Arbitrary project attachments remain allowed as octet-stream attachments. This is not antivirus scanning or a complete document decoder.
- Turnstile is implemented with server validation of success, expected hostname and expected action. Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` for a widget restricted to the exact public careers hostname and staff hostname used for password recovery. `REQUIRE_CAPTCHA=true` enforces it. Production with `PUBLIC_CAREERS_HOST` requires CAPTCHA automatically and hides applications/fails closed until configured. Local office-only development can run without the external service. No widget account or secret has been created on the owner's behalf.

## HTTPS deployment

The office Docker setup now requires explicit `DB_PASSWORD`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` and binds port 3000 to localhost by default. Use a long random hexadecimal database password so it is safe in the connection URL. Existing database passwords are not changed by editing `.env`.

For the optional Caddy gateway, set `APP_DOMAIN` to a domain you own, point its DNS to the host, and make ports 80/443 available. Set `APP_URL=https://your-domain`, `FORCE_HTTPS=true`, `COOKIE_SECURE=true`, `TRUST_PROXY_HEADERS=true`, and keep `APP_BIND_ADDRESS=127.0.0.1`. Run `docker compose --profile https up -d --build`. The supplied Caddyfile overwrites address forwarding headers and removes client-supplied Cloudflare headers. Caddy obtains and renews certificates after correct DNS/network setup. The gateway is provided, not deployed or certificate-verified in this session.

If exposing only careers at a separate hostname, use the documented careers deployment and `PUBLIC_CAREERS_HOST`, `PUBLIC_SITE_URL`, and the correct public ingress. Its proxy allowlist includes careers, legal pages, metadata and static assets; internal pages, Server Actions and private downloads remain blocked. Do not point a staff-only origin at the public sitemap.

## Checklist coverage

### Screenshot 1: 19 security items

| Item | Result |
|---|---|
| Row-level security | Default-deny non-owner RLS; backend staff scopes remain required |
| Auth on every API route | All private APIs protected; public careers apply is deliberately public with abuse controls |
| Never trust frontend; sanitize input | Server schemas, role/resource checks, React escaping; bounded public body parsing |
| Rate limiting | Shared PostgreSQL counters and existing lockouts |
| Parameterized queries | Prisma and tagged SQL, including new counters/locks |
| Lock down CORS | Same-origin browser writes; no wildcard origins |
| HTTPS everywhere | Redirect/HSTS/Caddy configuration implemented; DNS/TLS activation is owner setup |
| Stop IDOR | Eight download route scopes audited and tested account gates |
| Debug off in production | Production build, generic boundaries, safe error reporting; deploy with production start |
| CAPTCHA on public forms | Turnstile support; owner must provide restricted widget keys |
| Log admin actions | Existing activity log plus new account security events |
| Private storage buckets | Existing database blobs remain private; no public bucket exists |
| Hide admin pages | Server ADMIN checks, sidebar filtering, noindex; security is authorization, not hiding URLs |
| Update vulnerable packages | Patched scoped config dependency; unpatched dev-tool exception remains below |
| Check upload types | Byte/format validation and historical download rechecking |
| Security review | Independent adversarial review; identified account races fixed |
| Security headers | CSP nonces, HSTS on HTTPS, MIME/frame/referrer/permissions policies |
| Verify webhook signatures | No inbound payment/provider webhook exists; do not invent a webhook solely for a checkbox |

### Screenshot 2: 15 client handover items

Domain in their name, transfer repo, hosting on their card, payments to their account, owner logins, remove developer email, rotate keys, document environment variables, hand over analytics, business email, content editing instructions, walkthrough video, legal pages, bug ownership and payment-before-handover are covered in `client-handover.md`. Legal pages, staff guide and environment-variable documentation are supplied. Ownership transfers, provider billing, developer removal, production rotations, a recording, contractual support terms and collecting payment require the actual owner and are not marked done.

### Screenshot 3: 16 API-key items

| Items | Result |
|---|---|
| Keys in env; .env in gitignore; secret keys off frontend; check public env; hide service-role key; server-proxy calls | Server-only secrets/settings; no frontend database/LLM key or service-role integration; Turnstile site key is intentionally public, its secret remains server-only |
| Scan Git history; rotate leaked keys | No Git history in archive; owner must scan the real repository and rotate exposed credentials |
| Secret scanning on | Redacted source scan in CI; known limitations documented |
| Secrets in host dashboard; restrict permissions; separate dev/prod keys; spending limits | Owner/provider setup with least privilege and budgets in handover guide |
| Check screenshots/demos; don't log secrets; never paste keys in chat | Safe telemetry excludes raw errors/queries; docs require sanitized walkthroughs and private secret handling |

### Screenshot 4: 19 application items

| Item | Result |
|---|---|
| Real login/logout | Existing signed DB-backed sessions, strengthened atomic credential checks |
| Password reset | New one-use queued email recovery; real inbox delivery needs SMTP setup |
| Email verification | New email links and account status; enforcement staged via environment flag |
| Loading/empty/error states | Shared loading, empty, error, global-error and form feedback |
| Form validation/rate limiting | Existing server schemas plus new auth/abuse caps |
| Database backups | Existing scheduled backups/restore instructions; owner must configure storage and prove a restore |
| Row-level security/API keys off frontend | As above |
| Mobile layout/custom 404 | Existing rebuild plus new responsive account/public pages |
| Analytics/error tracking | ADMIN health page with bounded aggregate counts and sanitized error references; process-local, not durable third-party analytics |
| Privacy/terms | New public pages; organization must review policy accuracy and retention |
| Delete account | Login closure/anonymization with explicit business-record retention disclosure |
| Onboarding | Existing HR joining workflow plus new signed-in `/guide` |

### Screenshot 5: 20 launch items

| Items | Result |
|---|---|
| Privacy/terms | Public pages supplied for owner review |
| Secrets off frontend; force HTTPS | Server secrets plus secure deployment controls above |
| Cookie consent banner | Dismissible essential-cookie notice and cookie details; no optional analytics/advertising cookies to accept or reject |
| Meta titles/descriptions; social preview; favicon | Existing page titles plus branded icon and generated Open Graph image |
| Sitemap/robots | Only configured public careers/legal paths; private workspace excluded/noindex |
| Alt text/image compression | Existing icons are SVG; no new photographic images added. Private user attachments are not automatically recompressed or altered |
| Load speed | Local fonts, lightweight shared UI, Caddy compression option and production build; no public real-user performance measurement claimed |
| Color contrast/mobile | Existing accessible teal/white design and keyboard/mobile checks; all 122 screens are not independently WCAG-certified |
| Custom 404/broken links | Branded recovery page and static-route smoke check; every dynamic record link is not exhaustively crawled |
| Form validation/spam protection | Server validation, streamed body limits, honeypot, shared counters, optional/enforced Turnstile |
| Analytics | Local aggregate health page, no cross-site tracking |
| One clear call to action | Sign-in primary action; public vacancy apply action; staff guide links to actual work |

## Dependencies and release gates

The scoped `@prisma/config` override to `deepmerge-ts` 8.0.0 fixes the config-merging advisory; compatibility tests exercise Prisma config loading. Five high audit entries remain in the development ESLint dependency chain, all from unpatched `braces` GHSA-vfj7-8cjw-p6xm. The gate accepts only that exact dev-only advisory until 17 November 2026, never accepts unknown high/critical findings, and fails closed if the audit cannot complete. Do not feed untrusted glob patterns to ESLint. This is a documented mitigation, not a claim of a clean full audit.

CI and container installs disable automatic dependency scripts, then explicitly run the Prisma-engine and esbuild setup plus Prisma generation. Review any additional lifecycle script before adding it to this allowlist.

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run security:secrets`, `npm run security:dependencies`, `npm run test:security` and `npm run build`. Security integration requires a localhost database ending in `_test`; it creates and removes test fixtures and rolls back a temporary RLS probe role. CI uses PostgreSQL 16 and runs the migrations/security integration. Node 22.9+ is required for the optional-env-file test command. `test:smoke` checks the running local production app.

## Verification from this session

- 28 migrations applied successfully to the isolated PostgreSQL test database.
- 33 unit/regression tests pass, plus database security integration covering token purpose/expiry/replay/email binding, concurrent reset/sign-in, disabled accounts, shared counters, encrypted recovery requests and RLS.
- 83 static authenticated pages rendered; signed-out protection, five employee restrictions and all eight download account gates passed.
- HTTP checks passed nonce propagation into scripts, production CSP without eval, foreign-origin rejection, public/legal/metadata routes, careers-host isolation, and canonical HTTPS redirect/HSTS logic. Live certificates were not issued.
- Production browser account controls and cookie notice work without console errors; the account page fits a 390-pixel viewport. Recovery clearly reports unavailable when required CAPTCHA is unconfigured.
- TypeScript, ESLint, source scanning and production build pass. Dependency gate passes with the exact dated development advisory exception described above. Docker Compose HTTPS profile configuration validates; container image build and a live gateway/certificate were not tested.

## Sources

- [OWASP password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [Cloudflare server-side token validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Next.js nonce CSP guide](https://nextjs.org/docs/app/guides/content-security-policy), also checked against bundled 16.3 documentation
- [Deepmerge 8 release](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0) and [remaining braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
