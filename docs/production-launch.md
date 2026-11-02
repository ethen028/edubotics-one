# Production launch runbook

This runbook is for the supported single-host Docker deployment. Do not put the staff application on a public hostname until the organization has supplied the final domain, credentials, legal approval and incident owner.

## 1. Prepare the owner-controlled host

1. Install Docker Desktop or Docker Engine with Compose.
2. Copy `.env.production.example` to `.env` and replace every `CHANGE_ME` value. Use unique secrets and keep the file outside source control. Preserve `SESSION_SECRET` in the organization’s secret store: it signs sessions and encrypts saved service credentials.
3. Point the production domain to the host. Allow inbound ports 80 and 443 only; keep PostgreSQL private.
4. Set an off-host `BACKUP_COPY_FOLDER` owned by the organization.

## 2. Deploy

```sh
docker compose --profile https config --quiet
docker compose --profile https build
docker compose --profile https up -d
docker compose --profile https ps
```

The app container applies Prisma migrations and seed reference data before it starts. The gateway waits for `GET /api/health` to confirm that both Next.js and PostgreSQL are ready.

## 3. Release gate

- Open `/admin/launch` and review all eight readiness cards. Green cards are supported by current application evidence; purple cards require organization-owned credentials, infrastructure or approval.
- `https://<APP_DOMAIN>/api/health` returns HTTP 200 with `{"status":"ok"}`.
- Sign in with the first admin and immediately replace the temporary password.
- Create separate Employee, Manager and Admin acceptance accounts; verify direct-route denial as well as visible navigation.
- Test employee onboarding, attendance, leave approval, one inventory request/issue/return, one backup and an isolated restore.
- Configure SMTP, send a real test email and verify reply routing before enabling verified-email enforcement.
- If careers is public, configure a hostname-restricted CAPTCHA and test the public/private host boundary.
- Confirm privacy/terms content, retention rules, monitoring alerts and the named incident owner.

For a local presentation only, `npm run demo:seed` adds labelled profiles and representative module records. It creates four local demo logins with a generated temporary password and requires a password change on first use. The command refuses non-local databases and database names that do not end in `_test`; it does not publish vacancies. Rerunning it resets those demo passwords. HR currently uses the Admin security role.

Run `npm run test:acceptance` against the local test instance for all four role profiles and payroll preparation, draft privacy, publication, own-only payslip visibility and payment recording. The test uses disposable fixtures and a guarded historical month; it never transfers money. Run `npm run test:workflows` for HR, inventory and exit mutations. These automated checks support, but do not replace, business-owner acceptance and live-service verification.

## 4. First-hour monitoring

Check `/api/health`, container health, application logs, PostgreSQL connections, disk space and `/admin/health`. Investigate any new 5xx response, repeated restart, failed mail or failed backup before onboarding staff.

## 5. Rollback

Keep the previous source/image and a verified pre-release database backup. If the release causes authorization, data-integrity or sustained availability failures:

1. Stop user access at the gateway.
2. Preserve logs and create a fresh backup if the database is consistent.
3. Start the previous application image/source against the existing database only when its migrations are backward compatible.
4. If a migration is incompatible, restore the verified pre-release backup into an isolated database first, validate it, then schedule the production restore.
5. Verify `/api/health`, sign-in and one critical workflow before reopening access.

Database restore can discard records created after the backup. The operational owner must authorize a production restore and communicate the recovery point.
