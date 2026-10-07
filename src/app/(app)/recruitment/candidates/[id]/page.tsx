import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { mailSetup } from "@/lib/mail";
import { interviewEmail, interviewTime } from "@/lib/email-templates";
import { formatDate, formatINR } from "@/lib/format";
import { OPEN_STAGES, candidateAccess, canOffer } from "@/lib/recruitment";
import { CandidateForm } from "../../forms";
import { deleteCandidate, updateCandidate } from "../../actions";
import { StageBadge } from "../../ui";
import {
  FilesList,
  HireForm,
  InterviewList,
  MoveStageForm,
  OfferForm,
  OfferList,
  ScheduleInterviewForm,
  UploadFileForm,
} from "./sections";

export default async function CandidatePage({ params }: PageProps<"/recruitment/candidates/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const access = await candidateAccess(user, id);
  if (!access) notFound();
  const recruiter = access === "full";
  const admin = canOffer(user);

  const candidate = await db.candidate.findUnique({
    where: { id },
    include: {
      job: true,
      employee: { select: { id: true, firstName: true, lastName: true, status: true } },
      files: { omit: { data: true }, orderBy: { createdAt: "desc" } },
      interviews: {
        // Interviewers see only their own rounds, so earlier feedback doesn't sway them.
        where: recruiter ? {} : { interviewerId: user.id },
        include: {
          interviewer: { select: { name: true, email: true } },
          emails: { select: { id: true, status: true, to: true, createdAt: true, error: true }, orderBy: { createdAt: "asc" } },
        },
        orderBy: { scheduledAt: "asc" },
      },
      offers: {
        include: { department: { select: { name: true } }, manager: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!candidate) notFound();

  const inRunning = OPEN_STAGES.includes(candidate.stage);
  const liveOffer = candidate.offers.find((o) => ["DRAFT", "SENT", "ACCEPTED"].includes(o.status));
  const accepted = candidate.offers.find((o) => o.status === "ACCEPTED");

  const [users, jobs, departments, managers, employeeCount, earlier] = await Promise.all([
    recruiter ? db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    recruiter ? db.jobOpening.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } }) : [],
    admin ? db.department.findMany({ orderBy: { name: "asc" } }) : [],
    admin
      ? db.employee.findMany({
          where: { status: { not: "EXITED" } },
          select: { id: true, firstName: true, lastName: true },
          orderBy: { firstName: "asc" },
        })
      : [],
    admin && accepted ? db.employee.count() : 0,
    // Same person applying again, for another job or an earlier opening.
    recruiter && (candidate.email || candidate.phone)
      ? db.candidate.findMany({
          where: {
            id: { not: candidate.id },
            OR: [...(candidate.email ? [{ email: candidate.email }] : []), ...(candidate.phone ? [{ phone: candidate.phone }] : [])],
          },
          select: { id: true, stage: true, createdAt: true, job: { select: { title: true } } },
        })
      : [],
  ]);

  const settings = recruiter ? await getSettings() : null;
  const invites = settings
    ? {
        setup: mailSetup(settings),
        admin,
        drafts: Object.fromEntries(
          candidate.interviews
            .filter((i) => i.status === "SCHEDULED")
            .map((i) => [
              i.id,
              {
                to: candidate.email ?? "",
                cc: i.interviewer.email,
                ...interviewEmail(
                  {
                    round: i.round,
                    when: interviewTime(i.scheduledAt),
                    mode: i.mode,
                    location: i.location,
                    interviewer: i.interviewer.name,
                    jobTitle: candidate.job.title,
                  },
                  candidate.name,
                  user.name,
                  settings,
                ),
              },
            ]),
        ),
      }
    : undefined;

  return (
    <>
      <PageHeader
        title={candidate.name}
        subtitle={
          <>
            <StageBadge stage={candidate.stage} /> for{" "}
            {recruiter ? (
              <Link href={`/recruitment/jobs/${candidate.job.id}`} className="link">
                {candidate.job.title}
              </Link>
            ) : (
              candidate.job.title
            )}
            {candidate.closedReason && ` · ${candidate.closedReason}`}
          </>
        }
        actions={
          <>
            <Link href={recruiter ? `/recruitment/jobs/${candidate.job.id}` : "/recruitment/interviews"} className="btn-secondary">
              Back
            </Link>
            {admin && !candidate.employeeId && (
              <form action={deleteCandidate.bind(null, candidate.id)}>
                <button className="btn-danger">Delete</button>
              </form>
            )}
          </>
        }
      />

      {candidate.employee && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Hired and moved into HR as{" "}
          <Link href={`/hr/employees/${candidate.employee.id}`} className="link">
            {candidate.employee.firstName} {candidate.employee.lastName}
          </Link>
          .
        </div>
      )}
      {earlier.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Also applied:{" "}
          {earlier.map((e, i) => (
            <span key={e.id}>
              {i > 0 && ", "}
              <Link href={`/recruitment/candidates/${e.id}`} className="link">
                {e.job.title}
              </Link>{" "}
              ({formatDate(e.createdAt)}, {e.stage.toLowerCase()})
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="min-w-0 space-y-6 xl:col-span-3">
          <section className="card">
            <h2 className="mb-3 font-semibold">{recruiter ? "Interviews" : "Your interview"}</h2>
            <InterviewList interviews={candidate.interviews} userId={user.id} recruiter={recruiter} admin={admin} invites={invites} />
            {recruiter && inRunning && candidate.stage !== "OFFER" && (
              <ScheduleInterviewForm candidateId={candidate.id} users={users} userId={user.id} />
            )}
          </section>

          {recruiter && (candidate.offers.length > 0 || (admin && inRunning)) && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Offer</h2>
              {candidate.offers.length > 0 && <OfferList offers={candidate.offers} admin={admin} hired={!!candidate.employeeId} />}
              {!admin && candidate.offers.length > 0 && <p className="mt-2 text-xs text-slate-500">Salary details are visible to admins only.</p>}
              {admin && inRunning && !liveOffer && (
                <OfferForm
                  candidateId={candidate.id}
                  defaults={{
                    designation: candidate.job.title,
                    departmentId: candidate.job.departmentId,
                    employmentType: candidate.job.employmentType,
                    expectedSalary: candidate.expectedSalary ? Number(candidate.expectedSalary) : null,
                  }}
                  departments={departments}
                  managers={managers}
                />
              )}
            </section>
          )}

          {admin && accepted && !candidate.employeeId && (
            <section className="card border-brand-300">
              <h2 className="mb-3 font-semibold">Move into HR onboarding</h2>
              <HireForm
                candidateId={candidate.id}
                name={candidate.name}
                joiningDate={accepted.joiningDate}
                suggestedCode={`EBG-${String(employeeCount + 1).padStart(3, "0")}`}
              />
            </section>
          )}
        </div>

        <div className="min-w-0 space-y-6 xl:col-span-2">
          <section className="card text-sm">
            <h2 className="mb-3 font-semibold">Details</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-slate-500">Phone</dt>
              <dd>{candidate.phone ? <a href={`tel:${candidate.phone}`} className="link">{candidate.phone}</a> : "—"}</dd>
              <dt className="text-slate-500">Email</dt>
              <dd className="break-all">{candidate.email ? <a href={`mailto:${candidate.email}`} className="link">{candidate.email}</a> : "—"}</dd>
              <dt className="text-slate-500">City</dt>
              <dd>{candidate.city ?? "—"}</dd>
              <dt className="text-slate-500">Now</dt>
              <dd>{candidate.currentRole ?? "—"}</dd>
              <dt className="text-slate-500">Experience</dt>
              <dd>{candidate.experienceYears !== null
                  ? `${candidate.experienceYears} ${Number(candidate.experienceYears) === 1 ? "year" : "years"}`
                  : "—"}</dd>
              {recruiter && (
                <>
                  <dt className="text-slate-500">Expects</dt>
                  <dd>{candidate.expectedSalary ? `${formatINR(candidate.expectedSalary)} a month` : "—"}</dd>
                  <dt className="text-slate-500">Notice</dt>
                  <dd>{candidate.noticePeriod ?? "—"}</dd>
                  <dt className="text-slate-500">Source</dt>
                  <dd>
                    {candidate.source}
                    {candidate.referredBy && `, referred by ${candidate.referredBy}`}
                  </dd>
                </>
              )}
              <dt className="text-slate-500">{candidate.appliedOnlineAt ? "Applied" : "Added"}</dt>
              <dd>
                {formatDate(candidate.appliedOnlineAt ?? candidate.createdAt)}
                {candidate.appliedOnlineAt && ", online on the careers page"}
              </dd>
            </dl>
            {candidate.notes && <p className="mt-3 rounded-lg bg-slate-50 p-2.5 whitespace-pre-line">{candidate.notes}</p>}
          </section>

          <section className="card">
            <h2 className="mb-3 font-semibold">Resume and files</h2>
            <FilesList files={candidate.files} canEdit={recruiter} />
            {recruiter && <UploadFileForm candidateId={candidate.id} />}
          </section>

          {recruiter && !candidate.employeeId && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Stage</h2>
              <MoveStageForm candidateId={candidate.id} stage={candidate.stage} />
            </section>
          )}
        </div>
      </div>

      {recruiter && (
        <details className="mt-6">
          <summary className="mb-3 cursor-pointer text-lg font-semibold">Edit candidate</summary>
          <CandidateForm action={updateCandidate.bind(null, candidate.id)} candidate={candidate} jobs={jobs} />
        </details>
      )}
    </>
  );
}
