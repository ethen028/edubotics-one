import Link from "next/link";
import type { DailyWorkStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate, toDateInput } from "@/lib/format";
import { parseDateOnly } from "@/lib/leave";
import { todayIST } from "@/lib/time";
import { mondayOf } from "@/lib/week";
import { DAILY_STATUS_LABEL } from "@/lib/daily-log";
import { DailyStatusBadge, EditedNote } from "../badge";

export const metadata = { title: "Team daily work" };

function dateParam(v: string | undefined, fallback: Date) {
  try {
    return v ? parseDateOnly(v) : fallback;
  } catch {
    return fallback;
  }
}

/** Task Flow's admin Worksheets tab: everyone's logged work, day by day. Admins see all, managers their reports. */
export default async function TeamDailyWorkPage({ searchParams }: PageProps<"/timesheets/team">) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const today = todayIST();
  const from = dateParam(sp.from, mondayOf(today));
  const to = dateParam(sp.to, today);
  const person = sp.person ?? "";
  const status = sp.status && sp.status in DAILY_STATUS_LABEL ? (sp.status as DailyWorkStatus) : undefined;

  const teamWhere: Prisma.EmployeeWhereInput = isAdmin(user) ? {} : { managerId: user.employee?.id ?? "__none__" };
  const [people, entries] = await Promise.all([
    db.employee.findMany({
      where: { ...teamWhere, status: { in: ["ACTIVE", "ONBOARDING", "ON_NOTICE"] } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.timeEntry.findMany({
      where: {
        date: { gte: from, lte: to },
        timesheet: { employee: teamWhere, ...(person ? { employeeId: person } : {}) },
        ...(status ? { workStatus: status } : {}),
      },
      include: {
        timesheet: { select: { status: true, employee: { select: { id: true, firstName: true, lastName: true } } } },
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: [{ date: "desc" }, { startTime: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 500,
    }),
  ]);

  const hours = entries.reduce((s, e) => s + Number(e.hours), 0);
  const blocked = entries.filter((e) => e.workStatus === "BLOCKED").length;
  const loggedToday = new Set(entries.filter((e) => e.date.getTime() === today.getTime()).map((e) => e.timesheet.employee.id)).size;

  // WorkPulse's admin Reports: one line per person for the same dates and filters.
  const byPerson = people
    .filter((p) => !person || p.id === person)
    .map((p) => {
      const mine = entries.filter((e) => e.timesheet.employee.id === p.id);
      return {
        ...p,
        entries: mine.length,
        hours: mine.reduce((s, e) => s + Number(e.hours), 0),
        days: new Set(mine.map((e) => e.date.getTime())).size,
        completed: mine.filter((e) => e.workStatus === "COMPLETED").length,
        blocked: mine.filter((e) => e.workStatus === "BLOCKED").length,
        last: mine[0]?.date ?? null,
      };
    })
    .sort((a, b) => b.hours - a.hours || a.firstName.localeCompare(b.firstName));

  return (
    <>
      <PageHeader
        title="Team daily work"
        subtitle={`${formatDate(from)} to ${formatDate(to)} · ${isAdmin(user) ? "everyone" : "people who report to you"}`}
        actions={
          <Link href="/timesheets" className="btn-secondary">
            My timesheet
          </Link>
        }
      />

      <form className="card mb-6 flex flex-wrap items-end gap-3">
        <label>
          <span className="label">From</span>
          <input type="date" name="from" defaultValue={toDateInput(from)} className="input" />
        </label>
        <label>
          <span className="label">To</span>
          <input type="date" name="to" defaultValue={toDateInput(to)} className="input" />
        </label>
        <label>
          <span className="label">Person</span>
          <select name="person" defaultValue={person} className="input">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Status</span>
          <select name="status" defaultValue={status ?? ""} className="input">
            <option value="">All statuses</option>
            {Object.entries(DAILY_STATUS_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-primary">Show</button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Entries" value={entries.length} />
        <Stat label="Hours" value={hours} />
        <Stat label="Blocked" value={blocked} />
        <Stat label={`Logged today (of ${people.length})`} value={loggedToday} />
      </div>

      {byPerson.length > 0 && (
        <section className="card mb-6 overflow-x-auto p-0">
          <h2 className="px-4 pt-4 pb-2 font-semibold">By person</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th className="text-right">Days logged</th>
                <th className="text-right">Entries</th>
                <th className="text-right">Hours</th>
                <th className="text-right">Completed</th>
                <th className="text-right">Blocked</th>
                <th>Last logged</th>
              </tr>
            </thead>
            <tbody>
              {byPerson.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">
                    <Link href={`?from=${toDateInput(from)}&to=${toDateInput(to)}&person=${p.id}${status ? `&status=${status}` : ""}`} className="link">
                      {p.firstName} {p.lastName}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums">{p.days}</td>
                  <td className="text-right tabular-nums">{p.entries}</td>
                  <td className="text-right font-semibold tabular-nums">{p.hours}</td>
                  <td className="text-right tabular-nums">{p.completed}</td>
                  <td className={`text-right tabular-nums ${p.blocked ? "font-semibold text-red-700" : ""}`}>{p.blocked}</td>
                  <td className={p.last ? "whitespace-nowrap" : "text-slate-400"}>{p.last ? formatDate(p.last) : "Nothing logged"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {entries.length === 0 ? (
        <Empty>No work logged for these dates.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Project</th>
                <th>Work</th>
                <th>Time</th>
                <th className="text-right">Hours</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="whitespace-nowrap font-medium">
                    {e.timesheet.employee.firstName} {e.timesheet.employee.lastName}
                  </td>
                  <td>
                    {e.project ? (
                      <Link href={e.task ? `/projects/${e.project.id}/tasks/${e.task.id}` : `/projects/${e.project.id}`} className="link">
                        {e.task?.title ?? e.project.name}
                      </Link>
                    ) : (
                      <span className="text-slate-500">Other work</span>
                    )}
                    {e.task && <div className="text-xs text-slate-500">{e.project?.name}</div>}
                  </td>
                  <td className="max-w-md">
                    {e.title && <div className="font-medium">{e.title}</div>}
                    {e.note && <div className="text-slate-600">{e.note}</div>}
                    {e.remarks && <div className="text-xs text-slate-400">Remarks: {e.remarks}</div>}
                    {e.editCount > 0 && <EditedNote count={e.editCount} at={e.editedAt} />}
                  </td>
                  <td className="whitespace-nowrap text-slate-600">{e.startTime && e.endTime ? `${e.startTime}–${e.endTime}` : "—"}</td>
                  <td className="text-right tabular-nums">{Number(e.hours)}</td>
                  <td>{e.workStatus ? <DailyStatusBadge status={e.workStatus} /> : <span className="text-slate-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
