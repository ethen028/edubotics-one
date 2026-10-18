# Edubotics One rebuild

Scope requested on 17 October 2026: analyse and rebuild both the interface and existing functionality.

## Design

Keep Next.js, React, Prisma, PostgreSQL, existing routes, permissions, and business records. Improve the shared application shell rather than replace working modules. Retain the Edubotics teal identity with a quieter white workspace, stronger headings, consistent controls, and accessible interaction states. Navigation must remain role-aware and become searchable. Preserve all existing actions.

## Implementation and acceptance

- Install the locked dependencies and establish lint, typecheck, schema, and production-build results. Fix demonstrated failures at their source.
- Run all migrations against a separate PostgreSQL database; seed only that database for local verification.
- Improve shared navigation, page headers, forms, tables, and empty states. Verify navigation filtering, active routes, small-screen menu, keyboard focus, and form feedback.
- Add loading, recoverable error, and not-found experiences without exposing internal exception details.
- Add focused regression coverage for shared business calculations and any demonstrated defects; include it in CI.
- Check sign-in and representative pages against the isolated database where browser tools are available.
- Record exact verification results and remaining gaps here. Do not describe source inspection as end-to-end validation.

## Baseline findings

- 122 page components and 87 Prisma models; no test files or test script found.
- Downloaded source has no Git metadata, installed dependencies, or local environment configuration.
- The app sidebar contains dozens of destinations with no search. Active navigation lacks `aria-current`; form feedback lacks live-region semantics.
- No shared loading/error/not-found boundaries were found in the initial route inspection.
- Live workflow correctness has not yet been established.

## Changes delivered

- Shared page headings, statistics, forms, tables, and empty states use a consistent visual hierarchy. The sign-in page has a responsive split layout.
- Role-aware navigation can be searched by page name or path. Empty groups disappear, mobile navigation stays within the viewport, Escape closes it and returns focus to Menu, and exact current pages expose `aria-current`.
- Added skip navigation, visible keyboard focus, live form feedback, and a pending state for submit buttons.
- Added a loading skeleton, a retryable error page, and a branded not-found page, following the installed Next.js 16.3 documentation.
- Reused bundled Inter font files for the website, removing the build's Google Fonts network dependency.
- Fixed `prisma/seed.ts` to load a local `.env` when present while preserving supplied environment values. Reproduced the missing-DATABASE_URL failure before the fix and successfully seeded afterward.
- Added ten business-rule tests, CI execution, and an opt-in integration smoke script.

## Verification

- All 25 Prisma migrations applied to a separate local PostgreSQL 16 database.
- Lint, TypeScript, Prisma schema validation, and ten regression tests passed.
- Production build passed with bundled fonts and no font downloads. Final build repeated after review adjustments.
- Integration smoke: 81/81 static authenticated pages rendered; signed-out protection and five employee role restrictions passed. Dynamic record pages are outside that count.
- Browser: password sign-in, home, navigation search and selection, invoices, mobile menu open/close, Escape focus restoration, and a 390-pixel viewport without horizontal overflow were verified.
- Created a project and assigned task through the browser; verified the saved detail page and task-added confirmation. These are local test records.
- Independent source review found two minor accessibility issues; both were corrected.

## Run and repeat

Run `npm run dev` for the local app. `npm test` runs business-rule tests. For integration smoke testing, start a production build with `npm run start -- --hostname 127.0.0.1 --port 3001`, then run `npm run test:smoke` in another terminal. The smoke script reads `.env` and refuses a database unless it is on localhost and its name ends in `_test`. Set `SMOKE_ADMIN_EMAIL` to an active admin who has completed initial password setup; the default is `rebuild@example.invalid`. `SMOKE_BASE_URL` defaults to `http://127.0.0.1:3001`. Test sessions are removed afterward; a test employee is retained in that isolated database.

This session created `.env` for the isolated `edubotics_test` database on port 55432, with a random session secret. The Docker container is named `edubotics-rebuild-test-db`. The temporary local admin is `rebuild@example.invalid` with password `LocalVerification8!Field`; use these credentials only for this local test database. Do not deploy this environment file or test account.

## Remaining limits

This rebuild improves the existing application in place; it does not replace all 122 pages or redefine business rules. Payroll finalization, accounting exports with real transactions, email delivery, uploads, and complete manager/employee lifecycle flows have not been verified end to end.

The dependency audit reports eight high-severity advisory entries, including three in the production dependency graph through Prisma tooling and `deepmerge-ts`. Other entries come through the ESLint globbing dependency chain. Suggested automated fixes include major version changes; none were forced. Treat dependency remediation as outstanding before production deployment.

The downloaded folder has no Git repository, so no commits or branch were created.
