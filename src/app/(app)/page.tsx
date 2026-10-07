import Link from "next/link";
import { db } from "@/lib/db";
import { isAdmin, isManagerOrAdmin, requireUser } from "@/lib/auth";
import { pendingApprovals } from "@/lib/approvals";
import { myPendingAcks } from "@/lib/notices";
import { daysFromNow, todayIST } from "@/lib/time";
import { mondayOf } from "@/lib/week";
import { OPEN_PROJECT_STAGES, progress, projectScope } from "@/lib/projects";
import { needsLogWhere, timeRange } from "@/lib/operations";
import { myOpenInterviews } from "@/lib/recruitment";
import { Badge, Stat } from "@/components/ui";
import { formatDate, formatDateTime, formatINR, humanize } from "@/lib/format";
import { lowStockItems, outstanding, requestNo } from "@/lib/inventory";
import { onOrderByItem, settledByBill } from "@/lib/purchases";
import { round2 } from "@/lib/purchase-math";
import { formatINR2 } from "./purchases/ui";
import { OPEN_STAGES } from "./crm/constants";
import { PriorityBadge, ProgressBar, StageBadge } from "./projects/ui";
import { TimesheetBadge } from "./timesheets/badge";
import { invoicesWithBalance } from "./invoices/data";
import { PendingAcks } from "./notices/ui";
import { HelpdeskHomeCard } from "./helpdesk/home-card";

export const metadata = { title: "Home" };

const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

function greeting() {
  const hour = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const { denied } = (await searchParams) as Record<string, string | undefined>;
  const admin = isAdmin(user);
  const manager = isManagerOrAdmin(user);

  const now = new Date();
  const today = todayIST();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const weekStart = mondayOf(today);

  const [
    myTasks,
    projects,
    myWeek,
    approvals,
    myPendingLeave,
    myFollowUps,
    onLeaveToday,
    holidays,
    pipeline,
    wonThisMonth,
    lowStock,
    itemsOut,
    mySessions,
    myLogsDue,
    allLogsDue,
    billsDue,
    interviews,
    toAcknowledge,
    notices,
  ] = await Promise.all([
      db.projectTask.findMany({
        where: { assigneeId: user.id, status: { not: "DONE" }, project: { stage: { not: "COMPLETE" }, onHold: false } },
        include: { project: { select: { id: true, name: true } } },
      }),
      db.project.findMany({
        where: { ...projectScope(user), stage: { in: [...OPEN_PROJECT_STAGES] } },
        include: {
          tasks: { select: { status: true, progress: true } },
          milestones: { where: { doneAt: null }, orderBy: { dueDate: { sort: "asc", nulls: "last" } }, take: 1 },
        },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      }),
      user.employee
        ? db.timesheet.findUnique({
            where: { employeeId_weekStart: { employeeId: user.employee.id, weekStart } },
            include: { entries: { select: { hours: true } } },
          })
        : null,
      pendingApprovals(user),
      user.employee ? db.leaveRequest.count({ where: { employeeId: user.employee.id, status: "PENDING" } }) : 0,
      db.activity.findMany({
        where: { assigneeId: user.id, done: false, dueAt: { not: null, lt: daysFromNow(2) } },
        include: { deal: true, lead: true, organization: true },
        orderBy: { dueAt: "asc" },
        take: 6,
      }),
      db.leaveRequest.findMany({
        where: { status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } },
        include: { employee: true, leaveType: true },
      }),
      db.holiday.findMany({ where: { date: { gte: today } }, orderBy: { date: "asc" }, take: 4 }),
      db.deal.aggregate({ where: { stage: { in: [...OPEN_STAGES] } }, _sum: { value: true }, _count: true }),
      db.deal.aggregate({ where: { stage: "WON", closedAt: { gte: monthStart } }, _sum: { value: true }, _count: true }),
      admin ? lowStockItems() : [],
      // Kits and parts out on issued requests: everyone's for admins, otherwise the user's own.
      db.stockRequest.findMany({
        where: { status: "ISSUED", ...(admin ? {} : { requesterId: user.id }) },
        include: { requester: { select: { name: true } }, lines: { include: { item: { select: { returnable: true } } } } },
        orderBy: { returnBy: { sort: "asc", nulls: "last" } },
      }),
      db.programmeSession.findMany({
        where: { trainerId: user.id, date: today, status: { not: "CANCELLED" } },
        include: { programme: { select: { organization: { select: { name: true } } } } },
        orderBy: { startTime: "asc" },
      }),
      db.programmeSession.count({ where: { trainerId: user.id, ...needsLogWhere(today) } }),
      manager ? db.programmeSession.count({ where: needsLogWhere(today) }) : 0,
      // Vendor bills overdue or due within a week.
      admin
        ? db.vendorBill.findMany({
            where: { status: "OPEN", dueDate: { lte: new Date(today.getTime() + 7 * 86_400_000) } },
            include: { vendor: { select: { name: true } } },
            orderBy: { dueDate: "asc" },
          })
        : [],
      myOpenInterviews(user.id),
      myPendingAcks(user),
      db.notice.findMany({
        where: { kind: "ANNOUNCEMENT", archivedAt: null, OR: [{ showUntil: null }, { showUntil: { gte: today } }] },
        include: { author: { select: { name: true } } },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        take: 3,
      }),
    ]);
  const [onOrder, billSettled] = await Promise.all([
    lowStock.length ? onOrderByItem(lowStock.map((i) => i.id)) : new Map<string, number>(),
    billsDue.length ? settledByBill(billsDue.map((b) => b.id)) : new Map<string, number>(),
  ]);
  const billsToPay = billsDue
    .map((b) => ({ ...b, balance: round2(Number(b.total) - (billSettled.get(b.id) ?? 0)) }))
    .filter((b) => b.balance > 0);

  const overdueInvoices = admin
    ? (await invoicesWithBalance({ status: "ISSUED", dueDate: { lt: today } })).filter((i) => i.balance > 0)
    : [];

  // Update requests first, then overdue and nearest due date, then priority.
  myTasks.sort((a, b) => {
    const ra = a.updateRequestedAt ? 0 : 1;
    const rb = b.updateRequestedAt ? 0 : 1;
    const da = a.dueDate?.getTime() ?? Infinity;
    const dbb = b.dueDate?.getTime() ?? Infinity;
    return ra - rb || da - dbb || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });
  const focus = myTasks[0];
  const dueToday = myTasks.filter((t) => t.dueDate && t.dueDate <= today).length;
  const weekHours = myWeek?.entries.reduce((s, e) => s + Number(e.hours), 0) ?? 0;
  const lateProjects = projects.filter((p) => p.dueDate && p.dueDate < today).length;

  const roleNote = admin
    ? "Company performance and decisions in one place."
    : manager
      ? "Team delivery, approvals and project health."
      : "Focus on what needs your attention today.";

  return (
    <>
      {denied && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You don&apos;t have access to that page.
        </div>
      )}

      <PendingAcks notices={toAcknowledge} />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-wider text-brand-700 uppercase">
            {today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {greeting()}, {user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-slate-500">{roleNote}</p>
        </div>
        <div className="flex gap-2">
          {admin && (
            <Link href="/dashboard" className="btn-secondary">
              Owner dashboard
            </Link>
          )}
          <Link href="/timesheets" className="btn-secondary">
            Log time
          </Link>
          {manager && (
            <Link href="/projects/new" className="btn-primary">
              New project
            </Link>
          )}
        </div>
      </div>

      {focus && (
        <section className="mb-6 rounded-2xl bg-brand-900 p-5 text-white shadow-lg">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold tracking-widest text-brand-300">NEXT PRIORITY</div>
              <h2 className="mt-1 text-xl font-semibold">{focus.title}</h2>
              <p className="text-sm text-brand-100/80">
                {focus.project.name}
                {focus.dueDate && ` · due ${formatDate(focus.dueDate)}`}
                {focus.dueDate && focus.dueDate < today && " (overdue)"}
              </p>
              {focus.updateRequestedAt && (
                <p className="mt-1 text-sm font-medium text-amber-200">Your project owner asked for an update on this.</p>
              )}
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                focus.priority === "HIGH" ? "bg-red-400/20 text-red-200" : "bg-white/10 text-brand-100"
              }`}
            >
              {focus.priority}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/projects/${focus.project.id}/tasks/${focus.id}`} className="btn bg-white text-brand-900 hover:bg-brand-50">
              {focus.updateRequestedAt ? "Post update" : "Open task"}
            </Link>
            <Link href="/work" className="btn text-white ring-1 ring-white/30 hover:bg-white/10">
              All my work ({myTasks.length})
            </Link>
          </div>
        </section>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={`My open tasks · ${dueToday} due or overdue`} value={myTasks.length} href="/work" />
        <Stat label={`Active projects${lateProjects ? ` · ${lateProjects} late` : ""}`} value={projects.length} href="/projects" />
        <Stat label="Hours this week" value={weekHours} href="/timesheets" />
        {manager ? (
          <Stat label="Waiting for your approval" value={approvals.total} href="/approvals" />
        ) : (
          <Stat label="My leave requests pending" value={myPendingLeave} href="/hr/leave" />
        )}
      </div>

      {admin && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label={`Open pipeline (${pipeline._count} deals)`} value={formatINR(pipeline._sum.value ?? 0)} href="/crm/deals" />
          <Stat label={`Won this month (${wonThisMonth._count})`} value={formatINR(wonThisMonth._sum.value ?? 0)} />
          <Stat label="Projects on track" value={`${projects.length - lateProjects} / ${projects.length}`} href="/projects" />
          <Stat label="On leave today" value={onLeaveToday.length} href="/hr/employees" />
          <Stat
            label={`School payments overdue (${overdueInvoices.length})`}
            value={formatINR(overdueInvoices.reduce((s, i) => s + i.balance, 0))}
            href="/invoices/dues"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Up next</h2>
              <Link href="/work" className="link text-sm">
                All
              </Link>
            </div>
            {myTasks.length === 0 ? (
              <p className="text-sm text-slate-500">No tasks assigned to you.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {myTasks.slice(0, 6).map((t, i) => (
                  <li key={t.id} className="flex items-center gap-3 py-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/projects/${t.project.id}/tasks/${t.id}`} className="block truncate font-medium hover:underline">
                        {t.title}
                      </Link>
                      <div className="truncate text-xs text-slate-500">
                        {t.project.name}
                        {t.updateRequestedAt && <span className="font-medium text-amber-700"> · update requested</span>}
                      </div>
                    </div>
                    <PriorityBadge priority={t.priority} />
                    <span
                      className={`w-24 text-right text-xs ${t.dueDate && t.dueDate < today ? "font-medium text-red-600" : "text-slate-500"}`}
                    >
                      {t.dueDate ? formatDate(t.dueDate) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{manager ? "Project health" : "My projects"}</h2>
              <Link href="/projects" className="link text-sm">
                All
              </Link>
            </div>
            {projects.length === 0 ? (
              <p className="text-sm text-slate-500">No active projects.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {projects.slice(0, 6).map((p) => {
                  const pct = progress(p.tasks);
                  return (
                    <Link key={p.id} href={`/projects/${p.id}`} className="rounded-xl border border-slate-100 p-3 hover:border-brand-300">
                      <div className="flex justify-between gap-2 text-sm">
                        <b className="truncate">{p.name}</b>
                        <span className="font-semibold text-brand-700">{pct}%</span>
                      </div>
                      <ProgressBar value={pct} className="my-2" />
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="truncate">{p.milestones[0]?.title ?? "No open milestone"}</span>
                        <StageBadge stage={p.stage} onHold={p.onHold} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">CRM follow-ups (overdue and next 2 days)</h2>
              <Link href="/crm/activities" className="link text-sm">
                All
              </Link>
            </div>
            {myFollowUps.length === 0 ? (
              <p className="text-sm text-slate-500">You&apos;re all caught up.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {myFollowUps.map((a) => {
                  const href = a.deal
                    ? `/crm/deals/${a.deal.id}`
                    : a.lead
                      ? `/crm/leads/${a.lead.id}`
                      : a.organization
                        ? `/crm/organizations/${a.organization.id}`
                        : "/crm/activities";
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                      <Link href={href} className="hover:underline">
                        <Badge>{humanize(a.type)}</Badge> {a.subject}
                        <span className="text-slate-500"> · {a.deal?.title ?? a.lead?.name ?? a.organization?.name}</span>
                      </Link>
                      <Badge color={a.dueAt! < now ? "red" : "amber"}>{formatDateTime(a.dueAt)}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {(mySessions.length > 0 || myLogsDue > 0 || allLogsDue > 0) && (
            <section className="card">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">My school sessions today</h2>
                <Link href="/operations" className="link text-sm">
                  Open
                </Link>
              </div>
              {mySessions.length === 0 ? (
                <p className="text-sm text-slate-500">No classes today.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {mySessions.map((s) => (
                    <li key={s.id}>
                      <Link href={`/operations/sessions/${s.id}`} className="hover:underline">
                        <span className="text-slate-500">{timeRange(s.startTime, s.durationMins).split(" – ")[0]}</span>{" "}
                        {s.programme.organization.name}
                        {s.classGroup && ` · ${s.classGroup}`}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {myLogsDue > 0 && <p className="mt-2 text-sm font-medium text-red-600">{myLogsDue} of your sessions need a log.</p>}
              {allLogsDue > myLogsDue && (
                <p className="mt-1 text-xs text-slate-500">{allLogsDue} logs due across all schools.</p>
              )}
            </section>
          )}
          {interviews.length > 0 && (
            <section className="card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Your interviews</h2>
                <Link href="/recruitment/interviews" className="link text-sm">
                  All
                </Link>
              </div>
              <ul className="space-y-2 text-sm">
                {interviews.slice(0, 5).map((i) => (
                  <li key={i.id}>
                    <Link href={`/recruitment/candidates/${i.candidate.id}`} className="hover:underline">
                      <b>{i.candidate.name}</b> <span className="text-slate-500">· {i.round}</span>
                    </Link>
                    <div className="text-xs text-slate-500">
                      {i.candidate.job.title} ·{" "}
                      {i.scheduledAt < now ? (
                        <span className="font-medium text-amber-700">feedback due</span>
                      ) : (
                        formatDateTime(i.scheduledAt)
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Notice board</h2>
              <Link href="/notices" className="link text-sm">
                All
              </Link>
            </div>
            {notices.length === 0 ? (
              <p className="text-sm text-slate-500">No announcements.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {notices.map((n) => (
                  <li key={n.id}>
                    <Link href={`/notices/${n.id}`} className="font-medium hover:underline">
                      {n.pinned && "📌 "}
                      {n.title}
                    </Link>
                    <p className="line-clamp-2 text-slate-600">{n.body}</p>
                    <p className="text-xs text-slate-400">
                      {n.author.name} · {formatDate(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <HelpdeskHomeCard user={user} />
          {manager ? (
            <section className="card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Needs your approval</h2>
                <Link href="/approvals" className="link text-sm">
                  Open
                </Link>
              </div>
              {approvals.total === 0 ? (
                <p className="text-sm text-slate-500">Nothing waiting.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {approvals.projects.length > 0 && <li>Projects · {approvals.projects.length}</li>}
                  {approvals.timesheets.length > 0 && <li>Timesheets · {approvals.timesheets.length}</li>}
                  {approvals.claims.length > 0 && <li>Expense claims · {approvals.claims.length}</li>}
                  {approvals.leave.length > 0 && <li>Leave · {approvals.leave.length}</li>}
                  {approvals.corrections.length > 0 && <li>Missed punch-outs · {approvals.corrections.length}</li>}
                  {approvals.stock.length > 0 && <li>Kit and part requests · {approvals.stock.length}</li>}
                  {approvals.purchases.length > 0 && <li>Purchase orders · {approvals.purchases.length}</li>}
                </ul>
              )}
            </section>
          ) : (
            <section className="card">
              <h2 className="mb-2 font-semibold">This week&apos;s timesheet</h2>
              <div className="flex items-center justify-between text-sm">
                <span>
                  <b className="text-lg">{weekHours}</b> h logged
                </span>
                {myWeek ? <TimesheetBadge status={myWeek.status} /> : <Badge>Not started</Badge>}
              </div>
              <Link href="/timesheets" className="link mt-2 inline-block text-sm">
                Open timesheet
              </Link>
            </section>
          )}
          {admin && lowStock.length > 0 && (
            <section className="card">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Low stock</h2>
                <Link href="/inventory?view=low" className="link text-sm">
                  All
                </Link>
              </div>
              <ul className="space-y-1 text-sm">
                {lowStock.slice(0, 6).map((i) => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <Link href={`/inventory/${i.id}`} className="truncate hover:underline">
                      {i.name}
                    </Link>
                    <span className="shrink-0 text-right">
                      <span className={i.onHand === 0 ? "font-medium text-red-600" : "text-amber-700"}>
                        {i.onHand} {i.unit}
                      </span>
                      {onOrder.get(i.id) ? (
                        <span className="ml-2 text-xs text-slate-500">{onOrder.get(i.id)} on order</span>
                      ) : (
                        <Link href={`/purchases/new?item=${i.id}&qty=${Math.max(1, i.reorderLevel * 2 - i.onHand)}`} className="link ml-2 text-xs">
                          Order
                        </Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {billsToPay.length > 0 && (
            <section className="card">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Vendor bills to pay</h2>
                <Link href="/purchases/payables" className="link text-sm">
                  All
                </Link>
              </div>
              <ul className="space-y-1 text-sm">
                {billsToPay.slice(0, 6).map((b) => (
                  <li key={b.id} className="flex justify-between gap-2">
                    <Link href={`/purchases/bills/${b.id}`} className="truncate hover:underline">
                      {b.vendor.name} · {b.billNo}
                    </Link>
                    <span className={`shrink-0 ${b.dueDate < today ? "font-medium text-red-600" : "text-slate-600"}`}>
                      {formatINR2(b.balance)} · {b.dueDate < today ? "late" : `due ${formatDate(b.dueDate)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {itemsOut.length > 0 && (
            <section className="card">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">{admin ? "Kits out" : "Kits with you"}</h2>
                <Link href="/inventory/requests?status=ISSUED" className="link text-sm">
                  All
                </Link>
              </div>
              <ul className="space-y-1 text-sm">
                {itemsOut.slice(0, 6).map((r) => {
                  const late = r.returnBy && r.returnBy < today;
                  return (
                    <li key={r.id} className="flex justify-between gap-2">
                      <Link href={`/inventory/requests/${r.id}`} className="truncate hover:underline">
                        {requestNo(r.number)} · {admin ? r.requester.name : `${r.lines.reduce((n, l) => n + outstanding(l), 0)} items`}
                      </Link>
                      <span className={late ? "font-medium text-red-600" : "text-slate-500"}>
                        {r.returnBy ? `${late ? "overdue " : "back "}${formatDate(r.returnBy)}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <section className="card">
            <h2 className="mb-2 font-semibold">On leave today</h2>
            {onLeaveToday.length === 0 ? (
              <p className="text-sm text-slate-500">Everyone&apos;s in.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {onLeaveToday.map((r) => (
                  <li key={r.id}>
                    {r.employee.firstName} {r.employee.lastName} <span className="text-slate-500">· {r.leaveType.code}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2 className="mb-2 font-semibold">Upcoming holidays</h2>
            {holidays.length === 0 ? (
              <p className="text-sm text-slate-500">None listed.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {holidays.map((h) => (
                  <li key={h.id} className="flex justify-between gap-2">
                    <span>{h.name}</span>
                    <span className="text-slate-500">{formatDate(h.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
