import Link from "next/link";
import { db } from "@/lib/db";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { NavIcon } from "@/components/nav-icon";
import { formatDate, formatDateTime } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { OPEN_PROJECT_STAGES, kindLabel, progress, projectScope, scopeLabel } from "@/lib/projects";
import { BlockedBadge, ProgressBar, StageBadge, StatusRing, UpdateRequestedBadge, healthCounts, updateInclude } from "./ui";

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
          blockedAt: true,
          blockedReason: true,
          assignee: { select: { id: true, name: true } },
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
  const workload = new Map<string, { id: string; name: string; open: number; done: number }>();
  for (const task of activeTasks) {
    if (!task.assignee) continue;
    const member = workload.get(task.assignee.id) ?? { id: task.assignee.id, name: task.assignee.name, open: 0, done: 0 };
    if (task.status === "DONE") member.done++; else member.open++;
    workload.set(task.assignee.id, member);
  }
  const team = [...workload.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)).slice(0, 5);
  const nextMilestones = open.flatMap(project => project.milestones.map(milestone => ({ ...milestone, project })))
    .filter(milestone => milestone.dueDate).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime()).slice(0, 3);
  const attention = activeTasks
    .filter((t) => t.status !== "DONE" && ((t.dueDate && t.dueDate < today) || t.updateRequestedAt || t.blockedAt))
    .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))
    .slice(0, 6);
  const recent = await db.projectUpdate.findMany({
    where: { project: { ...projectScope(user), stage: { in: [...OPEN_PROJECT_STAGES] } } },
    include: { ...updateInclude, project: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <div className="project-dashboard">
      <PageHeader
        title="Projects"
        subtitle={scopeLabel(user)}
        actions={
          <>
            <Link href={`?done=${showDone ? "0" : "1"}`} className="btn-secondary">
              {showDone ? "Hide completed" : "Show completed"}
            </Link>
            <Link href="/projects/pulse" className="btn-secondary">
              Daily pulse
            </Link>
            <Link href="/projects/timeline" className="btn-secondary">
              Timeline
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

      <div className="project-metrics mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className="project-metric project-metric-primary"><div><span>Active projects</span><NavIcon name="work" /></div><strong>{open.length}</strong><p>In your project workspace</p></div>
        <div className={`project-metric ${late ? "metric-attention" : ""}`}><div><span>Projects past due</span><NavIcon name="calendar" /></div><strong>{late}</strong><p>{late ? "Review dates and next steps" : "No project deadlines missed"}</p></div>
        <Link className={`project-metric ${overdueTasks ? "metric-attention" : ""}`} href="/work"><div><span>Overdue tasks</span><NavIcon name="clock" /></div><strong>{overdueTasks}</strong><p>Open your work queue</p></Link>
        {isManagerOrAdmin(user) ? <Link className="project-metric" href="/approvals"><div><span>Awaiting approval</span><NavIcon name="check" /></div><strong>{awaiting}</strong><p>Review pending decisions</p></Link> : <div className="project-metric"><div><span>Awaiting approval</span><NavIcon name="check" /></div><strong>{awaiting}</strong><p>Projects in the approval stage</p></div>}
      </div>

      {activeTasks.length > 0 && (
        <div className="mb-6 grid gap-5 xl:grid-cols-2">
          <section className="card project-health-card">
            <div className="dashboard-section-heading"><div><h2>Delivery health</h2><p>Tasks across active projects</p></div><NavIcon name="chart" /></div>
            <StatusRing counts={counts} />
          </section>
          <section className="card">
            <h2 className="font-semibold">Needs attention</h2>
            <p className="mb-3 text-xs text-slate-500">Overdue, blocked or update requested</p>
            {attention.length === 0 ? (
              <div className="dashboard-clear-state"><NavIcon name="check" /><h3>No tasks need attention</h3><p>No overdue tasks or outstanding update requests.</p><Link href="/work" className="link">View my work</Link></div>
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
                      {t.blockedAt && <BlockedBadge reason={t.blockedReason} />}
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
          <section className="card">
            <div className="dashboard-section-heading"><div><h2>Team contribution</h2><p>Assigned tasks in your active projects</p></div><NavIcon name="crm" /></div>
            {team.length === 0 ? <p className="text-sm text-slate-500">Assign tasks to see the team workload here.</p> : <ul className="team-contributions">{team.map(member => <li key={member.id}><span className="member-initials" aria-hidden="true">{member.name.split(" ").map(part => part[0]).slice(0, 2).join("")}</span><span className="min-w-0 flex-1"><b className="block truncate">{member.name}</b><span className="text-xs text-slate-500">{member.done} completed</span></span><span className="workload-count">{member.open} open</span></li>)}</ul>}
          </section>
        </div>
      )}

      {nextMilestones.length > 0 && <section className="milestone-strip mb-6" aria-label="Upcoming milestones"><h2>Next milestones</h2><div>{nextMilestones.map(milestone => <Link key={milestone.id} href={`/projects/${milestone.project.id}`}><NavIcon name="calendar" /><span><b>{milestone.title}</b><small>{milestone.project.name} · {formatDate(milestone.dueDate!)}</small></span></Link>)}</div></section>}

      <div className="directory-heading"><h2>{showDone ? "All projects" : "Active projects"}</h2><span>{projects.length} {projects.length === 1 ? "project" : "projects"} in this view</span></div>

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
              <Link key={p.id} href={`/projects/${p.id}`} className="card project-card block transition hover:border-brand-400">
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
    </div>
  );
}
