import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { canRecruit } from "@/lib/recruitment";
import { daysFromNow } from "@/lib/time";
import { InterviewStatusBadge, RecommendationBadge, Stars } from "../ui";

export const metadata = { title: "Interviews" };

export default async function InterviewsPage({ searchParams }: PageProps<"/recruitment/interviews">) {
  const user = await requireUser();
  const recruiter = canRecruit(user);
  const { everyone } = (await searchParams) as Record<string, string | undefined>;
  const all = recruiter && everyone === "1";
  const now = new Date();

  const scope = all ? {} : { interviewerId: user.id };
  const [open, recent] = await Promise.all([
    db.interview.findMany({
      where: { ...scope, status: "SCHEDULED" },
      include: {
        candidate: { select: { id: true, name: true, job: { select: { title: true } } } },
        interviewer: { select: { name: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    db.interview.findMany({
      where: { ...scope, status: { not: "SCHEDULED" }, scheduledAt: { gte: daysFromNow(-60) } },
      include: {
        candidate: { select: { id: true, name: true, job: { select: { title: true } } } },
        interviewer: { select: { name: true } },
      },
      orderBy: { scheduledAt: "desc" },
      take: 30,
    }),
  ]);
  const needFeedback = open.filter((i) => i.scheduledAt < now);
  const upcoming = open.filter((i) => i.scheduledAt >= now);

  const who = (name: string) => (all ? ` · ${name}` : "");

  return (
    <>
      <PageHeader
        title={all ? "All interviews" : "My interviews"}
        subtitle="Open a candidate to see their resume and give feedback after the interview."
        actions={
          recruiter && (
            <>
              <Link href={all ? "?" : "?everyone=1"} className="btn-secondary">
                {all ? "Only mine" : "Everyone's"}
              </Link>
              <Link href="/recruitment" className="btn-secondary">
                Recruitment
              </Link>
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Waiting for feedback</h2>
          {needFeedback.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing waiting.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {needFeedback.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/recruitment/candidates/${i.candidate.id}`} className="link">
                      {i.candidate.name}
                    </Link>
                    <span className="text-slate-500"> · {i.round}</span>
                    <div className="text-xs text-slate-500">
                      {i.candidate.job.title} · {formatDateTime(i.scheduledAt)}
                      {who(i.interviewer.name)}
                    </div>
                  </div>
                  <Link href={`/recruitment/candidates/${i.candidate.id}`} className="btn-primary btn-sm">
                    Give feedback
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Coming up</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-500">No interviews booked.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {upcoming.map((i) => (
                <li key={i.id} className="py-2">
                  <Link href={`/recruitment/candidates/${i.candidate.id}`} className="link">
                    {i.candidate.name}
                  </Link>
                  <span className="text-slate-500"> · {i.round}</span>
                  <div className="text-xs text-slate-500">
                    {formatDateTime(i.scheduledAt)} · {i.mode}
                    {i.location && ` · ${i.location}`} · {i.candidate.job.title}
                    {who(i.interviewer.name)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <h2 className="mt-8 mb-3 font-semibold">Last 60 days</h2>
      {recent.length === 0 ? (
        <Empty>No interviews yet.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Round</th>
                <th>When</th>
                {all && <th>Interviewer</th>}
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={`/recruitment/candidates/${i.candidate.id}`} className="link">
                      {i.candidate.name}
                    </Link>
                    <div className="text-xs text-slate-500">{i.candidate.job.title}</div>
                  </td>
                  <td>{i.round}</td>
                  <td className="text-xs">{formatDateTime(i.scheduledAt)}</td>
                  {all && <td>{i.interviewer.name}</td>}
                  <td>
                    {i.status === "DONE" && i.rating && i.recommendation ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Stars value={i.rating} /> <RecommendationBadge value={i.recommendation} />
                      </span>
                    ) : (
                      <InterviewStatusBadge status={i.status} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
