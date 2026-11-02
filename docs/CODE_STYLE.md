# Code style

Match the file you are in. These are the patterns the code already follows.

## TypeScript

- Strict mode; import from `@/` (`@/lib/db`, `@/components/ui`). No `any` unless a library forces it.
- Prisma types come from `@prisma/client` (`Role`, enums, `Prisma.Decimal`). Don't redeclare them.
- Prefer small pure functions in `src/lib/` for anything with a rule in it, so it can be tested without a database.
- Comments explain *why* in plain words, usually one line. File headers say what the file is for (see `src/proxy.ts`, `src/lib/secret-box.ts`).

## Pages

- `page.tsx` is a server component: `requireUser([...])` first, then queries, then JSX. Mark files `"use client"` only for interactivity (forms with state, menus, polling).
- Start with `<PageHeader>`; use the shared components and classes in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).
- Pages for one menu group live together under `src/app/(app)/<group>/`. Queries used by several pages go in that folder's `data.ts` or in `src/lib/<area>.ts`.
- Add new pages to `src/lib/page-access.ts` (who may open them) and `src/lib/nav.ts` (the menu, for those roles only).

## Server actions

One `actions.ts` per area, `"use server"` at the top. The shape, from `src/app/(app)/crm/actions.ts`:

```ts
const leadSchema = z.object({ name: z.string().trim().min(1, "required"), /* ... */ });

export async function createLead(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();                                 // 1. who, and may they
  const parsed = leadSchema.safeParse(Object.fromEntries(formData)); // 2. parse input with zod
  if (!parsed.success) return { error: firstError(parsed.error) };
  const lead = await db.lead.create({ data: { ...parsed.data, ownerId: user.id } }); // 3. write, scoped
  refresh();                                                         // 4. revalidatePath(...)
  redirect(`/crm/leads/${lead.id}`);                                 // or return { ok: "Lead saved" }
}
```

- Check the role inside the action even if the page already did; actions can be called directly.
- Check record ownership (manager → direct reports, employee → own records), not just the role.
- Return `{ error }` with a sentence staff can act on. Catch Prisma `P2002` for duplicates and say what clashed.
- Use `db.$transaction` when several rows must change together (stock moves, numbering, payroll).
- Record deletes, role changes and settings changes with `logActivity` (`src/lib/activity.ts`).

## Database

- Edit `prisma/schema.prisma`, then `npm run db:migrate -- --name what_changed`. Commit the migration folder.
- Money: `Decimal @db.Decimal(14, 2)`. Rates: `Decimal(5, 2)`. Dates without a time: stored at UTC midnight, parsed with `parseDateOnly`.
- Index foreign keys you filter on. Add `@@unique` for anything that must not repeat (document numbers use `@@unique([fy, seq])`).
- New tables need row-level security switched on in the migration, like `prisma/migrations/20261018200100_staff_messages_rls`. `npm run test:security` fails otherwise.

## Naming

- Files: kebab-case (`payment-reminders.ts`, `action-form.tsx`). Components: PascalCase. Functions and variables: camelCase. Prisma enums: UPPER_SNAKE.
- Name things the way staff say them: `leave`, `payslip`, `school`, `session`, not `absenceRecord` or `tenant`.
- Pure calculation files end in `-math.ts` or `-rules.ts`.

## Words in the UI

Short, plain, polite English for staff in Kerala: "Leave approved", "Only admins can delete CRM records", "Nothing waiting for you". Indian formats: `formatINR`, `formatDate` (`src/lib/format.ts`). No technical errors on screen.

## Formatting

No Prettier config: keep the surrounding style (double quotes, semicolons, 2-space indent, long lines are fine). `npm run lint` is the rule.
