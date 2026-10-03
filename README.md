# Edubotics One

Internal operations software for **Edubotics Global** (Kochi, Kerala). One app for the whole team, starting with:

- **CRM**: leads, institutions (schools, colleges, companies), contacts, a deal pipeline in ₹, and follow-ups (calls, visits, meetings, tasks).
- **HRM**: employee records, departments, reporting lines, leave requests with manager approval, leave balances, and the holiday calendar.
- **Attendance**: check-in/out, a monthly calendar per person, and a daily register for managers. Statuses follow Edubotics HR V1.2: Present, ID (incomplete duty), OD (overtime duty), Mis-punch, Absent, Leave. Employees request a fix for a missed punch-out; managers approve. Monthly CSV export.
- **Onboarding**: a standard joining checklist (added automatically for new joiners), document upload (Aadhaar, PAN, bank details, offer letter; PDF or image up to 5 MB, visible only to the employee and admins) with admin verification, training modules with progress, and an asset register (laptops, access cards, lab and robotics kits).

Planned next: timesheets, projects (programme delivery per school), inventory (kits), and operations.

## How it works

| Area | What people can do |
|---|---|
| Dashboard | Open leads, pipeline value, won this month, your follow-ups, who is on leave, upcoming holidays |
| Leads | Capture enquiries, log calls, then **Convert** one into an institution + contact + deal in one step |
| Deals | Board by stage (Prospect → Demo → Proposal → Negotiation → Won/Lost) with programme, students covered and value |
| Institutions / Contacts | Every school, college or company and the people there, with all their deals and activity |
| Follow-ups | Your overdue, today and upcoming follow-ups |
| People | Directory; admins add and edit employee records and can create a login at the same time |
| My leave | Balances per leave type and requests. Sundays and company holidays are not counted |
| Leave approvals | Managers approve their direct reports; admins can approve anyone |
| Admin → Users | Create logins, set roles, reset passwords, disable access |

**Roles**: `ADMIN` (HR records, assets, document verification and settings), `MANAGER` (approves their team's leave and attendance fixes, runs their onboarding and training), `EMPLOYEE`. Everyone can use the CRM; only admins delete CRM records.

## Tech

Next.js 16 (App Router, server actions) · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma 6. Sign-in is email + password with a signed, HTTP-only session cookie.

## Run locally

Requires Node 22+ and PostgreSQL 14+.

```bash
cp .env.example .env            # set DATABASE_URL and SESSION_SECRET
npm install
npm run db:migrate              # create tables
SEED_ADMIN_EMAIL=you@eduboticsglobal.com SEED_ADMIN_PASSWORD='choose-a-password' SEED_ADMIN_NAME='Your Name' npm run db:seed
npm run dev                     # http://localhost:3000
```

The seed adds departments, leave types (CL 12, SL 12, EL 12, LOP), the fixed-date national holidays and four training modules. Working hours (default 9 h, OD after 30 extra minutes) and weekly offs (default Saturday and Sunday) are under **Admin → Settings**. It also adds the Kerala general holiday list for 2026 and 2027 (Onam, Vishu, Eid, Deepavali and the rest); moon-dependent and not-yet-notified dates are marked tentative. Confirm or correct them, and add later years, under **HR → Holidays**, and adjust quotas under **HR → Leave types**.

## Deploy

Any Node host plus a managed PostgreSQL works. For a 10-person team the simplest options are:

- A small VPS (e.g. Mumbai/Bangalore region) running `npm run build && npm start` behind Nginx, with Postgres on the same box or managed.
- A platform such as Railway or Render with their Postgres add-on.

On each deploy run `npm run db:deploy` before starting the app. Set a long random `SESSION_SECRET` (`openssl rand -base64 48`) and serve over HTTPS.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` / `npm run lint` | Checks (also run in CI) |
| `npm run db:migrate` | Create a migration after editing `prisma/schema.prisma` |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Starter data and first admin |
