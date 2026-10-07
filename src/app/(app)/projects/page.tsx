import Link from "next/link";
import { db } from "@/lib/db";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { OPEN_PROJECT_STAGES, kindLabel, progress, projectScope, scopeLabel } from "@/lib/projects";
import { ProgressBar, StageBadge, StatusRing, UpdateRequestedBadge, healthCounts, updateInclude } from "./ui";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const showDone = sp.done === "1";
  const today = todayIST();

  const projects = await db.project.findMany({
    where: { ...projectScope(user), ...(showDone ? {} : { stage: { in: [...OPEN_PROJECT_STAGES] } }) },
    include: {
      owner: { select: { name: true } },
      organization: { select: { id: true, name: true } },
      tasks: {
        select: {
          id: true,
          title: true,
          status: true,
          progress: true,
          dueDate: true,
          updateRequestedAt: true,
          assignee: { select: { name: true } },
        },
      },
      milestones: { where: { doneAt: null }, orderBy: { dueDate: { sort: "asc", nulls: "last" } }, take: 1 },
      _count: { select: { members: true } },
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });

  const open = projects.filter((p) => p.stage !== "COMPLETE");
  const overdueTasks = open.reduce(
    (n, p) => n + p.tasks.filter((t) => t.status !== "DONE" && t.dueDate && t.dueDate < today).length,
    0,
  );
  const late = open.filter((p) => p.dueDate && p.dueDate < today).length;
  const awaiting = open.filter((p) => p.stage === "APPROVAL").length;

  // Task Flow's overview: tasks by status, what needs attention, and the latest reports.
  const activeTasks = open.flatMap((p) => p.tasks.map((t) => ({ ...t, project: { id: p.id, name: p.name } })));
  const counts = healthCounts(activeTasks, today);
  const attention = activeTasks
    .filter((t) => t.status !== "DONE" && ((t.dueDate && t.dueDate < today) || t.updateRequestedAt))
    .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))
    .slice(0, 6);
  const recent = await db.projectUpdate.findMany({
    where: { project: { ...projectScope(user), stage: { in: [...OPEN_PROJECT_STAGES] } } },
    include: { ...updateInclude, project: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={scopeLabel(user)}
        actions={
          <>
            <Link href={`?done=${showDone ? "0" : "1"}`} className="btn-secondary">
              {showDone ? "Hide completed" : "Show completed"}
            </Link>
            {isManagerOrAdmin(user) && (
              <Link href="/projects/people" className="btn-secondary">
                Team workload
              </Link>
            )}
            {isManagerOrAdmin(user) && (
              <Link href="/projects/new" className="btn-primary">
                New project
              </Link>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active projects" value={open.length} />
        <Stat label="Past due date" value={late} />
        <Stat label="Overdue tasks" value={overdueTasks} href="/work" />
        <Stat label="Waiting for approval" value={awaiting} href={isManagerOrAdmin(user) ? "/approvals" : undefined} />
      </div>

      {activeTasks.length > 0 && (
        <div className="mb-6 grid gap-6 lg:grid-cols-3">
          <section className="card">
            <h2 className="mb-4 font-semibold">Project status overview</h2>
            <StatusRing counts={counts} />
          </section>
          <section className="card">
            <h2 className="font-semibold">Needs attention</h2>
            <p className="mb-3 text-xs text-slate-500">Overdue or update requested</p>
            {attention.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing overdue. 🎉</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {attention.map((t) => (
                  <li key={t.id} className="py-2">
                    <Link href={`/projects/${t.project.id}/tasks/${t.id}`} className="font-medium hover:underline">
                      {t.title}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span>{t.assignee?.name ?? "Unassigned"}</span>
                      <span>· {t.project.name}</span>
                      {t.dueDate && t.dueDate < today && <span className="font-medium text-red-600">· due {formatDate(t.dueDate)}</span>}
                      {t.updateRequestedAt && <UpdateRequestedBadge />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2 className="mb-3 font-semibold">Recent activity</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-slate-500">No updates yet. Reports from task pages show up here.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {recent.map((u) => (
                  <li key={u.id} className="py-2">
                    <b>{u.author.name}</b> {u.isRequest ? "asked for an update on" : "posted an update on"}{" "}
                    <Link
                      href={u.task ? `/projects/${u.project.id}/tasks/${u.task.id}` : `/projects/${u.project.id}`}
                      className="link"
                    >
                      {u.task?.title ?? u.project.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {u.progressTo !== null && `${u.progressFrom ?? 0}% → ${u.progressTo}% · `}
                      {formatDateTime(u.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {projects.length === 0 ? (
        <Empty>
          {isManagerOrAdmin(user)
            ? "No projects yet. Start one here, or from a won deal in the CRM."
            : "You aren't on any projects yet."}
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const pct = progress(p.tasks);
            const next = p.milestones[0];
            const isLate = p.stage !== "COMPLETE" && p.dueDate && p.dueDate < today;
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="card block transition hover:border-brand-400">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">{p.name}</div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {kindLabel[p.kind]}
                      {p.organization && ` · ${p.organization.name}`}
                    </div>
                  </div>
                  <span className="text-lg font-semibold text-brand-700">{pct}%</span>
                </div>
                <ProgressBar value={pct} className="my-3" />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <StageBadge stage={p.stage} onHold={p.onHold} />
                  <span className={isLate ? "font-medium text-red-600" : "text-slate-500"}>
                    {p.dueDate ? `Due ${formatDate(p.dueDate)}` : "No due date"}
                  </span>
                </div>
                <div className="mt-3 flex justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  <span className="truncate">{next ? `Next: ${next.title}` : "No open milestones"}</span>
                  <span className="shrink-0">
                    {p.owner.name} · {p._count.members} on team
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
