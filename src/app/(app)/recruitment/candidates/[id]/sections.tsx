import Link from "next/link";
import type { CandidateFile, Interview, Offer } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Options } from "@/components/ui";
import { formatDate, formatDateTime, formatINR, humanize } from "@/lib/format";
import { FILE_KINDS, INTERVIEW_MODES, INTERVIEW_ROUNDS } from "@/lib/recruitment";
import {
  createOffer,
  deleteCandidateFile,
  hireCandidate,
  moveCandidate,
  scheduleInterview,
  setInterviewStatus,
  setOfferStatus,
  submitFeedback,
  uploadCandidateFile,
} from "../../actions";
import { InterviewStatusBadge, OfferStatusBadge, RecommendationBadge, Stars } from "../../ui";
import { emailInterviewInvite } from "../../../emails/actions";
import { EmailComposer } from "@/components/email";
import type { MailSetup } from "@/lib/mail";

type Option = { id: string; name: string };

// ─── Interviews ────────────────────────────────────────────────────────────

type InterviewRow = Interview & {
  interviewer: { name: string };
  emails?: { id: string; status: "SENT" | "FAILED"; to: string; createdAt: Date; error: string | null }[];
};

/** Invite emails for each booked interview, worked out on the page. */
export type Invites = { setup: MailSetup; admin: boolean; drafts: Record<string, { to: string; cc: string; subject: string; message: string }> };

export function InterviewList({
  interviews,
  userId,
  recruiter,
  admin,
  invites,
}: {
  interviews: InterviewRow[];
  userId: string;
  recruiter: boolean;
  admin: boolean;
  invites?: Invites;
}) {
  if (interviews.length === 0) return <p className="text-sm text-slate-500">No interviews yet.</p>;
  return (
    <ul className="space-y-3">
      {interviews.map((i) => {
        const mine = i.interviewerId === userId;
        const canGiveFeedback = (mine || admin) && (i.status === "SCHEDULED" || i.status === "NO_SHOW");
        return (
          <li key={i.id} className="rounded-xl border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">{i.round}</div>
                <div className="text-xs text-slate-500">
                  {formatDateTime(i.scheduledAt)} · {i.mode}
                  {i.location && ` · ${i.location}`} · {mine ? "you" : i.interviewer.name}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <InterviewStatusBadge status={i.status} />
                {recruiter && i.status === "SCHEDULED" && (
                  <>
                    <form action={setInterviewStatus.bind(null, i.id)}>
                      <input type="hidden" name="status" value="NO_SHOW" />
                      <button className="btn-secondary btn-sm">No-show</button>
                    </form>
                    <form action={setInterviewStatus.bind(null, i.id)}>
                      <input type="hidden" name="status" value="CANCELLED" />
                      <button className="btn-secondary btn-sm">Cancel</button>
                    </form>
                  </>
                )}
              </div>
            </div>
            {recruiter &&
              i.emails?.map((e) => (
                <div key={e.id} className={`mt-1 text-xs ${e.status === "SENT" ? "text-emerald-700" : "text-red-700"}`}>
                  {e.status === "SENT" ? `Invite emailed to ${e.to}, ${formatDateTime(e.createdAt)}` : `Invite to ${e.to} failed: ${e.error}`}
                </div>
              ))}
            {invites && i.status === "SCHEDULED" && invites.drafts[i.id] && (
              <EmailComposer
                className="mt-2 border-t border-slate-100 pt-2 text-sm [&>summary]:text-sm [&>summary]:font-medium"
                title={i.emails?.some((e) => e.status === "SENT") ? "Email the invite again" : "Email the invite to the candidate"}
                action={emailInterviewInvite.bind(null, i.id)}
                draft={invites.drafts[i.id]}
                attachments={["interview.ics (calendar invite)"]}
                setup={invites.setup}
                admin={invites.admin}
                submitLabel="Send invite"
              />
            )}
            {i.status === "DONE" && i.rating && i.recommendation && (
              <div className="mt-2 rounded-lg bg-slate-50 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={i.rating} /> <RecommendationBadge value={i.recommendation} />
                  <span className="text-xs text-slate-500">{formatDateTime(i.feedbackAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line">{i.feedback}</p>
              </div>
            )}
            {canGiveFeedback && (
              <ActionForm action={submitFeedback.bind(null, i.id)} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                <div className="text-xs font-semibold text-slate-600 uppercase">{mine ? "Your feedback" : `Feedback for ${i.interviewer.name}`}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Rating">
                    <select name="rating" required defaultValue="" className="input">
                      <option value="" disabled>
                        Choose
                      </option>
                      <option value="5">5 · Excellent</option>
                      <option value="4">4 · Good</option>
                      <option value="3">3 · Average</option>
                      <option value="2">2 · Weak</option>
                      <option value="1">1 · Poor</option>
                    </select>
                  </Field>
                  <Field label="Recommendation">
                    <select name="recommendation" required defaultValue="" className="input">
                      <option value="" disabled>
                        Choose
                      </option>
                      <Options values={["STRONG_YES", "YES", "NO", "STRONG_NO"]} labels={humanize} />
                    </select>
                  </Field>
                </div>
                <Field label="How did it go?">
                  <textarea
                    name="feedback"
                    rows={3}
                    required
                    className="input"
                    placeholder="Strengths, gaps, how they handled the demo class…"
                  />
                </Field>
                <SubmitButton className="btn-primary btn-sm">Save feedback</SubmitButton>
              </ActionForm>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ScheduleInterviewForm({ candidateId, users, userId }: { candidateId: string; users: Option[]; userId: string }) {
  return (
    <details className="mt-4">
      <summary className="btn-secondary cursor-pointer list-none">Book an interview</summary>
      <ActionForm action={scheduleInterview.bind(null, candidateId)} className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Round">
          <select name="round" className="input">
            <Options values={INTERVIEW_ROUNDS} />
          </select>
        </Field>
        <Field label="Date and time (India)">
          <input name="scheduledAt" type="datetime-local" required className="input" />
        </Field>
        <Field label="Interviewer">
          <select name="interviewerId" defaultValue={userId} className="input">
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mode">
          <select name="mode" className="input">
            <Options values={INTERVIEW_MODES} />
          </select>
        </Field>
        <Field label="Where or meeting link" className="sm:col-span-2">
          <input name="location" className="input" placeholder="Edappally office, or a Google Meet link" />
        </Field>
        <div className="sm:col-span-2">
          <SubmitButton>Book interview</SubmitButton>
        </div>
      </ActionForm>
    </details>
  );
}

// ─── Stage ─────────────────────────────────────────────────────────────────

export function MoveStageForm({ candidateId, stage }: { candidateId: string; stage: string }) {
  const options = ["APPLIED", "SCREENING", "INTERVIEW", "REJECTED", "WITHDRAWN"];
  return (
    <ActionForm action={moveCandidate.bind(null, candidateId)} className="space-y-3">
      <Field label="Move to">
        <select name="stage" defaultValue={options.includes(stage) ? stage : ""} className="input">
          {!options.includes(stage) && <option value="">—</option>}
          <option value="APPLIED">Applied</option>
          <option value="SCREENING">Screening</option>
          <option value="INTERVIEW">Interview</option>
          <option value="REJECTED">Rejected (not a fit)</option>
          <option value="WITHDRAWN">Withdrawn (they pulled out)</option>
        </select>
      </Field>
      <Field label="Reason (needed for rejected or withdrawn)">
        <input name="reason" className="input" placeholder="e.g. No Malayalam, joined elsewhere" />
      </Field>
      <SubmitButton className="btn-secondary">Update stage</SubmitButton>
    </ActionForm>
  );
}

// ─── Files ─────────────────────────────────────────────────────────────────

export function FilesList({ files, canEdit }: { files: Omit<CandidateFile, "data">[]; canEdit: boolean }) {
  return (
    <>
      {files.length === 0 ? (
        <p className="text-sm text-slate-500">No resume uploaded.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <a href={`/api/recruitment/files/${f.id}`} target="_blank" className="link break-all">
                  {f.fileName}
                </a>
                <span className="text-xs text-slate-500">
                  {" "}
                  · {f.kind} · {Math.ceil(f.size / 1024)} KB
                </span>
              </span>
              {canEdit && (
                <form action={deleteCandidateFile.bind(null, f.id)}>
                  <button className="text-xs text-red-600 hover:underline">Remove</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function UploadFileForm({ candidateId }: { candidateId: string }) {
  return (
    <ActionForm action={uploadCandidateFile.bind(null, candidateId)} className="mt-3 flex flex-wrap items-end gap-2">
      <select name="kind" className="input w-auto">
        <Options values={FILE_KINDS} />
      </select>
      <input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" className="input min-w-0 flex-1" />
      <SubmitButton className="btn-secondary">Upload</SubmitButton>
    </ActionForm>
  );
}

// ─── Offers ────────────────────────────────────────────────────────────────

type OfferRow = Offer & { department: { name: string } | null; manager: { firstName: string; lastName: string } | null };

function OfferStatusButton({ offerId, status, label, danger }: { offerId: string; status: string; label: string; danger?: boolean }) {
  return (
    <form action={setOfferStatus.bind(null, offerId)}>
      <input type="hidden" name="status" value={status} />
      <button className={`${danger ? "btn-danger" : status === "ACCEPTED" || status === "SENT" ? "btn-primary" : "btn-secondary"} btn-sm`}>
        {label}
      </button>
    </form>
  );
}

export function OfferList({ offers, admin, hired }: { offers: OfferRow[]; admin: boolean; hired: boolean }) {
  return (
    <ul className="space-y-3">
      {offers.map((o) => {
        const monthly = Number(o.basic) + Number(o.hra) + Number(o.specialAllowance);
        return (
          <li key={o.id} className="rounded-xl border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">
                  {o.designation}
                  {o.department && <span className="text-slate-500"> · {o.department.name}</span>}
                </div>
                <div className="text-xs text-slate-500">
                  Joining {formatDate(o.joiningDate)}
                  {o.manager && ` · reports to ${o.manager.firstName} ${o.manager.lastName}`}
                  {o.respondBy && o.status === "SENT" && ` · reply by ${formatDate(o.respondBy)}`}
                </div>
              </div>
              <OfferStatusBadge status={o.status} />
            </div>
            {admin && (
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
                <span className="text-slate-500">Basic</span>
                <span>{formatINR(o.basic)}</span>
                <span className="text-slate-500">HRA</span>
                <span>{formatINR(o.hra)}</span>
                <span className="text-slate-500">Special allowance</span>
                <span>{formatINR(o.specialAllowance)}</span>
                <span className="font-medium text-slate-600">Monthly gross</span>
                <span className="font-semibold">{formatINR(monthly)}</span>
              </div>
            )}
            {admin && !hired && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Link href={`/recruitment/offers/${o.id}`} className="btn-secondary btn-sm">
                  Offer letter
                </Link>
                {o.status === "DRAFT" && <OfferStatusButton offerId={o.id} status="SENT" label="Mark sent" />}
                {o.status === "SENT" && (
                  <>
                    <OfferStatusButton offerId={o.id} status="ACCEPTED" label="Accepted" />
                    <OfferStatusButton offerId={o.id} status="DECLINED" label="Declined" />
                  </>
                )}
                {(o.status === "DRAFT" || o.status === "SENT" || o.status === "ACCEPTED") && (
                  <OfferStatusButton offerId={o.id} status="WITHDRAWN" label="Withdraw" danger />
                )}
              </div>
            )}
            {admin && hired && (
              <Link href={`/recruitment/offers/${o.id}`} className="link mt-2 inline-block text-xs">
                Offer letter
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function OfferForm({
  candidateId,
  defaults,
  departments,
  managers,
}: {
  candidateId: string;
  defaults: { designation: string; departmentId: string | null; employmentType: string; expectedSalary: number | null };
  departments: Option[];
  managers: { id: string; firstName: string; lastName: string }[];
}) {
  return (
    <details className="mt-3">
      <summary className="btn-primary cursor-pointer list-none">Make an offer</summary>
      <ActionForm action={createOffer.bind(null, candidateId)} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Designation *">
          <input name="designation" required defaultValue={defaults.designation} className="input" />
        </Field>
        <Field label="Department">
          <select name="departmentId" defaultValue={defaults.departmentId ?? ""} className="input">
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reports to">
          <select name="managerId" defaultValue="" className="input">
            <option value="">—</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.firstName} {m.lastName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Employment type">
          <select name="employmentType" defaultValue={defaults.employmentType} className="input">
            <Options values={["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]} labels={humanize} />
          </select>
        </Field>
        <Field label="Joining date *">
          <input name="joiningDate" type="date" required className="input" />
        </Field>
        <Field label="Reply by">
          <input name="respondBy" type="date" className="input" />
        </Field>
        <Field label="Basic (₹ a month) *">
          <input name="basic" type="number" min={1} step="1" required className="input" />
        </Field>
        <Field label="HRA (₹ a month)">
          <input name="hra" type="number" min={0} step="1" defaultValue={0} className="input" />
        </Field>
        <Field label="Special allowance (₹ a month)">
          <input name="specialAllowance" type="number" min={0} step="1" defaultValue={0} className="input" />
        </Field>
        <Field label="Probation (months)">
          <input name="probationMonths" type="number" min={0} max={24} defaultValue={6} className="input" />
        </Field>
        <Field label="Extra terms for the letter" className="sm:col-span-2">
          <input name="notes" className="input" placeholder="e.g. Travel to partner schools across Ernakulam district" />
        </Field>
        {defaults.expectedSalary !== null && (
          <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">
            They asked for {formatINR(defaults.expectedSalary)} a month.
          </p>
        )}
        <div className="sm:col-span-2 lg:col-span-3">
          <SubmitButton>Save offer as draft</SubmitButton>
        </div>
      </ActionForm>
    </details>
  );
}

// ─── Hire ──────────────────────────────────────────────────────────────────

export function HireForm({
  candidateId,
  name,
  suggestedCode,
  joiningDate,
}: {
  candidateId: string;
  name: string;
  suggestedCode: string;
  joiningDate: Date;
}) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return (
    <ActionForm action={hireCandidate.bind(null, candidateId)} className="space-y-4">
      <p className="text-sm text-slate-600">
        This adds them to People with status Onboarding and joining date {formatDate(joiningDate)}, gives them the standard joining checklist,
        sets their salary from the offer, and copies their resume into their documents.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Employee code *">
          <input name="code" required defaultValue={suggestedCode} className="input" />
        </Field>
        <Field label="First name *">
          <input name="firstName" required defaultValue={first} className="input" />
        </Field>
        <Field label="Last name *">
          <input name="lastName" required defaultValue={rest.join(" ")} className="input" />
        </Field>
        <Field label="Work email *">
          <input name="workEmail" type="email" required className="input" placeholder="name@eduboticsglobal.com" />
        </Field>
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="withLogin" defaultChecked /> Create a login for them
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Role">
            <select name="role" defaultValue="EMPLOYEE" className="input">
              <Options values={["EMPLOYEE", "MANAGER", "ADMIN"]} labels={humanize} />
            </select>
          </Field>
          <Field label="Temporary password (8+ characters)">
            <input name="password" type="text" minLength={8} className="input" autoComplete="off" />
          </Field>
        </div>
      </div>
      <SubmitButton>Move to HR onboarding</SubmitButton>
    </ActionForm>
  );
}
