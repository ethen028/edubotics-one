import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { reviewFor, reviewStatus, scoreOf } from "@/lib/reviews";
import { PrintButton } from "../../../payroll/payslip/[id]/print-button";
import {
  acknowledgeReview,
  agreeGoals,
  copyLastGoals,
  reopenGoals,
  reopenManagerReview,
  saveGoals,
  saveManagerReview,
  saveSelfReview,
} from "../actions";
import { Paragraph, RatingBadge, RatingPicker, RatingScale } from "../ui";

export const metadata = { title: "Performance review" };

export default async function ReviewPage({ params }: PageProps<"/hr/reviews/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const access = await reviewFor(user, id);
  if (!access) notFound();
  const { review, isSelf, reviewer } = access;
  const { cycle, goals, employee } = review;
  const admin = isAdmin(user);
  const name = `${employee.firstName} ${employee.lastName}`.trim();
  const status = reviewStatus(review, cycle.stage);
  const closed = cycle.stage === "CLOSED";
  const agreed = !!review.goalsAgreedAt;
  const selfIn = !!review.selfSubmittedAt;
  const shared = !!review.managerSubmittedAt;

  const canEditGoals = !agreed && !closed && (isSelf || reviewer);
  const canEditSelf = isSelf && cycle.stage === "REVIEW" && agreed && !selfIn && !shared;
  const canEditManager = reviewer && cycle.stage === "REVIEW" && agreed && !shared;
  const showSelf = isSelf || selfIn;
  const showManager = shared || reviewer;
  const weighted = goals.length > 0 && goals.every((g) => g.weight != null);
  const selfScore = scoreOf(goals, "self");
  const managerScore = scoreOf(goals, "manager");
  const hasEarlier =
    canEditGoals && goals.length === 0
      ? (await db.performanceReview.count({ where: { employeeId: employee.id, id: { not: review.id }, goals: { some: {} } } })) > 0
      : false;

  return (
    <>
      <PageHeader
        title={isSelf ? `Your ${cycle.name}` : `${name}: ${cycle.name}`}
        subtitle={
          <>
            {employee.designation}
            {employee.department && ` · ${employee.department.name}`} · {formatDate(cycle.periodStart)} – {formatDate(cycle.periodEnd)} ·
            reviewer {review.reviewer?.name ?? "an admin"} <Badge color={status.color}>{status.label}</Badge>
          </>
        }
        actions={
          <div className="flex gap-2 print:hidden">
            <PrintButton />
            <Link href={admin ? `/hr/reviews/cycles/${cycle.id}` : "/hr/reviews"} className="btn-secondary">
              Back
            </Link>
          </div>
        }
      />

      {!isSelf && !reviewer && (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 print:hidden">
          You can read this because {employee.firstName} reports to you. {review.reviewer?.name ?? "An admin"} is the reviewer.
        </p>
      )}

      {/* ── Goals ─────────────────────────────────────────── */}
      <section className="card mb-6 text-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            Goals {weighted ? "(weighted)" : goals.length > 1 ? "(equal weight)" : ""}
          </h2>
          {agreed ? (
            <span className="text-xs text-slate-500">Agreed {formatDateTime(review.goalsAgreedAt)}</span>
          ) : (
            <Badge color="amber">Not agreed yet</Badge>
          )}
        </div>

        {canEditGoals ? (
          <>
            <p className="mb-3 text-slate-600">
              {isSelf
                ? "Write what you plan to achieve in this period and how it will be measured. Your reviewer then agrees them."
                : `Write ${employee.firstName}'s goals with them, then agree them.`}{" "}
              Weights are optional: leave them all empty to weigh goals equally, or give each one so they add up to 100.
              {cycle.goalsDue && ` Agree by ${formatDate(cycle.goalsDue)}.`}
            </p>
            {hasEarlier && (
              <form action={copyLastGoals.bind(null, review.id)} className="mb-3">
                <button className="btn-secondary btn-sm">Start from last review&apos;s goals</button>
              </form>
            )}
            <ActionForm action={saveGoals.bind(null, review.id)} className="space-y-3">
              {[...goals.map((g) => ({ key: g.id, g })), ...[0, 1, 2].map((n) => ({ key: `new${n}`, g: null }))].map(({ key, g }, i) => (
                <div key={key} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_6rem]">
                  <Field label={g ? `Goal ${i + 1}` : "New goal"}>
                    <input name={`title_${key}`} defaultValue={g?.title} placeholder={g ? "" : "e.g. Run 40 school sessions a month"} className="input" />
                  </Field>
                  <Field label="How it's measured">
                    <input name={`measure_${key}`} defaultValue={g?.measure ?? ""} placeholder={g ? "" : "e.g. Session log, 95% held"} className="input" />
                  </Field>
                  <Field label="Weight %">
                    <input name={`weight_${key}`} type="number" min={1} max={100} defaultValue={g?.weight ?? ""} className="input" />
                  </Field>
                  {g && (
                    <label className="flex items-center gap-2 text-xs text-red-700 sm:col-span-3">
                      <input type="checkbox" name={`remove_${key}`} /> Remove this goal
                    </label>
                  )}
                </div>
              ))}
              <SubmitButton className="btn-secondary">Save goals</SubmitButton>
            </ActionForm>
            {reviewer && goals.length > 0 && (
              <ActionForm action={agreeGoals.bind(null, review.id)} className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-2 text-slate-600">Save any changes first. Once agreed, the goals are locked for the period.</p>
                <SubmitButton>Agree these goals</SubmitButton>
              </ActionForm>
            )}
          </>
        ) : goals.length === 0 ? (
          <p className="text-slate-500">No goals written yet.</p>
        ) : (
          <>
            <ol className="divide-y divide-slate-100">
              {goals.map((g, i) => (
                <li key={g.id} className="flex gap-3 py-2">
                  <span className="text-slate-400">{i + 1}.</span>
                  <div className="flex-1">
                    <div className="font-medium">{g.title}</div>
                    {g.measure && <div className="text-xs text-slate-500">Measured by: {g.measure}</div>}
                  </div>
                  {g.weight != null && <span className="text-xs whitespace-nowrap text-slate-500">{g.weight}%</span>}
                </li>
              ))}
            </ol>
            {reviewer && agreed && !selfIn && !shared && !closed && (
              <form action={reopenGoals.bind(null, review.id)} className="mt-3 print:hidden">
                <button className="btn-secondary btn-sm">Change goals</button>
              </form>
            )}
          </>
        )}
      </section>

      {/* ── Self review ───────────────────────────────────── */}
      {showSelf && (
        <section className="card mb-6 text-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{isSelf ? "Your self review" : `${employee.firstName}'s self review`}</h2>
            {selfIn ? (
              <span className="text-xs text-slate-500">
                Sent {formatDateTime(review.selfSubmittedAt)}
                {selfScore != null && ` · score ${selfScore}`}
              </span>
            ) : (
              canEditSelf && cycle.selfDue && <span className="text-xs text-slate-500">Due {formatDate(cycle.selfDue)}</span>
            )}
          </div>
          {canEditSelf ? (
            <ActionForm action={saveSelfReview.bind(null, review.id)} className="space-y-4">
              <RatingScale />
              {goals.map((g, i) => (
                <div key={g.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-2 font-medium">
                    {i + 1}. {g.title}
                  </div>
                  <RatingPicker name={`rating_${g.id}`} value={g.selfRating} />
                  <textarea
                    name={`comment_${g.id}`}
                    defaultValue={g.selfComment ?? ""}
                    rows={2}
                    placeholder="What you did towards this goal"
                    className="input mt-2"
                  />
                </div>
              ))}
              <Field label="What went well this period">
                <textarea name="selfAchievements" defaultValue={review.selfAchievements ?? ""} rows={3} className="input" />
              </Field>
              <Field label="What you want to improve, and support you need">
                <textarea name="selfImprove" defaultValue={review.selfImprove ?? ""} rows={3} className="input" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button type="submit" name="intent" value="draft" className="btn-secondary">
                  Save draft
                </button>
                <button type="submit" name="intent" value="submit" className="btn-primary">
                  Send to reviewer
                </button>
              </div>
            </ActionForm>
          ) : selfIn || (isSelf && review.selfAchievements) ? (
            <SelfView review={review} goals={goals} />
          ) : (
            <p className="text-slate-500">
              {closed
                ? "No self review was sent."
                : shared
                  ? "The manager review was shared before a self review was sent."
                  : !agreed
                    ? "Opens once your goals are agreed and reviews are open."
                    : "Opens when the admin opens reviews for this cycle."}
            </p>
          )}
        </section>
      )}
      {!showSelf && agreed && cycle.stage === "REVIEW" && (
        <p className="mb-6 text-sm text-slate-500">{employee.firstName} hasn&apos;t sent a self review yet.</p>
      )}

      {/* ── Manager review ────────────────────────────────── */}
      {showManager && (
        <section className="card mb-6 text-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Manager review</h2>
            {shared ? (
              <span className="text-xs text-slate-500">
                Shared {formatDateTime(review.managerSubmittedAt)} by {review.managerSubmittedBy?.name ?? "the reviewer"}
              </span>
            ) : (
              <Badge color="gray">Draft, only reviewers can see it</Badge>
            )}
          </div>
          {canEditManager ? (
            <ActionForm action={saveManagerReview.bind(null, review.id)} className="space-y-4">
              {!selfIn && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                  {employee.userId
                    ? `${employee.firstName} hasn't sent a self review yet. Sharing yours closes it.`
                    : `${employee.firstName} has no login, so there is no self review.`}
                </p>
              )}
              <RatingScale />
              {goals.map((g, i) => (
                <div key={g.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-1 font-medium">
                    {i + 1}. {g.title}
                    {g.weight != null && <span className="ml-1 text-xs font-normal text-slate-500">({g.weight}%)</span>}
                  </div>
                  {selfIn && (
                    <div className="mb-2 text-xs text-slate-500">
                      Self: {g.selfRating ?? "—"}
                      {g.selfComment && ` · "${g.selfComment}"`}
                    </div>
                  )}
                  <RatingPicker name={`rating_${g.id}`} value={g.managerRating} />
                  <textarea name={`comment_${g.id}`} defaultValue={g.managerComment ?? ""} rows={2} placeholder="Comment" className="input mt-2" />
                </div>
              ))}
              <Field label="Strengths">
                <textarea name="managerStrengths" defaultValue={review.managerStrengths ?? ""} rows={3} className="input" />
              </Field>
              <Field label="To improve next period">
                <textarea name="managerImprove" defaultValue={review.managerImprove ?? ""} rows={3} className="input" />
              </Field>
              <Field label="Other comments (optional)">
                <textarea name="managerComment" defaultValue={review.managerComment ?? ""} rows={2} className="input" />
              </Field>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="mb-2 font-medium">Overall rating</div>
                <p className="mb-2 text-xs text-slate-500">
                  {managerScore != null
                    ? `Goal ratings work out to ${managerScore}. Pick the rating that fits the whole period.`
                    : "Save the goal ratings as a draft to see what they work out to."}
                </p>
                <RatingPicker name="managerRating" value={review.managerRating ?? (managerScore != null ? Math.round(managerScore) : null)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" name="intent" value="draft" className="btn-secondary">
                  Save draft
                </button>
                <button type="submit" name="intent" value="submit" className="btn-primary">
                  Share with {employee.firstName}
                </button>
              </div>
            </ActionForm>
          ) : shared || review.managerRating || review.managerStrengths ? (
            <>
              <ManagerView review={review} goals={goals} score={managerScore} />
              {admin && shared && !review.acknowledgedAt && !closed && (
                <form action={reopenManagerReview.bind(null, review.id)} className="mt-4 print:hidden">
                  <button className="btn-secondary btn-sm">Take back for changes</button>
                </form>
              )}
            </>
          ) : (
            <p className="text-slate-500">
              {closed ? "No manager review was written." : agreed ? "Opens when the admin opens reviews for this cycle." : "Agree the goals first."}
            </p>
          )}
        </section>
      )}

      {/* ── Sign off ──────────────────────────────────────── */}
      {shared && (
        <section className="card text-sm">
          <h2 className="mb-3 font-semibold">Sign off</h2>
          {review.acknowledgedAt ? (
            <>
              <p className="mb-2 text-slate-600">
                {employee.firstName} read and signed off this review on {formatDateTime(review.acknowledgedAt)}.
              </p>
              {review.employeeComment && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase">Their comment</div>
                  <Paragraph>{review.employeeComment}</Paragraph>
                </div>
              )}
            </>
          ) : isSelf ? (
            <ActionForm action={acknowledgeReview.bind(null, review.id)} className="space-y-3">
              <p className="text-slate-600">
                Signing off means you have read the review. If you disagree with anything, say so here; your comment stays with the review.
              </p>
              <Field label="Your comment (optional)">
                <textarea name="employeeComment" rows={3} className="input" />
              </Field>
              <SubmitButton>I have read this review</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-slate-500">Waiting for {employee.firstName} to read and sign it off.</p>
          )}
        </section>
      )}
    </>
  );
}

type Review = NonNullable<Awaited<ReturnType<typeof reviewFor>>>["review"];

function SelfView({ review, goals }: { review: Review; goals: Review["goals"] }) {
  return (
    <div className="space-y-4">
      <ol className="divide-y divide-slate-100">
        {goals.map((g, i) => (
          <li key={g.id} className="py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {i + 1}. {g.title}
              </span>
              <RatingBadge rating={g.selfRating} />
            </div>
            {g.selfComment && <p className="mt-1 whitespace-pre-line text-slate-600">{g.selfComment}</p>}
          </li>
        ))}
      </ol>
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase">What went well</div>
        <Paragraph>{review.selfAchievements}</Paragraph>
      </div>
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase">To improve, and support needed</div>
        <Paragraph>{review.selfImprove}</Paragraph>
      </div>
    </div>
  );
}

function ManagerView({ review, goals, score }: { review: Review; goals: Review["goals"]; score: number | null }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-brand-50 p-3">
        <span className="font-medium">Overall rating</span>
        <RatingBadge rating={review.managerRating} />
        {score != null && <span className="text-xs text-slate-500">Goal ratings work out to {score}</span>}
      </div>
      <ol className="divide-y divide-slate-100">
        {goals.map((g, i) => (
          <li key={g.id} className="py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {i + 1}. {g.title}
              </span>
              <RatingBadge rating={g.managerRating} />
            </div>
            {g.managerComment && <p className="mt-1 whitespace-pre-line text-slate-600">{g.managerComment}</p>}
          </li>
        ))}
      </ol>
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase">Strengths</div>
        <Paragraph>{review.managerStrengths}</Paragraph>
      </div>
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase">To improve next period</div>
        <Paragraph>{review.managerImprove}</Paragraph>
      </div>
      {review.managerComment && (
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase">Other comments</div>
          <Paragraph>{review.managerComment}</Paragraph>
        </div>
      )}
    </div>
  );
}
