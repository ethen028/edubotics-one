import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pendingApprovals } from "@/lib/approvals";
import { getAttendance, summarize } from "@/lib/attendance-data";
import { STATUS_LABEL, dateKey, formatMinutes, formatTime } from "@/lib/attendance";
import { getLeaveBalances } from "@/lib/leave-balance";
import { OPEN_TICKET_STATUSES } from "@/lib/helpdesk";
import { daysFromNow, todayIST } from "@/lib/time";
import { mondayOf } from "@/lib/week";
import { timeRange } from "@/lib/operations";
import { formatDate, formatINR } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui";
import { ChecklistsHomeCard } from "../../checklists/home-card";
import { Attention, Line, Lines, Panel, fullName, plural } from "../role-ui";

export const metadata = { title: "My dashboard" };

/**
 * Everyone's own dashboard: their attendance, leave, tasks, checklists, sessions, timesheet, money and requests.
 * Every query is filtered to the signed-in person (or, for the team panel, their direct reports), so nobody
 * reaches anyone else's figures through this page.
 */
export default async function MyDashboard() {
  const user = await requireUser();
  const emp = user.employee;
  const today = todayIST();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const weekStart = mondayOf(today);
  const leads = user.role === "MANAGER" || (await db.employee.count({ where: { managerId: emp?.id ?? "__none__", status: { not: "EXITED" } } })) > 0;

  const [attendance, balances, pendingLeave, tasks, week, sessions, claims, payslip, tickets, itemsOut, holidays, approvals, team] = await Promise.all([
    emp ? getAttendance([emp.id], monthStart, today) : null,
    emp ? getLeaveBalances(emp.id) : [],
    emp ? db.leaveRequest.findMany({ where: { employeeId: emp.id, status: "PENDING" }, include: { leaveType: true }, orderBy: { startDate: "asc" } }) : [],
    db.projectTask.findMany({
      where: { assigneeId: user.id, status: { not: "DONE" }, project: { stage: { not: "COMPLETE" }, onHold: false } },
      include: { project: { select: { name: true } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      take: 6,
    }),
    emp ? db.timesheet.findUnique({ where: { employeeId_weekStart: { employeeId: emp.id, weekStart } }, include: { entries: { select: { hours: true } } } }) : null,
    db.programmeSession.findMany({
      where: { trainerId: user.id, date: { gte: today, lte: daysFromNow(7) }, status: { not: "CANCELLED" } },
      include: { programme: { select: { organization: { select: { name: true } } } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 5,
    }),
    emp ? db.expenseClaim.groupBy({ by: ["status"], where: { employeeId: emp.id, status: { in: ["SUBMITTED", "APPROVED"] } }, _sum: { amount: true, approvedAmount: true }, _count: true }) : [],
    emp ? db.payslip.findFirst({ where: { employeeId: emp.id, run: { status: { not: "DRAFT" } } }, include: { run: { select: { month: true } } }, orderBy: { run: { month: "desc" } } }) : null,
    db.helpdeskTicket.count({ where: { requesterId: user.id, status: { in: [...OPEN_TICKET_STATUSES] } } }),
    db.stockRequest.count({ where: { requesterId: user.id, status: "ISSUED" } }),
    db.holiday.findMany({ where: { date: { gte: today }, optional: false }, orderBy: { date: "asc" }, take: 3 }),
    leads ? pendingApprovals(user) : null,
    leads && emp
      ? db.employee.findMany({
          where: { managerId: emp.id, status: { not: "EXITED" } },
          select: { id: true, firstName: true, lastName: true, leaveRequests: { where: { status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } }, select: { id: true } } },
          orderBy: { firstName: "asc" },
        })
      : [],
  ]);

  const days = emp && attendance ? attendance.days.get(emp.id) : undefined;
  const todayDetail = days?.get(dateKey(today));
  const month = days ? summarize(days.values(), attendance!.settings.workMinutesPerDay) : null;
  const firstIn = todayDetail?.sessions[0]?.checkIn ?? null;
  const open = todayDetail?.sessions.some((s) => !s.checkOut);
  const leaveLeft = balances.reduce((s, b) => s + (b.remaining ?? 0), 0);
  const weekHours = week?.entries.reduce((s, e) => s + Number(e.hours), 0) ?? 0;
  const dueToday = tasks.filter((t) => t.dueDate && t.dueDate <= today).length;
  const claimTotal = (status: string) => {
    const row = claims.find((c) => c.status === status);
    return { count: row?._count ?? 0, amount: Number((status === "APPROVED" ? row?._sum.approvedAmount ?? row?._sum.amount : row?._sum.amount) ?? 0) };
  };
  const submitted = claimTotal("SUBMITTED");
  const toBePaid = claimTotal("APPROVED");
  const teamOnLeave = team.filter((t) => t.leaveRequests.length > 0);

  return (
    <>
      <PageHeader title="My dashboard" subtitle="Your attendance, leave, work and money in one place. Only you see these figures." />

      {!emp && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your login isn&apos;t linked to an employee record yet, so attendance, leave and payslips can&apos;t show. Ask an admin to link it in Users.
        </div>
      )}

      <Attention
        items={[
          approvals && approvals.total > 0 && { text: `${plural(approvals.total, "request")} from your team to decide`, href: "/approvals" },
          dueToday > 0 && { text: `${plural(dueToday, "task")} due today or late`, href: "/work" },
          emp && !firstIn && todayDetail?.status === "NOT_YET" && { text: "You haven't checked in today", href: "/hr/attendance" },
        ]}
      />

      <div className="executive-stats mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Today"
          value={!emp ? "—" : firstIn ? `${open ? "In since" : "In at"} ${formatTime(firstIn)}` : todayDetail ? STATUS_LABEL[todayDetail.status] : "—"}
          href="/hr/attendance"
        />
        <Stat label="Leave left this year" value={emp ? `${leaveLeft} days` : "—"} href="/hr/leave" />
        <Stat label={`Open tasks · ${dueToday} due`} value={tasks.length} href="/work" />
        <Stat label="Timesheet this week" value={emp ? `${weekHours} h` : "—"} href="/timesheets" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {month && (
          <Panel title="Attendance this month" href="/hr/attendance">
            <Lines empty="">
              {[
                <Line key="p" label="Present" value={month.present + month.overtime} tone="green" />,
                <Line key="i" label="Short days" value={month.incomplete} tone={month.incomplete ? "amber" : undefined} />,
                <Line key="m" label="Missed check-out" value={month.mispunch} tone={month.mispunch ? "red" : undefined} />,
                <Line key="a" label="Absent" value={month.absent} tone={month.absent ? "red" : undefined} />,
                <Line key="l" label="On leave" value={month.leave} />,
                <Line key="w" label="Hours worked" value={formatMinutes(month.worked)} />,
              ]}
            </Lines>
          </Panel>
        )}

        {emp && (
          <Panel title="My leave" href="/hr/leave" link="Apply or view">
            <Lines empty="No leave types set up yet.">
              {[
                ...balances.map((b) => (
                  <Line key={b.leaveTypeId} label={`${b.name}${b.pending ? ` · ${b.pending} waiting` : ""}`} value={b.remaining === null ? `${b.used} used` : `${b.remaining} of ${b.quota} left`} />
                )),
                ...pendingLeave.map((l) => <Line key={l.id} label={`${l.leaveType.name}, ${formatDate(l.startDate)}`} value="Waiting" tone="amber" />),
              ]}
            </Lines>
          </Panel>
        )}

        <Panel title="My tasks" href="/work" link="My work">
          <Lines empty="No open tasks. Nice.">
            {tasks.map((t) => (
              <Line
                key={t.id}
                label={`${t.title} · ${t.project.name}`}
                href={`/projects/${t.projectId}/tasks/${t.id}`}
                value={t.dueDate ? formatDate(t.dueDate) : "No date"}
                tone={t.dueDate && t.dueDate < today ? "red" : t.dueDate && t.dueDate <= today ? "amber" : undefined}
              />
            ))}
          </Lines>
        </Panel>

        <ChecklistsHomeCard user={user} />

        {sessions.length > 0 && (
          <Panel title="My school sessions this week" href="/operations/schedule">
            <Lines empty="">
              {sessions.map((s) => (
                <Line
                  key={s.id}
                  label={`${s.programme.organization.name}`}
                  href={`/operations/sessions/${s.id}`}
                  value={`${dateKey(s.date) === dateKey(today) ? "Today" : formatDate(s.date)} · ${timeRange(s.startTime, s.durationMins)}`}
                />
              ))}
            </Lines>
          </Panel>
        )}

        {emp && (
          <Panel title="My money" href="/payroll/my" link="Payslips">
            <Lines empty="">
              {[
                <Line key="ps" label={payslip ? `Latest payslip, ${payslip.run.month}` : "Latest payslip"} value={payslip ? formatINR(payslip.net) : "None yet"} href={payslip ? `/payroll/payslip/${payslip.id}` : undefined} />,
                <Line key="sub" label={`Expense claims waiting · ${submitted.count}`} value={formatINR(submitted.amount)} href="/expenses" tone={submitted.count ? "amber" : undefined} />,
                <Line key="ap" label={`Approved, to be paid · ${toBePaid.count}`} value={formatINR(toBePaid.amount)} href="/expenses" />,
              ]}
            </Lines>
          </Panel>
        )}

        <Panel title="My requests" href="/helpdesk">
          <Lines empty="">
            {[
              <Line key="hd" label="Helpdesk requests open" value={tickets} href="/helpdesk" />,
              <Line key="st" label="Kits and parts with me" value={itemsOut} href="/inventory/requests" tone={itemsOut ? "amber" : undefined} />,
              ...holidays.map((h) => <Line key={h.id} label={`Holiday: ${h.name}`} value={formatDate(h.date)} />),
            ]}
          </Lines>
        </Panel>

        {leads && (
          <Panel title="My team today" href={approvals && approvals.total > 0 ? "/approvals" : "/hr/attendance/register"}>
            <Lines empty="">
              {[
                <Line key="n" label="People reporting to me" value={team.length} href="/hr/employees" />,
                <Line key="l" label={`On leave today${teamOnLeave.length ? `: ${teamOnLeave.map((t) => fullName(t).split(" ")[0]).join(", ")}` : ""}`} value={teamOnLeave.length} />,
                ...(approvals
                  ? [
                      <Line key="lv" label="Leave to decide" value={approvals.leave.length} href="/hr/approvals" tone={approvals.leave.length ? "amber" : undefined} />,
                      <Line key="ts" label="Timesheets to approve" value={approvals.timesheets.length} href="/approvals" tone={approvals.timesheets.length ? "amber" : undefined} />,
                      <Line key="cl" label="Expense claims to approve" value={approvals.claims.length} href="/approvals" tone={approvals.claims.length ? "amber" : undefined} />,
                    ]
                  : []),
              ]}
            </Lines>
          </Panel>
        )}
      </div>

      <p className="mt-6 text-sm text-slate-500">
        Looking for today&apos;s notices and your full to-do list? <Link href="/" className="link">Go to Home</Link>.
      </p>
    </>
  );
}
