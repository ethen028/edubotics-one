import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Empty, Field, PageHeader } from "@/components/ui";
import { formatDate, toDateInput } from "@/lib/format";
import { parseDateOnly } from "@/lib/leave";
import { todayIST } from "@/lib/time";
import { addDays, mondayOf, weekDays } from "@/lib/week";
import { projectScope } from "@/lib/projects";
import { addEntry, deleteEntry, submitWeek } from "./actions";
import { TimesheetBadge } from "./badge";

export const metadata = { title: "Timesheet" };

const dayName = (d: Date) => d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", timeZone: "UTC" });

export default async function TimesheetPage({ searchParams }: PageProps<"/timesheets">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const today = todayIST();
  let weekStart = mondayOf(today);
  try {
    if (sp.week) weekStart = mondayOf(parseDateOnly(sp.week));
  } catch {}
  const days = weekDays(weekStart);

  if (!user.employee) {
    return (
      <>
        <PageHeader title="Timesheet" />
        <Empty>Timesheets need an employee record linked to your login. Ask an admin to link one under People.</Empty>
      </>
    );
  }

  const [sheet, projects, tasks, history] = await Promise.all([
    db.timesheet.findUnique({
      where: { employeeId_weekStart: { employeeId: user.employee.id, weekStart } },
      include: {
        entries: {
          include: { project: { select: { id: true, name: true } }, task: { select: { title: true } } },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        },
        decidedBy: { select: { name: true } },
      },
    }),
    db.project.findMany({
      where: { ...projectScope(user), stage: { not: "COMPLETE" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.projectTask.findMany({
      // Open tasks, plus ones finished in the last two weeks so their time can still be logged.
      where: { assigneeId: user.id, OR: [{ status: { not: "DONE" } }, { completedAt: { gte: addDays(today, -14) } }] },
      select: { id: true, title: true, project: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.timesheet.findMany({
      where: { employeeId: user.employee.id },
      include: { entries: { select: { hours: true } } },
      orderBy: { weekStart: "desc" },
      take: 8,
    }),
  ]);

  const entries = sheet?.entries ?? [];
  const locked = sheet?.status === "SUBMITTED" || sheet?.status === "APPROVED";
  const total = entries.reduce((s, e) => s + Number(e.hours), 0);
  const perDay = days.map((d) => entries.filter((e) => e.date.getTime() === d.getTime()).reduce((s, e) => s + Number(e.hours), 0));
  // One row per project (or "Other" for time with only a note).
  const rows = [...new Map(entries.map((e) => [e.project?.id ?? "", e.project?.name ?? "Other work"])).entries()];
  const defaultDate = today >= weekStart && today <= addDays(weekStart, 6) ? today : weekStart;

  return (
    <>
      <PageHeader
        title="Timesheet"
        subtitle={`Week of ${formatDate(weekStart)}`}
        actions={
          <>
            <Link href={`?week=${toDateInput(addDays(weekStart, -7))}`} className="btn-secondary">
              ← Previous
            </Link>
            <Link href="/timesheets" className="btn-secondary">
              This week
            </Link>
            <Link href={`?week=${toDateInput(addDays(weekStart, 7))}`} className="btn-secondary">
              Next →
            </Link>
          </>
        }
      />

      <div className="card mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-2xl font-semibold">{total}</span> <span className="text-slate-500">hours this week</span>{" "}
          {sheet && <TimesheetBadge status={sheet.status} />}
          {sheet?.status === "REJECTED" && sheet.decisionNote && (
            <div className="mt-1 text-red-700">
              {sheet.decidedBy?.name}: “{sheet.decisionNote}”
            </div>
          )}
          {sheet?.status === "APPROVED" && (
            <div className="mt-1 text-slate-500">
              Approved by {sheet.decidedBy?.name} on {formatDate(sheet.decidedAt)}
            </div>
          )}
        </div>
        {sheet && !locked && entries.length > 0 && (
          <form action={submitWeek.bind(null, sheet.id)}>
            <button className="btn-primary">Submit week for approval</button>
          </form>
        )}
      </div>

      <div className="card mb-6 overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Project</th>
              {days.map((d) => (
                <th key={d.toISOString()} className="text-right">
                  {dayName(d)}
                </th>
              ))}
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-slate-500">
                  No time logged this week.
                </td>
              </tr>
            )}
            {rows.map(([pid, name]) => {
              const mine = entries.filter((e) => (e.project?.id ?? "") === pid);
              return (
                <tr key={pid}>
                  <td className="font-medium">{name}</td>
                  {days.map((d) => {
                    const h = mine.filter((e) => e.date.getTime() === d.getTime()).reduce((s, e) => s + Number(e.hours), 0);
                    return (
                      <td key={d.toISOString()} className="text-right tabular-nums">
                        {h || ""}
                      </td>
                    );
                  })}
                  <td className="text-right font-semibold tabular-nums">{mine.reduce((s, e) => s + Number(e.hours), 0)}</td>
                </tr>
              );
            })}
            {rows.length > 0 && (
              <tr className="bg-brand-50/60">
                <td className="font-semibold">Total</td>
                {perDay.map((h, i) => (
                  <td key={i} className="text-right font-semibold tabular-nums">
                    {h || ""}
                  </td>
                ))}
                <td className="text-right font-semibold tabular-nums">{total}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold">Entries</h2>
          {entries.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <span className="font-medium">{dayName(e.date)}</span> · {Number(e.hours)} h ·{" "}
                    {e.project?.name ?? "Other work"}
                    {e.task && <span className="text-slate-500"> · {e.task.title}</span>}
                    {e.note && <div className="text-slate-500">{e.note}</div>}
                  </div>
                  {!locked && (
                    <form action={deleteEntry.bind(null, e.id)}>
                      <button className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          {!locked && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Log time</h2>
              <ActionForm action={addEntry} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Day">
                    <input
                      type="date"
                      name="date"
                      required
                      defaultValue={toDateInput(defaultDate)}
                      min={toDateInput(weekStart)}
                      max={toDateInput(addDays(weekStart, 6))}
                      className="input"
                    />
                  </Field>
                  <Field label="Hours">
                    <input type="number" name="hours" required min="0.25" max="16" step="0.25" className="input" />
                  </Field>
                </div>
                <Field label="Task">
                  <select name="taskId" defaultValue="" className="input">
                    <option value="">—</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.project.name})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Or project">
                  <select name="projectId" defaultValue="" className="input">
                    <option value="">—</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="What you did">
                  <input name="note" className="input" placeholder="Required if no project" />
                </Field>
                <SubmitButton>Add</SubmitButton>
              </ActionForm>
            </section>
          )}
          <section className="card">
            <h2 className="mb-2 font-semibold">Recent weeks</h2>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">None yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2">
                    <Link href={`?week=${toDateInput(h.weekStart)}`} className="link">
                      {formatDate(h.weekStart)}
                    </Link>
                    <span className="text-slate-500">{h.entries.reduce((s, e) => s + Number(e.hours), 0)} h</span>
                    <TimesheetBadge status={h.status} />
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
