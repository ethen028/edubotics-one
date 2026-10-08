import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { formatDate, toDateInput } from "@/lib/format";
import { parseDateOnly } from "@/lib/leave";
import { todayIST } from "@/lib/time";
import { addDays, mondayOf, weekDays } from "@/lib/week";
import { dateKey } from "@/lib/attendance";
import { findClashes, timeRange, trainerLeaveDays } from "@/lib/operations";

export const metadata = { title: "Session schedule" };

const chipColor = {
  SCHEDULED: "border-brand-200 bg-white",
  COMPLETED: "border-emerald-200 bg-emerald-50",
  CANCELLED: "border-slate-200 bg-slate-50 text-slate-400 line-through",
  MISSED: "border-red-200 bg-red-50",
} as const;

export default async function SchedulePage({ searchParams }: PageProps<"/operations/schedule">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const today = todayIST();
  let weekStart = mondayOf(today);
  try {
    if (sp.week) weekStart = mondayOf(parseDateOnly(sp.week));
  } catch {}
  const weekEnd = addDays(weekStart, 6);
  const trainer = sp.trainer === "me" ? user.id : sp.trainer || undefined;
  const school = sp.school || undefined;

  const [sessions, holidays, trainers, schools, onLeave] = await Promise.all([
    db.programmeSession.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
      include: {
        programme: { select: { id: true, organizationId: true, organization: { select: { name: true } } } },
        trainer: { select: { name: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.holiday.findMany({ where: { date: { gte: weekStart, lte: weekEnd } } }),
    db.user.findMany({
      where: { programmeTrainers: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.organization.findMany({
      where: { programmes: { some: { status: { not: "COMPLETED" } } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    trainerLeaveDays(weekStart, weekEnd),
  ]);
  // Clashes are checked across all sessions, before filtering, so a filtered view still shows them.
  const clashes = findClashes(sessions);
  const shown = sessions.filter((s) => (!trainer || s.trainerId === trainer) && (!school || s.programme.organizationId === school));
  const holidayOn = new Map(holidays.map((h) => [dateKey(h.date), h.name]));
  // Saturday classes are common; show Sunday only when something is on it.
  const days = weekDays(weekStart).filter((d) => d.getUTCDay() !== 0 || shown.some((s) => s.date.getTime() === d.getTime()));
  const query = (week: Date) => {
    const q = new URLSearchParams({ week: toDateInput(week) });
    if (sp.trainer) q.set("trainer", sp.trainer);
    if (school) q.set("school", school);
    return `?${q}`;
  };

  return (
    <>
      <PageHeader
        title="Session schedule"
        subtitle={`Week of ${formatDate(weekStart)} · ${shown.filter((s) => s.status !== "CANCELLED").length} sessions`}
        actions={
          <>
            <Link href={query(addDays(weekStart, -7))} className="btn-secondary">
              ← Previous
            </Link>
            <Link href={query(mondayOf(today))} className="btn-secondary">
              This week
            </Link>
            <Link href={query(addDays(weekStart, 7))} className="btn-secondary">
              Next →
            </Link>
          </>
        }
      />

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="week" value={toDateInput(weekStart)} />
        <select name="trainer" defaultValue={sp.trainer ?? ""} className="input w-auto">
          <option value="">All trainers</option>
          <option value="me">Only me</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select name="school" defaultValue={school ?? ""} className="input w-auto">
          <option value="">All schools</option>
          {schools.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {days.map((d) => {
          const daySessions = shown.filter((s) => s.date.getTime() === d.getTime());
          const holiday = holidayOn.get(dateKey(d));
          const isToday = d.getTime() === today.getTime();
          return (
            <section key={d.toISOString()} className={`card min-w-0 p-3 ${isToday ? "ring-2 ring-brand-500" : ""} ${daySessions.length || holiday || isToday ? "" : "hidden md:block"}`}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">
                  {d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                </h2>
                <span className="text-xs text-slate-400">{daySessions.length || ""}</span>
              </div>
              {holiday && <div className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">Holiday: {holiday}</div>}
              {daySessions.length === 0 ? (
                <p className="text-xs text-slate-400">—</p>
              ) : (
                <ul className="space-y-2">
                  {daySessions.map((s) => {
                    const clash = clashes.has(s.id);
                    const leave = s.trainerId && onLeave.has(`${s.trainerId}|${dateKey(s.date)}`);
                    return (
                      <li key={s.id}>
                        <Link
                          href={`/operations/sessions/${s.id}`}
                          className={`block rounded-lg border p-2 text-xs hover:border-brand-500 ${chipColor[s.status]} ${
                            clash ? "ring-2 ring-red-400" : ""
                          }`}
                        >
                          <div className="font-medium text-slate-500">{timeRange(s.startTime, s.durationMins)}</div>
                          <div className="font-semibold text-slate-900">{s.programme.organization.name}</div>
                          {s.classGroup && <div>{s.classGroup}</div>}
                          <div className={s.trainer ? "text-slate-600" : "font-medium text-amber-700"}>{s.trainer?.name ?? "No trainer"}</div>
                          {clash && <div className="mt-1 font-medium text-red-600">Double-booked</div>}
                          {leave && <div className="mt-1 font-medium text-amber-700">Trainer on leave</div>}
                          {s.status === "SCHEDULED" && s.date < today && <div className="mt-1 font-medium text-red-600">Log due</div>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        White: scheduled · Green: held · Red: missed · Struck through: cancelled. A red outline means the trainer has two classes at once.
      </p>
    </>
  );
}
