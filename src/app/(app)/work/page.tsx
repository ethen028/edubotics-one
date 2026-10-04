import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { formatDate, humanize } from "@/lib/format";
import { daysFromNow, todayIST } from "@/lib/time";
import { setTaskStatus } from "../projects/actions";
import { PriorityBadge, WORK_STATUSES } from "../projects/ui";

export const metadata = { title: "My work" };

const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

export default async function MyWorkPage() {
  const user = await requireUser();
  const today = todayIST();
  const weekAhead = new Date(today.getTime() + 7 * 86400000);

  const [open, recentlyDone] = await Promise.all([
    db.projectTask.findMany({
      where: { assigneeId: user.id, status: { not: "DONE" }, project: { stage: { not: "COMPLETE" } } },
      include: { project: { select: { id: true, name: true, onHold: true } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    db.projectTask.findMany({
      where: { assigneeId: user.id, status: "DONE", completedAt: { gte: daysFromNow(-7) } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { completedAt: "desc" },
    }),
  ]);
  open.sort((a, b) => {
    const da = a.dueDate?.getTime() ?? Infinity;
    const dbb = b.dueDate?.getTime() ?? Infinity;
    return da - dbb || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });

  const groups = [
    { title: "Overdue", tasks: open.filter((t) => t.dueDate && t.dueDate < today) },
    { title: "Due today", tasks: open.filter((t) => t.dueDate && t.dueDate.getTime() === today.getTime()) },
    { title: "This week", tasks: open.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= weekAhead) },
    { title: "Later or no date", tasks: open.filter((t) => !t.dueDate || t.dueDate > weekAhead) },
  ];

  return (
    <>
      <PageHeader
        title="My work"
        subtitle={`${open.length} open task(s) across your projects`}
        actions={
          <Link href="/timesheets" className="btn-secondary">
            Log time
          </Link>
        }
      />
      {open.length === 0 ? (
        <Empty>Nothing assigned to you right now.</Empty>
      ) : (
        <div className="space-y-6">
          {groups
            .filter((g) => g.tasks.length > 0)
            .map((g) => (
              <section key={g.title} className="card">
                <h2 className={`mb-2 font-semibold ${g.title === "Overdue" ? "text-red-700" : ""}`}>
                  {g.title} ({g.tasks.length})
                </h2>
                <ul className="divide-y divide-slate-100">
                  {g.tasks.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{t.title}</div>
                        <Link href={`/projects/${t.project.id}`} className="text-xs text-slate-500 hover:underline">
                          {t.project.name}
                          {t.project.onHold && " (on hold)"}
                        </Link>
                      </div>
                      <PriorityBadge priority={t.priority} />
                      <span className="text-xs text-slate-500">{t.dueDate ? formatDate(t.dueDate) : ""}</span>
                      <form action={setTaskStatus.bind(null, t.id)} className="flex gap-1">
                        <select name="status" defaultValue={t.status} className="input w-auto py-1 text-xs">
                          {WORK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s === "TODO" ? "To do" : humanize(s)}
                            </option>
                          ))}
                        </select>
                        <button className="btn-secondary btn-sm">Set</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}

      {recentlyDone.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">Done in the last 7 days</h2>
          <ul className="space-y-1 text-sm text-slate-600">
            {recentlyDone.map((t) => (
              <li key={t.id}>
                ✓ {t.title} <span className="text-slate-400">· {t.project.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
