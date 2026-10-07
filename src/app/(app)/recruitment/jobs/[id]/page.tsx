import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Badge, PageHeader } from "@/components/ui";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { PIPELINE_STAGES, canRecruit } from "@/lib/recruitment";
import { JobForm } from "../../forms";
import { setJobStatus, updateJob } from "../../actions";
import { JobStatusBadge, StageBadge } from "../../ui";

export default async function JobPage({ params }: PageProps<"/recruitment/jobs/[id]">) {
  const user = await requireUser();
  if (!canRecruit(user)) redirect("/?denied=1");
  const { id } = await params;
  const job = await db.jobOpening.findUnique({
    where: { id },
    include: {
      department: true,
      hiringManager: { select: { name: true } },
      candidates: {
        include: {
          interviews: { select: { status: true, rating: true, scheduledAt: true } },
          offers: { select: { status: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!job) notFound();
  const [departments, users] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true, role: { in: ["ADMIN", "MANAGER"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const closed = job.candidates.filter((c) => c.stage === "REJECTED" || c.stage === "WITHDRAWN");
  const hired = job.candidates.filter((c) => c.stage === "HIRED").length;

  return (
    <>
      <PageHeader
        title={job.title}
        subtitle={
          <>
            <JobStatusBadge status={job.status} /> {[job.department?.name, humanize(job.employmentType), job.location].filter(Boolean).join(" · ")} ·{" "}
            {hired} of {job.positions} hired
            {job.hiringManager && ` · hiring manager ${job.hiringManager.name}`}
          </>
        }
        actions={
          <>
            <Link href="/recruitment" className="btn-secondary">
              Recruitment
            </Link>
            <form action={setJobStatus.bind(null, job.id)} className="flex gap-1">
              <select name="status" defaultValue={job.status} className="input w-auto">
                <option value="OPEN">Open</option>
                <option value="ON_HOLD">On hold</option>
                <option value="FILLED">Filled</option>
                <option value="CLOSED">Closed</option>
              </select>
              <button className="btn-secondary">Set</button>
            </form>
            {job.status === "OPEN" && (
              <Link href={`/recruitment/candidates/new?job=${job.id}`} className="btn-primary">
                Add candidate
              </Link>
            )}
          </>
        }
      />

      <div className="mb-6 flex gap-3 overflow-x-auto pb-2">
        {PIPELINE_STAGES.map((stage) => {
          const col = job.candidates.filter((c) => c.stage === stage);
          return (
            <div key={stage} className="min-w-44 flex-1">
              <div className="mb-2 flex items-center justify-between px-1">
                <StageBadge stage={stage} />
                <span className="text-xs text-slate-500">{col.length}</span>
              </div>
              <div className="space-y-2">
                {col.map((c) => {
                  const done = c.interviews.filter((i) => i.rating);
                  const avg = done.length ? done.reduce((s, i) => s + (i.rating ?? 0), 0) / done.length : null;
                  const next = c.interviews.filter((i) => i.status === "SCHEDULED").sort((a, b) => +a.scheduledAt - +b.scheduledAt)[0];
                  const offer = c.offers.find((o) => o.status !== "WITHDRAWN");
                  return (
                    <Link key={c.id} href={`/recruitment/candidates/${c.id}`} className="card block p-3 text-sm hover:border-brand-500">
                      <div className="font-medium text-brand-700">{c.name}</div>
                      <div className="truncate text-xs text-slate-500">{c.currentRole ?? c.source}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        {avg !== null && <Badge color="amber">★ {avg.toFixed(1)}</Badge>}
                        {next && <span>Interview {formatDate(next.scheduledAt)}</span>}
                        {offer && stage === "OFFER" && <span>Offer {humanize(offer.status).toLowerCase()}</span>}
                        {c.expectedSalary && <span>expects {formatINR(c.expectedSalary)}</span>}
                      </div>
                    </Link>
                  );
                })}
                {col.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">Empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {closed.length > 0 && (
        <details className="card mb-6 text-sm">
          <summary className="cursor-pointer font-semibold">Not going ahead ({closed.length})</summary>
          <ul className="mt-3 divide-y divide-slate-100">
            {closed.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Link href={`/recruitment/candidates/${c.id}`} className="link">
                    {c.name}
                  </Link>
                  {c.closedReason && <span className="text-slate-500"> · {c.closedReason}</span>}
                </span>
                <StageBadge stage={c.stage} />
              </li>
            ))}
          </ul>
        </details>
      )}

      <h2 className="mb-3 text-lg font-semibold">Job details</h2>
      <div className="max-w-3xl">
        <JobForm action={updateJob.bind(null, job.id)} job={job} departments={departments} users={users} />
      </div>
    </>
  );
}
