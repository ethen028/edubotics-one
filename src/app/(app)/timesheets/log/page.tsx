import Link from "next/link";
import type { DailyWorkStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate, toDateInput } from "@/lib/format";
import { parseDateOnly } from "@/lib/leave";
import { todayIST } from "@/lib/time";
import { DAILY_STATUS_LABEL } from "@/lib/daily-log";
import { DailyStatusBadge, EditedNote } from "../badge";

export const metadata = { title: "My work log" };

function dateParam(v: string | undefined, fallback: Date) {
  try {
    return v ? parseDateOnly(v) : fallback;
  } catch {
    return fallback;
  }
}

/** WorkPulse's employee Reports page: everything you logged over a stretch of days, with totals. */
export default async function MyWorkLogPage({ searchParams }: PageProps<"/timesheets/log">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const today = todayIST();
  const from = dateParam(sp.from, new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const to = dateParam(sp.to, today);
  const status = sp.status && sp.status in DAILY_STATUS_LABEL ? (sp.status as DailyWorkStatus) : undefined;

  if (!user.employee) {
    return (
      <>
        <PageHeader title="My work log" />
        <Empty>Timesheets need an employee record linked to your login. Ask an admin to link one under People.</Empty>
      </>
    );
  }

  const entries = await db.timeEntry.findMany({
    where: {
      date: { gte: from, lte: to },
      timesheet: { employeeId: user.employee.id },
      ...(status ? { workStatus: status } : {}),
    },
    include: {
      timesheet: { select: { status: true, weekStart: true } },
      project: { select: { id: true, name: true } },
      task: { select: { id: true, title: true } },
    },
    orderBy: [{ date: "desc" }, { startTime: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 500,
  });

  const hours = entries.reduce((s, e) => s + Number(e.hours), 0);
  const completed = entries.filter((e) => e.workStatus === "COMPLETED").length;
  const days = new Set(entries.map((e) => e.date.getTime())).size;

  return (
    <>
      <PageHeader
        title="My work log"
        subtitle={`${formatDate(from)} to ${formatDate(to)}`}
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
        <Stat label="Hours" value={hours} />
        <Stat label="Entries" value={entries.length} />
        <Stat label="Completed" value={completed} />
        <Stat label="Days worked" value={days} />
      </div>

      {entries.length === 0 ? (
        <Empty>Nothing logged for these dates.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Work</th>
                <th>Time</th>
                <th className="text-right">Hours</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const open = e.timesheet.status === "DRAFT" || e.timesheet.status === "REJECTED";
                return (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{formatDate(e.date)}</td>
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
                    <td className="text-right">
                      {open ? (
                        <Link href={`/timesheets?week=${toDateInput(e.timesheet.weekStart)}&edit=${e.id}`} className="text-xs text-slate-500 hover:text-brand-700">
                          Edit
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">{e.timesheet.status === "APPROVED" ? "Approved" : "Submitted"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
