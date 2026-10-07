import Link from "next/link";
import { redirect } from "next/navigation";
import type { CandidateStage } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { OPEN_STAGES, PIPELINE_STAGES, canRecruit } from "@/lib/recruitment";
import { daysFromNow } from "@/lib/time";
import { JobStatusBadge } from "./ui";

export const metadata = { title: "Recruitment" };

export default async function RecruitmentPage({ searchParams }: PageProps<"/recruitment">) {
  const user = await requireUser();
  if (!canRecruit(user)) redirect("/recruitment/interviews");
  const { all } = (await searchParams) as Record<string, string | undefined>;
  const showAll = all === "1";

  const [jobs, counts, upcoming, offersOut, awaitingFeedback] = await Promise.all([
    db.jobOpening.findMany({
      where: showAll ? {} : { status: { in: ["OPEN", "ON_HOLD"] } },
      include: { department: true, hiringManager: { select: { name: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    db.candidate.groupBy({ by: ["jobId", "stage"], _count: true }),
    db.interview.findMany({
      where: { status: "SCHEDULED", scheduledAt: { gte: daysFromNow(-1), lt: daysFromNow(7) } },
      include: { candidate: { select: { id: true, name: true, job: { select: { title: true } } } }, interviewer: { select: { name: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    db.offer.count({ where: { status: "SENT" } }),
    db.interview.count({ where: { status: "SCHEDULED", scheduledAt: { lt: new Date() } } }),
  ]);

  const count = (jobId: string, stage: CandidateStage) => counts.find((c) => c.jobId === jobId && c.stage === stage)?._count ?? 0;
  const activeCandidates = counts.filter((c) => OPEN_STAGES.includes(c.stage)).reduce((s, c) => s + c._count, 0);
  const openJobs = jobs.filter((j) => j.status === "OPEN").length;

  return (
    <>
      <PageHeader
        title="Recruitment"
        subtitle="Job openings, candidates, interviews and offers. A hired candidate moves into HR onboarding."
        actions={
          <>
            <Link href="/recruitment/candidates" className="btn-secondary">
              All candidates
            </Link>
            <Link href="/recruitment/interviews" className="btn-secondary">
              Interviews
            </Link>
            <Link href="/recruitment/jobs/new" className="btn-primary">
              New job opening
            </Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open jobs" value={openJobs} />
        <Stat label="Candidates in the running" value={activeCandidates} href="/recruitment/candidates" />
        <Stat
          label={`Interviews, next 7 days${awaitingFeedback ? ` · ${awaitingFeedback} need feedback` : ""}`}
          value={upcoming.length}
          href="/recruitment/interviews"
        />
        <Stat label="Offers waiting on a reply" value={offersOut} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="min-w-0 xl:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{showAll ? "All job openings" : "Open and on-hold jobs"}</h2>
            <Link href={showAll ? "?" : "?all=1"} className="link text-sm">
              {showAll ? "Hide filled and closed" : "Show filled and closed"}
            </Link>
          </div>
          {jobs.length === 0 ? (
            <Empty>No job openings yet. Open one to start adding candidates.</Empty>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="table">
                <thead>
                  <tr>
                    <th>Job</th>
                    {PIPELINE_STAGES.map((s) => (
                      <th key={s} className="text-center">
                        {humanize(s)}
                      </th>
                    ))}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td>
                        <Link href={`/recruitment/jobs/${j.id}`} className="link">
                          {j.title}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {[j.department?.name, j.location, `${count(j.id, "HIRED")} of ${j.positions} hired`].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      {PIPELINE_STAGES.map((s) => (
                        <td key={s} className="text-center tabular-nums">
                          {count(j.id, s) || <span className="text-slate-300">0</span>}
                        </td>
                      ))}
                      <td>
                        <JobStatusBadge status={j.status} />
                        <div className="mt-0.5 text-xs text-slate-500">since {formatDate(j.createdAt)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card h-fit">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Coming interviews</h2>
            <Link href="/recruitment/interviews" className="link text-sm">
              All
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">None booked for the next 7 days.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {upcoming.map((i) => (
                <li key={i.id} className="py-2">
                  <Link href={`/recruitment/candidates/${i.candidate.id}`} className="link">
                    {i.candidate.name}
                  </Link>
                  <span className="text-slate-500"> · {i.round}</span>
                  <div className="text-xs text-slate-500">
                    {formatDateTime(i.scheduledAt)} · {i.interviewer.name} · {i.candidate.job.title}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
