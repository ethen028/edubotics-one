import Link from "next/link";
import { redirect } from "next/navigation";
import type { CandidateStage, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { OPEN_STAGES, canRecruit } from "@/lib/recruitment";
import { StageBadge } from "../ui";

export const metadata = { title: "Candidates" };

const STAGES: CandidateStage[] = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED", "WITHDRAWN"];

export default async function CandidatesPage({ searchParams }: PageProps<"/recruitment/candidates">) {
  const user = await requireUser();
  if (!canRecruit(user)) redirect("/recruitment/interviews");
  const { q = "", job = "", stage = "ACTIVE" } = (await searchParams) as Record<string, string | undefined>;

  const where: Prisma.CandidateWhereInput = {
    ...(stage === "ACTIVE" ? { stage: { in: OPEN_STAGES } } : STAGES.includes(stage as CandidateStage) ? { stage: stage as CandidateStage } : {}),
    ...(job ? { jobId: job } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { currentRole: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [candidates, jobs] = await Promise.all([
    db.candidate.findMany({
      where,
      include: { job: { select: { id: true, title: true } }, interviews: { select: { rating: true } } },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    db.jobOpening.findMany({ select: { id: true, title: true, status: true }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Candidates"
        subtitle={`${candidates.length} shown`}
        actions={
          <>
            <Link href="/recruitment" className="btn-secondary">
              Recruitment
            </Link>
            <Link href="/recruitment/candidates/new" className="btn-primary">
              Add candidate
            </Link>
          </>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, phone, email" className="input max-w-xs" />
        <select name="job" defaultValue={job} className="input w-auto">
          <option value="">All jobs</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
              {j.status !== "OPEN" ? ` (${humanize(j.status).toLowerCase()})` : ""}
            </option>
          ))}
        </select>
        <select name="stage" defaultValue={stage} className="input w-auto">
          <option value="ACTIVE">In the running</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
          <option value="ALL">All</option>
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      {candidates.length === 0 ? (
        <Empty>No candidates match.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Job</th>
                <th>Stage</th>
                <th>Rating</th>
                <th>Expects</th>
                <th>Source</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const rated = c.interviews.filter((i) => i.rating);
                const avg = rated.length ? rated.reduce((s, i) => s + (i.rating ?? 0), 0) / rated.length : null;
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/recruitment/candidates/${c.id}`} className="link">
                        {c.name}
                      </Link>
                      <div className="text-xs text-slate-500">{c.phone ?? c.email}</div>
                    </td>
                    <td>
                      <Link href={`/recruitment/jobs/${c.job.id}`} className="hover:underline">
                        {c.job.title}
                      </Link>
                    </td>
                    <td>
                      <StageBadge stage={c.stage} />
                    </td>
                    <td>{avg !== null ? `★ ${avg.toFixed(1)}` : "—"}</td>
                    <td>{c.expectedSalary ? formatINR(c.expectedSalary) : "—"}</td>
                    <td className="text-xs">
                      {c.source}
                      {c.referredBy && <div className="text-slate-500">by {c.referredBy}</div>}
                    </td>
                    <td className="text-xs text-slate-500">{formatDate(c.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
