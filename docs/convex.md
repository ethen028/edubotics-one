# Convex in Orbit

Orbit is moving from PostgreSQL to [Convex](https://www.convex.dev) one module at a time ([CONVEX-MIGRATION-PLAN.md](CONVEX-MIGRATION-PLAN.md)). Until the move is finished both run side by side:

| Lives in Convex | Still in PostgreSQL |
| --- | --- |
| Notice board: notices, their files, acknowledgements | Everything else, including people, sign-in and companies |

## How it fits together

```
page.tsx / actions.ts ──► src/lib/convex.ts ──(signed token)──► convex/notices.ts ──► Convex tables + files
         │                  convexQuery / convexMutation           companyQuery / companyMutation
         └─► Prisma ──► PostgreSQL (people's names, everything not moved yet)
```

- **Sign-in stays Orbit's own.** For every call, `src/lib/convex.ts` signs a 5-minute token (ES256) for the current session with `CONVEX_AUTH_PRIVATE_KEY`. Convex checks it against `ORBIT_JWKS` (`convex/auth.config.ts`). The token carries the user, session, company and role.
- **Every Convex function uses `companyQuery` / `companyMutation`** from `convex/lib/orbit.ts`, never Convex's plain `query` / `mutation`. They refuse callers without a token, check `roles`, and give the function a `db` that only sees and writes the caller's company (tables without a rule are refused).
- **Pages still call `requireUser` first**, for the redirects; Convex checks the role again.
- **Ids of people** in Convex tables (`authorId`, `userId`) and `companyId` are PostgreSQL ids until people move. Pages join names from PostgreSQL (`namesOf` in `src/lib/notices.ts`).
- **Dates** are milliseconds (UTC). Date-only fields are UTC midnight, as in PostgreSQL.
- **Files** go to Convex storage. The browser never talks to Convex: Next fetches the file and sends it with `privateFileHeaders`, after checking the person.
- **Rules** shared by Next and Convex stay pure in `src/lib/*-rules.ts` (`notice-rules.ts`), imported from both sides.

## Working on it

```bash
npm run convex:keys                     # once: prints CONVEX_AUTH_PRIVATE_KEY (for .env) and ORBIT_JWKS
npx convex dev                          # a dev deployment (cloud or `--local`); writes CONVEX_URL to .env.local
npx convex env set ORBIT_JWKS '<value>' # once per deployment
npm run dev
npm run convex:move-notices             # copies notices from PostgreSQL (safe to repeat)
```

Set `CONVEX_URL` in `.env` to the deployment URL `npx convex dev` prints. Tests (`tests/convex-notices.test.ts`) run the real functions on `convex-test`, an in-memory Convex, so `npm test` needs no Convex server.

`convex/_generated/` is committed. `npx convex dev` (or `npx convex codegen`) rewrites it when you add a file to `convex/`.

## Office copy (Docker)

`docker-compose.yml` runs Convex on the same computer, nothing online:

- `convex`: the Convex backend (data in the `convex-data` volume).
- `convex-admin-key`: runs once, makes the key Orbit uses to load its functions (kept in the `convex-keys` volume).
- `convex-dashboard`: optional, `docker compose --profile convex-dashboard up -d`, then http://localhost:6791 on that computer.

`.env` needs one new line, `CONVEX_INSTANCE_SECRET` (see `.env.example`, made once and never changed). On every start `docker/start.sh` makes the sign-in key pair the first time, hands the public half to Convex, loads Orbit's functions and copies any notices not yet in Convex. If Convex isn't ready, Orbit still starts and only the Notice board shows an error.

Backups: each daily backup also saves `<name>.convex.zip` next to the `.dump`. Restore both ([backups.md](backups.md)).

## Vercel demo

Uses Convex's hosted service (free plan is plenty for demo data). On your computer: `npx convex deploy` with a deploy key for a production Convex deployment, `npx convex env set ORBIT_JWKS ...`, then in Vercel set `CONVEX_URL` and `CONVEX_AUTH_PRIVATE_KEY`, deploy, and run `npm run convex:move-notices` once against the demo database. Convex's hosted regions are US, Ireland, Sydney and Canada; none in India.

## Moving the next module

1. Tables in `convex/schema.ts` (with `companyId`, indexes starting with it, `legacyId`).
2. Functions in `convex/<module>.ts` with `companyQuery` / `companyMutation`, rules in `src/lib/<module>-rules.ts`.
3. Pages and actions call `convexQuery` / `convexMutation`; keep `requireUser`.
4. A `convex-test` test file per module: roles, other company, the business rules.
5. A copy script (`scripts/move-<module>-to-convex.ts`), safe to repeat, added to `docker/start.sh`.
6. Leave the PostgreSQL tables in place until the whole move is done, so going back loses nothing.
