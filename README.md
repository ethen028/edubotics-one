# Edubotics One

Internal operations software for **Edubotics Global** (Kochi, Kerala). One app for the whole team, starting with:

- **CRM**: leads, institutions (schools, colleges, companies), contacts, a deal pipeline in ₹, and follow-ups (calls, visits, meetings, tasks).
- **HRM**: employee records, departments, reporting lines, leave requests with manager approval, leave balances, and the holiday calendar.
- **Attendance**: check-in/out, a monthly calendar per person, and a daily register for managers. Statuses follow Edubotics HR V1.2: Present, ID (incomplete duty), OD (overtime duty), Mis-punch, Absent, Leave. Employees request a fix for a missed punch-out; managers approve. Monthly CSV export.
- **Onboarding**: a standard joining checklist (added automatically for new joiners), document upload (Aadhaar, PAN, bank details, offer letter; PDF or image up to 5 MB, visible only to the employee and admins) with admin verification, training modules with progress, and an asset register (laptops, access cards, lab and robotics kits).
- **Payroll**: salary per employee (Basic + HRA + special allowance, with history), a monthly payroll run with loss-of-pay from approved unpaid leave and proration for mid-month joiners or leavers, hand-entered bonuses and deductions, finalize and mark paid, printable payslips each employee can see, and a CSV export. PF, ESI, professional tax and TDS are switches under **Admin → Settings**, all off by default.

- **Projects and tasks**: every school programme, college workshop, final-year project or internal job runs through the same eight steps (Create → Assign → Plan → Execute → Review → Approval → Handover → Complete), with a team, milestones and tasks. A won CRM deal starts its delivery project in one click, with the institution and programme filled in. Approval is a gate: an admin or the owner's manager approves or sends it back with a note.
- **My work and timesheets**: each person's tasks ordered by what is overdue and due next; a weekly timesheet logged against tasks or projects, submitted to the manager for approval.
- **Approvals**: one inbox for managers and admins with projects, timesheets, leave and missed punch-outs.

Planned next: inventory (kits) and operations.

## How it works

| Area | What people can do |
|---|---|
| Home | Your next priority, open tasks, hours this week, project health, approvals waiting, CRM follow-ups, who is on leave, holidays. Admins also see pipeline and won-this-month |
| My work / Projects | Tasks assigned to you; projects you are on (managers: also their team's; admins: all) |
| Timesheet | Log hours per day against a task or project, submit the week, see it approved or sent back |
| Approvals | Managers and admins approve projects, timesheets, leave and attendance fixes in one place |
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

## Run it in the office without hosting

One office computer can run the whole app with Docker Desktop, and staff on the same Wi-Fi use it from their browsers. Plain step-by-step guide: [docs/run-on-your-computer.md](docs/run-on-your-computer.md).

## Run locally

Requires Node 22+ and PostgreSQL 14+.

```bash
cp .env.example .env            # set DATABASE_URL and SESSION_SECRET
npm install
npm run db:migrate              # create tables
SEED_ADMIN_EMAIL=you@eduboticsglobal.com SEED_ADMIN_PASSWORD='choose-a-password' SEED_ADMIN_NAME='Your Name' npm run db:seed
npm run dev                     # http://localhost:3000
```

The seed adds departments, leave types (15 casual and 3 sick days a year, plus unpaid LOP), the fixed-date national holidays and four training modules. Working hours (default 9 h, OD after 30 extra minutes) and weekly offs (default Saturday and Sunday) are under **Admin → Settings**. It also adds the Kerala general holiday list for 2026 and 2027 (Onam, Vishu, Eid, Deepavali and the rest); moon-dependent and not-yet-notified dates are marked tentative. Confirm or correct them, and add later years, under **HR → Holidays**, and adjust quotas under **Admin → Leave types**.

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
