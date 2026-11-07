import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { formatDate, humanize } from "@/lib/format";
import { myWork } from "@/lib/my-work";
import { setTaskStatus } from "../projects/actions";
import { BlockedBadge, ChecklistCount, PriorityBadge, ProgressBar, WORK_STATUSES, WaitingBadge } from "../projects/ui";

export const metadata = { title: "My work" };

export default async function MyWorkPage() {
  const user = await requireUser();
  const { open, recentlyDone, groups } = await myWork(user);

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
                <h2
                  className={`mb-2 font-semibold ${g.title === "Overdue" ? "text-red-700" : g.title === "Update requested" ? "text-amber-700" : ""}`}
                >
                  {g.title} ({g.tasks.length})
                </h2>
                <ul className="divide-y divide-slate-100">
                  {g.tasks.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                      <div className="min-w-0 flex-1 basis-full sm:basis-0">
                        <Link href={`/projects/${t.project.id}/tasks/${t.id}`} className="font-medium hover:underline">
                          {t.title}
                        </Link>{" "}
                        {t.blockedAt && <BlockedBadge reason={t.blockedReason} />}{" "}
                        {t.dependsOn && t.dependsOn.status !== "DONE" && <WaitingBadge on={t.dependsOn.title} />}{" "}
                        <ChecklistCount done={t.checklist.filter((c) => c.doneAt).length} total={t.checklist.length} />
                        <div>
                          <Link href={`/projects/${t.project.id}`} className="text-xs text-slate-500 hover:underline">
                            {t.project.name}
                            {t.project.onHold && " (on hold)"}
                          </Link>
                        </div>
                      </div>
                      <div className="flex w-24 items-center gap-1.5" title={`${t.progress}% complete`}>
                        <ProgressBar value={t.progress} className="flex-1" />
                        <span className="w-8 text-right text-xs text-slate-500 tabular-nums">{t.progress}%</span>
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
                      <Link href={`/projects/${t.project.id}/tasks/${t.id}`} className="btn-primary btn-sm">
                        Post update
                      </Link>
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
