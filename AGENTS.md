# Orbit: instructions for coding agents

Orbit is the internal operations app for Edubotics Global (Kochi, Kerala): CRM, HR, payroll, projects, school sessions, billing, inventory and more, for about 10 staff. It was called Edubotics One until 19 Oct 2026; the repo, Docker project and backup file names keep that name on purpose (renaming them loses the office data volumes).

## Read before you change anything

| Doc | What it tells you |
| --- | --- |
| [docs/PRD.md](docs/PRD.md) | Who uses Orbit, what it must do, and the rules the owner has decided |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the code is laid out and how a request flows |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Brand, colours, type, components and UI rules |
| [docs/CODE_STYLE.md](docs/CODE_STYLE.md) | How pages, server actions and lib files are written here |
| [docs/SECURITY.md](docs/SECURITY.md) | Rules every change must keep (permissions, files, secrets) |
| [docs/TESTING.md](docs/TESTING.md) | Which checks to run and how to add tests |
| [README.md](README.md) | Module list and how to run it |

The long developer handover (every module, the data model, business rules, screenshots) is kept outside the repo in the handover pack: `HANDOVER.md` / "Orbit: Developer Handover". Ask the owner for it if you need more than these docs.

## Rules

1. **Check permissions on the server.** Every page and server action starts with `requireUser([...roles])` or `requireOwner()` from `src/lib/auth.ts`. Hiding a menu item is never the protection.
2. **Reuse before you add.** Shared UI is in `src/components/` (`ui.tsx`, `action-form.tsx`), business rules in `src/lib/`. Look for an existing helper first; don't add a parallel module for something that already has a home.
3. **No new dependencies without a reason.** The app has ten runtime dependencies and no UI kit, icon library or chart library. Icons are hand-drawn paths in `src/components/icons.tsx`; charts are plain SVG/CSS.
4. **Money and numbering are tested code.** GST, TDS, payroll, commission and document numbers live in `src/lib/` and have tests in `tests/`. Change them only with a test that shows the new behaviour.
5. **Schema changes go through migrations.** Edit `prisma/schema.prisma`, run `npm run db:migrate`, commit the new folder under `prisma/migrations/`. Never edit an applied migration. New tables get row-level security switched on (see `prisma/migrations/20261017133000_private_table_rls`).
6. **Statutory payroll switches stay off** (PF, ESI, professional tax, TDS, gratuity) until the owner's accountant confirms them. Don't change their defaults.
7. **Keep the look.** One teal accent (with the logo's orange spark for small marks) on a pale teal-grey page with white cards and a deep teal-navy menu. No new colours, extra gradients, heavy effects or emoji in the UI. See the design doc.
8. **Write for staff, not developers.** Labels and messages are short plain English ("Leave approved", not "Mutation succeeded").
9. **Never commit secrets or `.env`.** `npm run security:secrets` runs in CI.

## Commands

```bash
npm install                 # also runs prisma generate
npm run dev                 # http://localhost:3000
npm run db:migrate          # after editing prisma/schema.prisma
npm run typecheck && npm run lint && npm test    # before every commit
npm run build               # what CI and Docker run
```

## Before you open a PR

- `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass (CI runs these plus the security checks).
- A role-sensitive change was tried as the roles it affects (`npm run test:roles` against a `_test` database).
- New pages appear in `src/lib/nav.ts` for the right roles and work at 375 px wide.
- The README module list is updated if you added or changed what staff can do.
- Every merge needs the office copy rebuilt (`docker compose up -d --build`) and, if there is a migration, `npx prisma migrate deploy` on the Vercel database. Say so in the PR.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
