# Vercel deployment preparation

Status: a Vercel Preview is deployed in the `edubotics/edubotics-one` project, backed by the isolated free Neon resource `edubotics-one-preview` in Singapore. All 28 migrations and reference seeds have been applied. The protected Preview health endpoint returned HTTP 200 with `{"status":"ok"}` on 17 October 2026. Stable Preview origin: `https://edubotics-one-demo.vercel.app`.

Vercel authentication protection remains enabled. A generated temporary application admin is stored in the ignored local `.vercel/preview-login.txt`; it is not included in source uploads or the delivery ZIP. The local demo database was not copied to Neon. No real staff data has been uploaded.

This is a staging/demo deployment. The platform gaps below remain release blockers for real staff use. The initial automatic Production deployment had no Production database configured; use the protected demo hostname for review rather than the production alias.

Use the Next.js project in the inner `edubotics-one-main` directory as the Vercel project root. `vercel.json` selects Next.js, `npm ci`, `npm run build`, and Mumbai. Prisma generates its client through postinstall. `.vercelignore` excludes local environment files, builds, dependencies and backups from source uploads.

## Required environment

Configure values in Vercel's environment settings, separately for Preview and Production. Do not upload the local `.env` or use local test database credentials.

- `DATABASE_URL`: hosted PostgreSQL TLS connection, preferably pooled and near Mumbai. Use a dedicated staging database for Preview.
- `SESSION_SECRET`: unique random secret of at least 32 characters, preserved in the organization's secret store.
- `APP_URL`: exact HTTPS application origin. Set after the Vercel hostname is allocated, then redeploy.
- `COOKIE_SECURE=true`, `TRUST_PROXY_HEADERS=true`, `FORCE_HTTPS=true`.
- Configure SMTP in the application and send a real test message before enabling `REQUIRE_VERIFIED_EMAIL`.
- Keep public careers disabled until its separate host and CAPTCHA are configured.

Vercel's managed HTTPS ingress must be the only public route to the app. Sign in with `vercel login`, link to the intended team, and create a Preview deployment before promoting production. Keep Deployment Protection enabled for Preview.

## Platform gaps before full production use

1. **Uploads and downloads:** Vercel Functions cap request/response payloads at 4.5 MB. This app supports database-backed uploads of 5 MB and project updates up to 25 MB. Complete migration requires private object storage with direct signed uploads and permission-checked downloads, or explicitly reduced product limits and tests of historical large files. This preparation does not solve large-file transport.
2. **Backups:** the Docker `pg_dump` worker and filesystem copy directories do not run on Vercel. Enable provider-managed PostgreSQL backups, select retention and test an isolated restore. Do not set Docker backup directories in Vercel.
3. **Recovery email:** Vercel requests schedule queue processing through Next.js `after`; the persistent interval is disabled there. Provision a separate worker or protected frequent scheduler for durable retries/backlogs before production reliance. Hobby cron runs at most daily and is unsuitable for a 15-minute recovery queue.
4. **Monitoring:** in-memory metrics are per-instance. Configure external uptime alerts and persistent Vercel/provider logs with a named incident owner.

Apply migrations with `npm run db:deploy` from a trusted deployment environment using that environment's database URL. Run the reference seed with organization-owned first-admin credentials; never run `demo:seed` on production. Do not place temporary seed passwords in build logs.

## Verification before promotion

- `/api/health` returns 200 and `{"status":"ok"}` on the allocated origin.
- Verify HTTPS origin/cookies, sign-in and role restrictions.
- Test recovery through actual SMTP and the worker mechanism.
- Test private file authorization and payload boundaries on the deployed platform.
- Verify a backup and isolated restore; record business/legal approvals.

Sources checked on 17 October 2026: [Vercel Functions limits](https://vercel.com/docs/functions/limitations), [Cron scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), and installed Next.js `after` documentation.
