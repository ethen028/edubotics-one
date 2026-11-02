# Testing

## Every change

```bash
npm run typecheck   # next typegen + tsc
npm run lint
npm test            # unit tests in tests/, no database needed
npm run build
```

CI (`.github/workflows/ci.yml`) runs these on every pull request, plus `security:secrets`, `security:dependencies`, `prisma validate`, all migrations on a fresh PostgreSQL 16 and `test:security`.

## Unit tests (`tests/*.test.ts`)

`node:test` and `node:assert/strict`, run through tsx. They test pure functions from `src/lib/`: GST totals and document numbers (`money.test.ts`), payroll, leave and attendance rules, permissions, dashboard date ranges, payment reminders, recognition, HTTP and file security.

- Any change to money, numbering, payroll, leave or permissions needs a test that shows the new behaviour.
- Keep rules in pure functions (`*-math.ts`, `*-rules.ts`) so they can be tested without a database.
- Name tests as a sentence about the business rule: `"invoice to another state charges IGST only"`.
- Build dates as UTC midnight: `new Date("2026-04-01T00:00:00Z")`.

## Integration scripts

These need a local PostgreSQL database whose name ends in `_test` and refuse anything else.

| Command | What it checks | Needs |
| --- | --- | --- |
| `npm run test:security` | Rate limits, recovery email queue, row-level security on every table | `_test` database (CI runs it) |
| `npm run test:smoke` | Every static signed-in page renders; signed-out and employee restrictions | Running app on `127.0.0.1:3001`, an admin login |
| `npm run test:roles` | Signs in as each role and opens every page by address; fails if a role reaches a page it shouldn't | Running app + demo data (`npm run demo:seed`) |
| `npm run test:acceptance` | Four role profiles, permissions and a full payroll run | Running app |
| `npm run test:workflows` | HR and inventory flows through real server actions | Running app |

Start the app for them with `npm run build && npm run start -- --hostname 127.0.0.1 --port 3001`.

## By hand

For UI changes, check the page as the roles it affects (demo logins come from `npm run db:seed-demo` on a database named `*_demo` or `*_test`), in light and dark mode, and at 375 px wide with no sideways scroll.

Never point any test or the demo seed at the office database.
