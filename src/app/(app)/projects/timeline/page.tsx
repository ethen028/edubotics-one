import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { todayIST } from "@/lib/time";
import { OPEN_PROJECT_STAGES, progress, projectScope, scopeLabel } from "@/lib/projects";
import { Timeline, toneOf } from "../timeline";

export const metadata = { title: "Project timeline" };

/** Task Flow v5's Timeline across projects: each open project from start to due date, with its milestones. */
export default async function ProjectTimelinePage() {
  const user = await requireUser();
  const today = todayIST();
  const projects = await db.project.findMany({
    where: { ...projectScope(user), stage: { in: [...OPEN_PROJECT_STAGES] } },
    include: {
      owner: { select: { name: true } },
      tasks: { select: { status: true, progress: true, blockedAt: true } },
      milestones: { where: { dueDate: { not: null } }, select: { id: true, title: true, dueDate: true, doneAt: true } },
    },
    orderBy: [{ startDate: { sort: "asc", nulls: "last" } }, { dueDate: { sort: "asc", nulls: "last" } }],
  });

  return (
    <>
      <PageHeader
        title="Timeline"
        subtitle={`Open projects · ${scopeLabel(user)}`}
        actions={
          <>
            <Link href="/projects" className="btn-secondary">
              Projects
            </Link>
            <Link href="/projects/pulse" className="btn-secondary">
              Daily pulse
            </Link>
          </>
        }
      />
      {projects.length === 0 ? (
        <Empty>No open projects.</Empty>
      ) : (
        <section className="card">
          <Timeline
            today={today}
            rows={projects.map((p) => ({
              id: p.id,
              label: p.name,
              sublabel: p.owner.name,
              href: `/projects/${p.id}`,
              start: p.startDate,
              end: p.dueDate,
              tone: toneOf(p.stage, p.dueDate, today, p.onHold || p.tasks.some((t) => t.blockedAt && t.status !== "DONE")),
              progress: progress(p.tasks),
            }))}
            markers={projects.flatMap((p) =>
              p.milestones.map((m) => ({ id: m.id, label: `${p.name}: ${m.title}`, date: m.dueDate!, done: !!m.doneAt })),
            )}
          />
        </section>
      )}
    </>
  );
}
