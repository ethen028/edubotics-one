import Link from "next/link";
import { db } from "@/lib/db";
import { isAdmin, isManagerOrAdmin, requireUser } from "@/lib/auth";
import { daysFromNow, todayIST } from "@/lib/time";
import { Badge, PageHeader, Stat } from "@/components/ui";
import { formatDate, formatDateTime, formatINR, humanize } from "@/lib/format";
import { OPEN_STAGES } from "./crm/constants";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const { denied } = (await searchParams) as Record<string, string | undefined>;

  const now = new Date();
  const todayUTC = todayIST();
  const monthStart = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), 1));

  const [openLeads, pipeline, wonThisMonth, myFollowUps, onLeaveToday, holidays, pendingApprovals, recentLeads] =
    await Promise.all([
      db.lead.count({ where: { status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } } }),
      db.deal.aggregate({ where: { stage: { in: [...OPEN_STAGES] } }, _sum: { value: true }, _count: true }),
      db.deal.aggregate({ where: { stage: "WON", closedAt: { gte: monthStart } }, _sum: { value: true }, _count: true }),
      db.activity.findMany({
        where: { assigneeId: user.id, done: false, dueAt: { not: null, lt: daysFromNow(2) } },
        include: { deal: true, lead: true, organization: true },
        orderBy: { dueAt: "asc" },
        take: 8,
      }),
      db.leaveRequest.findMany({
        where: { status: "APPROVED", startDate: { lte: todayUTC }, endDate: { gte: todayUTC } },
        include: { employee: true, leaveType: true },
      }),
      db.holiday.findMany({ where: { date: { gte: todayUTC } }, orderBy: { date: "asc" }, take: 4 }),
      isManagerOrAdmin(user)
        ? db.leaveRequest.count({
            where: {
              status: "PENDING",
              employeeId: { not: user.employee?.id ?? "" },
              ...(isAdmin(user) ? {} : { employee: { managerId: user.employee?.id ?? "__none__" } }),
            },
          })
        : Promise.resolve(0),
      db.lead.findMany({ where: { status: "NEW" }, orderBy: { createdAt: "desc" }, take: 5 }),
    ]);

  return (
    <>
      {denied && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You don&apos;t have access to that page.
        </div>
      )}
      <PageHeader title={`Hello, ${user.name.split(" ")[0]}`} subtitle={formatDate(todayUTC)} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open leads" value={openLeads} href="/crm/leads" />
        <Stat label={`Open pipeline (${pipeline._count} deals)`} value={formatINR(pipeline._sum.value ?? 0)} href="/crm/deals" />
        <Stat label={`Won this month (${wonThisMonth._count})`} value={formatINR(wonThisMonth._sum.value ?? 0)} />
        {isManagerOrAdmin(user) ? (
          <Stat label="Leave waiting for you" value={pendingApprovals} href="/hr/approvals" />
        ) : (
          <Stat label="On leave today" value={onLeaveToday.length} href="/hr/employees" />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Your follow-ups (overdue and next 2 days)</h2>
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
        </div>

        <div className="space-y-6">
          <div className="card">
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
          </div>
          <div className="card">
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
          </div>
          <div className="card">
            <h2 className="mb-2 font-semibold">New leads</h2>
            {recentLeads.length === 0 ? (
              <p className="text-sm text-slate-500">No new leads.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {recentLeads.map((l) => (
                  <li key={l.id}>
                    <Link href={`/crm/leads/${l.id}`} className="link">
                      {l.name}
                    </Link>
                    {l.organizationName && <span className="text-slate-500"> · {l.organizationName}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
