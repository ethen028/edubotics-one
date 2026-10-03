import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getAttendance, summarize } from "@/lib/attendance-data";
import { STATUS_COLOR, STATUS_LABEL, dateKey, formatMinutes, istDate, monthDays, parseMonth, formatTime } from "@/lib/attendance";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { checkIn, checkOut, requestCorrection } from "./actions";

export const metadata = { title: "My attendance" };

const time = formatTime;

export default async function MyAttendancePage({ searchParams }: PageProps<"/hr/attendance">) {
  const user = await requireUser();
  const employee = user.employee;
  if (!employee) {
    return (
      <>
        <PageHeader title="My attendance" />
        <Empty>Your login isn&apos;t linked to an employee record yet. Ask an admin to link it from Admin → Users.</Empty>
      </>
    );
  }
  const now = new Date();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const { year, month, label, prev, next } = parseMonth(sp.month, now);
  const days = monthDays(year, month);
  const today = istDate(now);

  const [{ days: grid, settings }, corrections] = await Promise.all([
    getAttendance([employee.id], days[0], days[days.length - 1], now),
    db.attendanceCorrection.findMany({ where: { employeeId: employee.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const mine = grid.get(employee.id)!;
  const todayDetail = (await getAttendance([employee.id], today, today, now)).days.get(employee.id)!.get(dateKey(today))!;
  const open = todayDetail.sessions.some((s) => !s.checkOut);
  const summary = summarize([...mine.values()], settings.workMinutesPerDay);
  const leadingBlanks = days[0].getUTCDay();

  return (
    <>
      <PageHeader
        title="My attendance"
        subtitle={`Daily target ${formatMinutes(settings.workMinutesPerDay)}. OD counts after ${formatMinutes(settings.workMinutesPerDay + settings.overtimeAfterMins)}.`}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card flex flex-col justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-slate-500">Today · {formatDate(today)}</div>
            <div className="mt-1 text-3xl font-semibold">{formatMinutes(todayDetail.worked)}</div>
            <div className="mt-1">
              <Badge color={STATUS_COLOR[todayDetail.status]}>{open ? "Checked in" : STATUS_LABEL[todayDetail.status]}</Badge>
            </div>
            {todayDetail.sessions.length > 0 && (
              <ul className="mt-3 space-y-0.5 text-sm text-slate-600">
                {todayDetail.sessions.map((s) => (
                  <li key={s.id}>
                    {time(s.checkIn)} → {s.checkOut ? time(s.checkOut) : "now"}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form action={open ? checkOut : checkIn}>
            <button className={open ? "btn-danger w-full py-3 text-base" : "btn-primary w-full py-3 text-base"}>
              {open ? "Check out" : "Check in"}
            </button>
          </form>
        </div>
        <div className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{label}</h2>
            <div className="flex gap-1">
              <Link href={`?month=${prev}`} className="btn-secondary btn-sm">
                ←
              </Link>
              <Link href={`?month=${next}`} className="btn-secondary btn-sm">
                →
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm sm:grid-cols-6">
            {(
              [
                ["Present", summary.present, "text-emerald-700"],
                ["ID", summary.incomplete, "text-amber-700"],
                ["OD", summary.overtime, "text-violet-700"],
                ["Mis-punch", summary.mispunch, "text-red-700"],
                ["Absent", summary.absent, "text-red-700"],
                ["Leave", summary.leave, "text-brand-700"],
              ] as const
            ).map(([k, v, c]) => (
              <div key={k} className="rounded-lg bg-slate-50 p-2">
                <div className={`text-xl font-semibold ${c}`}>{v}</div>
                <div className="text-xs text-slate-500">{k}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Worked {formatMinutes(summary.worked)} · short {formatMinutes(summary.shortfall)} · extra {formatMinutes(summary.extra)}
          </p>
        </div>
      </div>

      <div className="card mb-6">
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-1 font-semibold text-slate-500">
              {d}
            </div>
          ))}
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`b${i}`} />
          ))}
          {days.map((d) => {
            const r = mine.get(dateKey(d))!;
            const colors: Record<string, string> = {
              green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
              amber: "bg-amber-50 text-amber-800 ring-amber-200",
              purple: "bg-violet-50 text-violet-800 ring-violet-200",
              red: "bg-red-50 text-red-700 ring-red-200",
              blue: "bg-brand-50 text-brand-700 ring-brand-100",
              gray: "bg-white text-slate-400 ring-slate-100",
            };
            return (
              <div
                key={dateKey(d)}
                className={`min-h-16 rounded-md p-1.5 text-left ring-1 ${colors[STATUS_COLOR[r.status]]} ${dateKey(d) === dateKey(today) ? "outline-2 outline-brand-500" : ""}`}
              >
                <div className="font-semibold">{d.getUTCDate()}</div>
                {r.status !== "NOT_YET" && <div className="truncate">{STATUS_LABEL[r.status]}</div>}
                {r.worked > 0 && <div className="opacity-70">{formatMinutes(r.worked)}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Punches</th>
              <th>Worked</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {days
              .filter((d) => mine.get(dateKey(d))!.sessions.length > 0 || ["ABSENT", "LEAVE", "MISPUNCH"].includes(mine.get(dateKey(d))!.status))
              .reverse()
              .map((d) => {
                const r = mine.get(dateKey(d))!;
                const openPast = r.sessions.find((s) => !s.checkOut && dateKey(d) !== dateKey(today));
                const pending = openPast && corrections.find((c) => c.sessionId === openPast.id && c.status === "PENDING");
                const rejected = openPast && corrections.find((c) => c.sessionId === openPast.id && c.status === "REJECTED");
                return (
                  <tr key={dateKey(d)}>
                    <td className="whitespace-nowrap">{formatDate(d)}</td>
                    <td className="text-xs">
                      {r.sessions.map((s) => (
                        <div key={s.id}>
                          {time(s.checkIn)} → {s.checkOut ? time(s.checkOut) : <span className="text-red-600">no punch-out</span>}
                        </div>
                      ))}
                    </td>
                    <td>{r.worked ? formatMinutes(r.worked) : "—"}</td>
                    <td>
                      <Badge color={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      {r.marked && <span className="ml-1 text-xs text-slate-400">set by HR</span>}
                    </td>
                    <td>
                      {openPast &&
                        (pending ? (
                          <span className="text-xs text-slate-500">Correction requested, waiting for HR</span>
                        ) : (
                          <ActionForm action={requestCorrection.bind(null, openPast.id)} className="flex flex-wrap items-center gap-2">
                            <input name="time" type="time" required defaultValue="17:30" className="input w-auto py-1" />
                            <input name="reason" required placeholder="Forgot to punch out" className="input w-44 py-1" />
                            <SubmitButton className="btn-secondary btn-sm">Request fix</SubmitButton>
                            {rejected && <span className="text-xs text-red-600">Earlier request rejected</span>}
                          </ActionForm>
                        ))}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </>
  );
}
