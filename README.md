# Edubotics One

Internal operations software for **Edubotics Global** (Kochi, Kerala). One app for the whole team, starting with:

- **CRM**: leads, institutions (schools, colleges, companies), contacts, a deal pipeline in ₹, and follow-ups (calls, visits, meetings, tasks).
- **HRM**: employee records, departments, reporting lines, leave requests with manager approval, leave balances, and the holiday calendar.
- **Attendance**: check-in/out, a monthly calendar per person, and a daily register for managers. Statuses follow Edubotics HR V1.2: Present, ID (incomplete duty), OD (overtime duty), Mis-punch, Absent, Leave. Employees request a fix for a missed punch-out; managers approve. Monthly CSV export.
- **Onboarding**: a standard joining checklist (added automatically for new joiners), document upload (Aadhaar, PAN, bank details, offer letter; PDF or image up to 5 MB, visible only to the employee and admins) with admin verification, training modules with progress, and an asset register (laptops, access cards, lab and robotics kits).
- **Payroll**: salary per employee (Basic + HRA + special allowance, with history), a monthly payroll run with loss-of-pay from approved unpaid leave and proration for mid-month joiners or leavers, hand-entered bonuses and deductions, finalize and mark paid, printable payslips each employee can see, and a CSV export. PF, ESI, professional tax and TDS are switches under **Admin → Settings**, all off by default.

- **Projects and tasks**: every school programme, college workshop, final-year project or internal job runs through the same eight steps (Create → Assign → Plan → Execute → Review → Approval → Handover → Complete), with a team, milestones and tasks. A won CRM deal starts its delivery project in one click, with the institution and programme filled in. Approval is a gate: an admin or the owner's manager approves or sends it back with a note.
- **Approvals**: one inbox for managers and admins with projects, timesheets, leave, missed punch-outs, expense claims, inventory requests and purchase orders.
- **Inventory**: robotics and IoT kits, parts and consumables counted by quantity, with a stock history for every item. Anyone can request items (usually for a project); the requester's manager or an admin approves; an admin issues them and later records what came back and what was lost or used up. Items at or below their low-stock level are flagged in the sidebar and on the home page. Equipment issued to one person (laptops, access cards) stays in HR → Assets.
- **Progress updates and files** (from Task Flow): each task has its own page with a progress slider, reports, file attachments and history. The project owner can ask the assignee for an update, which waits on their Home and My work until they post one. Project pages have an updates feed and files; the Projects page shows tasks by status, what needs attention and recent activity; Team workload shows who is carrying what.
- **My work and timesheets**: each person's tasks ordered by update requests, then what is overdue and due next; a daily work log (start and end time with lunch left out, what was done, status, files) that fills the weekly timesheet, submitted to the manager for approval. Managers see everyone's logged work under Team daily work.
- **Expense claims**: staff claim back travel, food, stay, kits and other work spending, with a photo or PDF of the receipt and an optional project or school. Travel in their own two-wheeler or car is paid per km at rates set under **Admin → Settings** (0 = enter the fare by hand). The manager or an admin approves in Approvals, optionally a lower amount. Approved claims are added to the next payroll run on top of net salary and listed on the payslip; an admin can instead mark one paid separately (cash, UPI). Team expenses shows totals by person and category with a CSV download.
- **Purchases**: vendors (with GSTIN, state and payment terms), purchase orders that anyone can raise and the requester's manager or an admin approves in the Approvals inbox (admins' own orders are approved automatically), a printable order for the vendor, and deliveries recorded against the order. Stock items that arrive go straight into inventory at the order's price. Admins enter the vendor's bill (with a photo or PDF), record payments with any TDS held back, and see what is owed on **Payables**, by vendor and how late. GST is CGST + SGST for Kerala vendors and IGST for others. Spreadsheet download of all bills for the accountant.
- **School sessions** (operations): each school's programme for the academic year with its trainers and weekly timetable (company holidays skipped), a week schedule that warns about clashes and trainers on leave, session logs (held, cancelled, missed) filled in by the trainer, a printable progress report for the school, and a monthly report by trainer and school with a spreadsheet download.
- **School invoicing**: GST invoices from a won deal or by hand (CGST + SGST inside Kerala, IGST otherwise, SAC 999293 at 18% by default), numbers like EBG/26-27/001 that restart each April, printable invoices, payments with any TDS held back, and a payments-due list by school and how late. Only admins and managers see invoices. Company GSTIN, PAN and bank details go under **Admin → Settings**.
- **Recruitment**: jobs with a stage board (Applied, Screening, Interview, Offer, Hired), candidates with resumes, interviews booked with any staff member who rates the candidate, offers (admins only) with a printable offer letter, and one click to move a hire into HR onboarding with salary and login.
- **Notice board**: admins and managers post company announcements and policies (with an optional PDF or image). Announcements show on everyone's Home; a notice can require everyone to read and acknowledge it, with a due date and a list of who hasn't yet. Changing a policy can ask everyone to acknowledge again.
- **Helpdesk**: staff raise requests to the admin team (equipment, repairs, letters, payslip queries, accounts, supplies, travel) with a category, priority and attachments; admins assign, comment and move them through open, in progress and done, and the requester sees each change on Home. Requests can point at an HR asset.
- **Daily checklists**: repeating checklists (every working day, weekly, monthly or before each school session) set up by admins and managers for chosen people, a role or everyone. Staff tick items on Home or their phone with an optional note or photo (some items can require a photo); overdue and missed ones are flagged to their manager, with history per person and per checklist. Session checklists show on the school session page.

## How it works

| Area | What people can do |
|---|---|
| Home | Your next priority, open tasks, hours this week, project health, approvals waiting, CRM follow-ups, who is on leave, holidays. Admins also see pipeline and won-this-month |
| My work / Projects | Tasks assigned to you; projects you are on (managers: also their team's; admins: all) |
| Timesheet | Log each day's work against a task or project (it can also move the task's progress), submit the week, see it approved or sent back. Managers and admins also see Team daily work |
| Approvals | Managers and admins approve projects, timesheets, leave, attendance fixes, expense claims, kit requests and purchase orders in one place |
| Expenses | Claim travel and other spending with a receipt; see what is waiting, approved and paid. Managers: Team expenses |
| Notice board | Everyone reads announcements and policies and taps "I have read this" where asked; admins and managers post, pin, archive and see who hasn't read |
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
