import Link from "next/link";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { Badge, PageHeader, Stat } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { PULSE_RANGES, dailyPulse, pulseRangeLabel, readRange } from "@/lib/pulse";
import { TimesheetBadge } from "../../timesheets/badge";
import { BlockedBadge, ProgressBar, TaskStatusBadge } from "../ui";

export const metadata = { title: "Daily pulse" };

const hours = (h: number) => `${Math.round(h * 10) / 10} h`;

function Panel({ title, hint, count, children }: { title: string; hint: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>
        {count !== undefined && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function Clear({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">✓ {children}</p>;
}

/** Task Flow v5's Daily Pulse: what needs a decision today, for the projects and people this user can see. */
export default async function PulsePage({ searchParams }: PageProps<"/projects/pulse">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const range = readRange(sp.range);
  const p = await dailyPulse(user, range);
  const manager = isManagerOrAdmin(user);
  const maxDay = Math.max(1, ...p.trend.map((d) => d.approved + d.other));

  return (
    <>
      <PageHeader
        title={p.mineOnly ? "Your day, planned" : "Daily pulse"}
        subtitle={`${formatDate(p.today)} · ${p.mineOnly ? "Your tasks and logged work" : user.role === "ADMIN" ? "Company-wide" : "Your projects and your team"}`}
        actions={
          <>
            <Link href="/projects" className="btn-secondary">
              Projects
            </Link>
            <a href={`/projects/pulse/export?range=${range}`} className="btn-secondary">
              Export CSV
            </a>
            <Link href={manager ? "/approvals" : "/timesheets"} className="btn-primary">
              {manager ? "Review approvals" : "Log today's work"}
            </Link>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Period">
        {(Object.keys(PULSE_RANGES) as (keyof typeof PULSE_RANGES)[]).map((r) => (
          <Link
            key={r}
            href={`?range=${r}`}
            className={`rounded-full px-3 py-1 text-sm ${r === range ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-brand-400"}`}
            aria-current={r === range ? "true" : undefined}
          >
            {pulseRangeLabel[r]}
          </Link>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {p.mineOnly ? (
          <>
            <Stat label="My open tasks" value={p.rows.reduce((n, r) => n + r.openTasks, 0)} href="/work" />
            <Stat label="Logged in period" value={hours(p.logged)} href="/timesheets/log" />
            <Stat label="Waiting for approval" value={hours(p.waiting)} href="/timesheets" />
            <Stat label="Weeks sent back" value={p.sentBack} href="/timesheets" />
          </>
        ) : (
          <>
            <Stat label="Active projects" value={p.rows.length} href="/projects" />
            <Stat label="Need attention" value={p.attention.length} />
            <Stat label="Hours waiting for approval" value={hours(p.waiting)} href={manager ? "/approvals" : undefined} />
            <Stat label="Approved hours" value={hours(p.approved)} />
          </>
        )}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel
          title={p.mineOnly ? "What needs your attention" : "Delivery attention"}
          hint="Overdue, due soon and under 75%, blocked, waiting for review or update asked for"
          count={p.attention.length}
        >
          {p.attention.length === 0 ? (
            <Clear>No project matches the risk rules.</Clear>
          ) : (
            <ul className="divide-y divide-slate-100">
              {p.attention.slice(0, 8).map((r) => (
                <li key={r.project.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/projects/${r.project.id}`} className="min-w-0 truncate font-medium hover:underline">
                      {r.project.name}
                    </Link>
                    <span className="flex w-28 shrink-0 items-center gap-1.5">
                      <ProgressBar value={r.progress} className="flex-1" />
                      <span className="w-8 text-right text-xs text-slate-500 tabular-nums">{r.progress}%</span>
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span>
                      {r.project.owner.name} · {r.project.dueDate ? `due ${formatDate(r.project.dueDate)}` : "no due date"}
                    </span>
                    {r.reasons.map((reason) => (
                      <Badge key={reason} color={/overdue|blocked/i.test(reason) ? "red" : "amber"}>
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Next deadlines" hint={`Projects due by ${formatDate(p.deadline)}`} count={p.deadlines.length}>
          {p.deadlines.length === 0 ? (
            <Clear>No project deadlines in this period.</Clear>
          ) : (
            <ul className="divide-y divide-slate-100">
              {p.deadlines.slice(0, 8).map((r) => (
                <li key={r.project.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/projects/${r.project.id}`} className="block truncate font-medium hover:underline">
                      {r.project.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      Due {formatDate(r.project.dueDate)} · {r.openTasks} open task(s)
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-brand-700 tabular-nums">{r.progress}%</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel
          title={p.mineOnly ? "Your task queue" : "Task queue"}
          hint={`Blocked, waiting for review or due by ${formatDate(p.deadline)}`}
          count={p.queue.length}
        >
          {p.queue.length === 0 ? (
            <Clear>Nothing blocked, in review or due soon.</Clear>
          ) : (
            <ul className="divide-y divide-slate-100">
              {p.queue.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/projects/${t.project.id}/tasks/${t.id}`} className="block truncate font-medium hover:underline">
                      {t.title}
                    </Link>
                    <div className="truncate text-xs text-slate-500">
                      {t.project.name}
                      {!p.mineOnly && ` · ${t.assignee?.name ?? "Unassigned"}`}
                      {t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""}
                      {t.blockedReason && ` · ${t.blockedReason}`}
                    </div>
                  </div>
                  {t.blockedAt ? <BlockedBadge reason={t.blockedReason} /> : <TaskStatusBadge status={t.status} dueDate={t.dueDate} today={p.today} />}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Work logged" hint={p.mineOnly ? "Your daily log and where each week stands" : "Daily log entries and their timesheet"} count={p.entries.length}>
          {p.entries.length === 0 ? (
            <Clear>No work logged in this period.</Clear>
          ) : (
            <ul className="divide-y divide-slate-100">
              {p.entries.slice(0, 8).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {p.mineOnly ? e.title || e.note || "Work" : `${e.timesheet.employee.firstName} ${e.timesheet.employee.lastName}`}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {e.task?.title ?? e.project?.name ?? "General work"} · {formatDate(e.date)}
                      {e.startTime && e.endTime && ` · ${e.startTime}–${e.endTime}`}
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    <b className="tabular-nums">{hours(Number(e.hours))}</b>
                    <TimesheetBadge status={e.timesheet.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <section className="card mb-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Hours by day</h2>
            <p className="text-xs text-slate-500">Dark bars are approved timesheets; light bars are logged but not yet approved</p>
          </div>
          <strong className="text-brand-700">{hours(p.approved)} approved in period</strong>
        </div>
        <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Hours logged by day">
          {p.trend.map((d) => {
            const total = d.approved + d.other;
            return (
              <div key={d.date.getTime()} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${formatDate(d.date)}: ${hours(d.approved)} approved, ${hours(d.other)} not yet`}>
                <span className="text-[10px] text-slate-500 tabular-nums">{total ? hours(total) : ""}</span>
                <div className="flex w-full max-w-10 flex-col justify-end overflow-hidden rounded-t-md" style={{ height: `${Math.max((total / maxDay) * 100, 2)}%` }}>
                  {d.other > 0 && <div className="bg-brand-200" style={{ height: `${(d.other / (total || 1)) * 100}%` }} />}
                  <div className={total ? "bg-brand-600" : "bg-slate-200"} style={{ height: total ? `${(d.approved / total) * 100}%` : "100%" }} />
                </div>
                <span className="text-[10px] text-slate-400">
                  {d.date.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-xs text-slate-500">
        <b>How signals are picked:</b> a project past its due date, due within 3 days and under 75% done, a task marked blocked
        or past its due date, a task waiting for review, or an update asked for. These are fixed rules, not predictions.
        {p.mineOnly ? " You see your own tasks and work." : " You see what your access allows."}
      </p>
    </>
  );
}
