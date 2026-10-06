import Link from "next/link";
import { db } from "@/lib/db";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { programmeProgress, sessionCounts, timeRange } from "@/lib/operations";
import { ProgressBar } from "../../projects/ui";
import { ProgrammeBadge } from "../ui";

export const metadata = { title: "School programmes" };

export default async function ProgrammesPage({ searchParams }: PageProps<"/operations/programmes">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const showDone = sp.done === "1";
  const today = todayIST();

  const programmes = await db.programme.findMany({
    where: showDone ? {} : { status: { not: "COMPLETED" } },
    include: {
      organization: { select: { id: true, name: true, city: true } },
      coordinator: { select: { name: true } },
      trainers: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      sessions: {
        where: { date: { gte: today }, status: "SCHEDULED" },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: 1,
      },
      _count: { select: { sessions: { where: { status: "SCHEDULED", date: { lt: today } } } } },
    },
    orderBy: { organization: { name: "asc" } },
  });
  const order = { RUNNING: 0, PLANNED: 1, PAUSED: 2, COMPLETED: 3 };
  programmes.sort((a, b) => order[a.status] - order[b.status]);
  const counts = await sessionCounts(programmes.map((p) => p.id));

  return (
    <>
      <PageHeader
        title="School programmes"
        subtitle="Each school's programme, its trainers and how far along it is"
        actions={
          <>
            <Link href={`?done=${showDone ? "0" : "1"}`} className="btn-secondary">
              {showDone ? "Hide completed" : "Show completed"}
            </Link>
            {isManagerOrAdmin(user) && (
              <Link href="/operations/programmes/new" className="btn-primary">
                New programme
              </Link>
            )}
          </>
        }
      />

      {programmes.length === 0 ? (
        <Empty>
          No school programmes yet.
          {isManagerOrAdmin(user) && " Add the schools you teach at, then their weekly timetable."}
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {programmes.map((p) => {
            const c = counts.get(p.id)!;
            const prog = programmeProgress(p, { completed: c.COMPLETED, total: c.total });
            const next = p.sessions[0];
            return (
              <Link key={p.id} href={`/operations/programmes/${p.id}`} className="card block transition hover:border-brand-400">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">{p.organization.name}</div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {p.name}
                      {p.grades && ` · ${p.grades}`}
                      {p.academicYear && ` · ${p.academicYear}`}
                    </div>
                  </div>
                  <ProgrammeBadge status={p.status} />
                </div>
                <div className="mt-3 flex justify-between text-xs text-slate-500">
                  <span>
                    {prog.completed} of {prog.planned} sessions held
                  </span>
                  <span className="font-semibold text-brand-700">{prog.pct}%</span>
                </div>
                <ProgressBar value={prog.pct} className="mt-1 mb-3" />
                <div className="space-y-1 text-xs text-slate-500">
                  <div className="truncate">
                    Trainers: {p.trainers.length ? p.trainers.map((t) => t.user.name).join(", ") : "none yet"}
                  </div>
                  <div className="truncate">
                    Next: {next ? `${formatDate(next.date)}, ${timeRange(next.startTime, next.durationMins)}` : "nothing scheduled"}
                  </div>
                </div>
                <div className="mt-3 flex justify-between gap-2 border-t border-slate-100 pt-2 text-xs">
                  <span className="text-slate-500">Coordinator {p.coordinator.name}</span>
                  {p._count.sessions > 0 && <span className="font-medium text-red-600">{p._count.sessions} log(s) due</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
