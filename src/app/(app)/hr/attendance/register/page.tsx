import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getAttendance, summarize } from "@/lib/attendance-data";
import { managedEmployees } from "@/lib/team";
import { STATUS_COLOR, STATUS_LABEL, dateKey, formatMinutes, formatTime, istDate } from "@/lib/attendance";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime, toDateInput } from "@/lib/format";
import { parseDateOnly } from "@/lib/leave";
import { addSession, decideCorrection, markDay } from "../actions";

export const metadata = { title: "Attendance register" };

const MARKS = ["PRESENT", "INCOMPLETE", "OVERTIME", "ABSENT", "LEAVE", "MISPUNCH", "HOLIDAY", "WEEKLY_OFF"] as const;

export default async function RegisterPage({ searchParams }: PageProps<"/hr/attendance/register">) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const now = new Date();
  const today = istDate(now);
  let date = today;
  try {
    if (sp.date) date = parseDateOnly(sp.date);
  } catch {}
  const shift = (n: number) => toDateInput(new Date(date.getTime() + n * 86400000));

  const employees = await managedEmployees(user);
  const ids = employees.map((e) => e.id);
  const [{ days, settings }, corrections] = await Promise.all([
    getAttendance(ids, date, date, now),
    db.attendanceCorrection.findMany({
      where: { status: "PENDING", employeeId: { in: ids } },
      include: { employee: true, session: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const key = dateKey(date);
  const rows = employees.map((e) => ({ e, r: days.get(e.id)!.get(key)! }));
  const totals = summarize(
    rows.map((x) => x.r),
    settings.workMinutesPerDay,
  );
  const month = key.slice(0, 7);

  return (
    <>
      <PageHeader
        title="Attendance register"
        subtitle={user.role === "ADMIN" ? "All active employees" : "Your direct reports"}
        actions={
          <a href={`/hr/attendance/export?month=${month}`} className="btn-secondary">
            Download {month} (CSV)
          </a>
        }
      />

      {corrections.length > 0 && (
        <div className="card mb-6">
          <h2 className="mb-3 font-semibold">Missed punch-out requests</h2>
          <ul className="divide-y divide-slate-100">
            {corrections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <span className="font-medium">
                    {c.employee.firstName} {c.employee.lastName}
                  </span>{" "}
                  · {formatDate(c.session.workDate)} · in {formatTime(c.session.checkIn)}, asks out at{" "}
                  <b>{formatTime(c.requestedCheckOut)}</b>
                  <div className="text-slate-500">
                    “{c.reason}” · sent {formatDateTime(c.createdAt)}
                  </div>
                </div>
                {c.employeeId === user.employee?.id ? (
                  <span className="text-xs text-slate-500">Your own request goes to your manager or an admin</span>
                ) : (
                  <form action={decideCorrection.bind(null, c.id)} className="flex gap-2">
                    <button name="decision" value="APPROVED" className="btn-primary btn-sm">
                      Approve
                    </button>
                    <button name="decision" value="REJECTED" className="btn-secondary btn-sm">
                      Reject
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={`?date=${shift(-1)}`} className="btn-secondary btn-sm">
          ← Previous day
        </Link>
        <form className="flex items-center gap-2">
          <input type="date" name="date" defaultValue={key} className="input w-auto py-1" />
          <button className="btn-secondary btn-sm">Go</button>
        </form>
        <Link href={`?date=${shift(1)}`} className="btn-secondary btn-sm">
          Next day →
        </Link>
        {key !== dateKey(today) && (
          <Link href="?" className="link text-sm">
            Today
          </Link>
        )}
        <span className="ml-auto text-sm text-slate-600">
          {formatDate(date)} · Present {totals.present} · ID {totals.incomplete} · OD {totals.overtime} · Absent {totals.absent} · Leave{" "}
          {totals.leave} · Mis-punch {totals.mispunch}
        </span>
      </div>

      {rows.length === 0 ? (
        <Empty>No employees to show.</Empty>
      ) : (
        <div className="card mb-6 overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>First in</th>
                <th>Last out</th>
                <th>Worked</th>
                <th>Status</th>
                <th>Set status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, r }) => {
                const first = r.sessions[0];
                const last = r.sessions[r.sessions.length - 1];
                return (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/hr/employees/${e.id}`} className="link">
                        {e.firstName} {e.lastName}
                      </Link>
                      <div className="text-xs text-slate-500">{e.designation}</div>
                    </td>
                    <td>{first ? formatTime(first.checkIn) : "—"}</td>
                    <td>{last ? (last.checkOut ? formatTime(last.checkOut) : <span className="text-red-600">open</span>) : "—"}</td>
                    <td>{r.worked ? formatMinutes(r.worked) : "—"}</td>
                    <td>
                      <Badge color={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      {r.marked && <span className="ml-1 text-xs text-slate-400">set by HR</span>}
                    </td>
                    <td>
                      <form action={markDay} className="flex items-center gap-1">
                        <input type="hidden" name="employeeId" value={e.id} />
                        <input type="hidden" name="date" value={key} />
                        <select name="status" defaultValue={r.marked ? r.status : "AUTO"} className="input w-auto py-1 text-xs">
                          <option value="AUTO">Automatic</option>
                          {MARKS.map((m) => (
                            <option key={m} value={m}>
                              {STATUS_LABEL[m]}
                            </option>
                          ))}
                        </select>
                        <button className="btn-secondary btn-sm">Save</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card max-w-3xl">
          <h2 className="mb-3 font-semibold">Add a missed session</h2>
          <ActionForm action={addSession} className="grid gap-3 sm:grid-cols-5 sm:items-end">
            <Field label="Employee" className="sm:col-span-2">
              <select name="employeeId" required className="input">
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" name="date" defaultValue={key} required className="input" />
            </Field>
            <Field label="In">
              <input type="time" name="in" defaultValue="09:00" required className="input" />
            </Field>
            <Field label="Out">
              <input type="time" name="out" defaultValue="18:00" required className="input" />
            </Field>
            <div className="sm:col-span-5">
              <SubmitButton className="btn-primary">Add session</SubmitButton>
            </div>
          </ActionForm>
        </div>
      )}
    </>
  );
}
