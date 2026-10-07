import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { RATING_LABEL } from "@/lib/hr-constants";
import { reviewStatus, scoreOf, STAGE_LABEL } from "@/lib/reviews";
import { addToCycle, removeFromCycle, setCycleStage, setReviewer, updateCycle } from "../../actions";
import { CycleFields, PeoplePicker, RatingBadge } from "../../ui";

export const metadata = { title: "Review cycle" };

const STAGE_HELP = {
  GOAL_SETTING: "People write their goals and their reviewer agrees them. Self reviews and ratings open when you open reviews.",
  REVIEW: "Self reviews and manager reviews are open. Goals can still be agreed for anyone who joined late.",
  CLOSED: "Read only. Unfinished reviews stay as they are; shared reviews can still be signed off.",
} as const;

export default async function CyclePage({ params }: PageProps<"/hr/reviews/cycles/[id]">) {
  await requireUser(["ADMIN"]);
  const { id } = await params;
  const cycle = await db.reviewCycle.findUnique({
    where: { id },
    include: {
      reviews: {
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, designation: true, userId: true } },
          reviewer: { select: { id: true, name: true } },
          goals: true,
        },
        orderBy: [{ employee: { firstName: "asc" } }, { employee: { lastName: "asc" } }],
      },
    },
  });
  if (!cycle) notFound();

  const included = new Set(cycle.reviews.map((r) => r.employeeId));
  const [reviewers, others] = await Promise.all([
    db.user.findMany({ where: { active: true, role: { in: ["ADMIN", "MANAGER"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.employee.findMany({
      where: { status: { in: ["ACTIVE", "ONBOARDING", "ON_NOTICE"] }, id: { notIn: [...included] } },
      select: { id: true, firstName: true, lastName: true, designation: true, manager: { select: { firstName: true, lastName: true } } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
  ]);

  const rows = cycle.reviews.map((r) => ({ ...r, status: reviewStatus(r, cycle.stage) }));
  const count = (key: string) => rows.filter((r) => r.status.key === key).length;
  const shared = rows.filter((r) => r.managerSubmittedAt && r.managerRating);
  const spread = [5, 4, 3, 2, 1].map((n) => ({ n, count: shared.filter((r) => r.managerRating === n).length }));
  const most = Math.max(1, ...spread.map((s) => s.count));
  const open = cycle.stage !== "CLOSED";

  return (
    <>
      <PageHeader
        title={cycle.name}
        subtitle={
          <>
            {formatDate(cycle.periodStart)} – {formatDate(cycle.periodEnd)} · {cycle.kind === "ANNUAL" ? "Yearly" : "Half-yearly"}{" "}
            <Badge color={cycle.stage === "CLOSED" ? "gray" : cycle.stage === "REVIEW" ? "amber" : "blue"}>{STAGE_LABEL[cycle.stage]}</Badge>
          </>
        }
        actions={
          <>
            <a href={`/hr/reviews/cycles/${cycle.id}/export`} className="btn-secondary">
              Download spreadsheet
            </a>
            <Link href="/hr/reviews" className="btn-secondary">
              Back
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <section className="card text-sm lg:col-span-2">
          <h2 className="mb-1 font-semibold">Stage: {STAGE_LABEL[cycle.stage]}</h2>
          <p className="mb-3 text-slate-600">{STAGE_HELP[cycle.stage]}</p>
          <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Setting goals", count("GOALS")],
              ["Goals agreed", count("AGREED") + count("SELF") + count("MANAGER")],
              ["Self reviews in", rows.filter((r) => r.selfSubmittedAt).length],
              ["Manager reviews shared", rows.filter((r) => r.managerSubmittedAt).length],
              ["Signed off", count("DONE")],
            ].map(([label, n]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="text-lg font-semibold">
                  {n}
                  <span className="text-sm font-normal text-slate-400">/{rows.length}</span>
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            {cycle.stage === "GOAL_SETTING" && (
              <form action={setCycleStage.bind(null, cycle.id)}>
                <input type="hidden" name="stage" value="REVIEW" />
                <button className="btn-primary">Open reviews</button>
              </form>
            )}
            {cycle.stage === "REVIEW" && (
              <>
                <form action={setCycleStage.bind(null, cycle.id)}>
                  <input type="hidden" name="stage" value="CLOSED" />
                  <button className="btn-primary">Close cycle</button>
                </form>
                <form action={setCycleStage.bind(null, cycle.id)}>
                  <input type="hidden" name="stage" value="GOAL_SETTING" />
                  <button className="btn-secondary">Back to goal setting</button>
                </form>
              </>
            )}
            {cycle.stage === "CLOSED" && (
              <form action={setCycleStage.bind(null, cycle.id)}>
                <input type="hidden" name="stage" value="REVIEW" />
                <button className="btn-secondary">Reopen reviews</button>
              </form>
            )}
          </div>
          {(cycle.goalsDue || cycle.selfDue || cycle.managerDue) && (
            <p className="mt-3 text-xs text-slate-500">
              {[
                cycle.goalsDue && `Goals by ${formatDate(cycle.goalsDue)}`,
                cycle.selfDue && `self reviews by ${formatDate(cycle.selfDue)}`,
                cycle.managerDue && `manager reviews by ${formatDate(cycle.managerDue)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </section>

        <section className="card text-sm">
          <h2 className="mb-3 font-semibold">Ratings given</h2>
          {shared.length === 0 ? (
            <p className="text-slate-500">Shows once managers share their reviews.</p>
          ) : (
            <ul className="space-y-2">
              {spread.map((s) => (
                <li key={s.n}>
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>
                      {s.n} · {RATING_LABEL[s.n]}
                    </span>
                    <span className="font-medium">{s.count}</span>
                  </div>
                  <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(s.count / most) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <h2 className="mb-2 font-semibold">People ({rows.length})</h2>
      {rows.length === 0 ? (
        <Empty>Nobody in this cycle yet. Add people below.</Empty>
      ) : (
        <div className="card mb-6 overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Reviewer</th>
                <th>Where it stands</th>
                <th>Self score</th>
                <th>Manager score</th>
                <th>Final rating</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/hr/reviews/${r.id}`} className="link">
                      {r.employee.firstName} {r.employee.lastName}
                    </Link>
                    <div className="text-xs text-slate-500">{r.employee.designation}</div>
                  </td>
                  <td>
                    {open && !r.managerSubmittedAt ? (
                      <form action={setReviewer.bind(null, r.id)} className="flex items-center gap-1">
                        <select name="reviewerId" defaultValue={r.reviewerId ?? ""} className="input w-auto py-1 text-xs">
                          <option value="">Any admin</option>
                          {reviewers
                            .filter((u) => u.id !== r.employee.userId)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                        </select>
                        <button className="btn-secondary btn-sm">Save</button>
                      </form>
                    ) : (
                      (r.reviewer?.name ?? "Any admin")
                    )}
                  </td>
                  <td>
                    <Badge color={r.status.color}>{r.status.label}</Badge>
                  </td>
                  <td>{r.selfSubmittedAt ? (scoreOf(r.goals, "self") ?? "—") : "—"}</td>
                  <td>{r.managerSubmittedAt ? (scoreOf(r.goals, "manager") ?? "—") : "—"}</td>
                  <td>{r.managerSubmittedAt ? <RatingBadge rating={r.managerRating} /> : <span className="text-slate-400">—</span>}</td>
                  <td>
                    {open && !r.selfSubmittedAt && !r.managerSubmittedAt && (
                      <form action={removeFromCycle.bind(null, r.id)}>
                        <button className="text-xs text-red-600 hover:underline">Remove</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {open && others.length > 0 && (
          <section className="card text-sm">
            <h2 className="mb-3 font-semibold">Add people</h2>
            <ActionForm action={addToCycle.bind(null, cycle.id)} className="space-y-3">
              <PeoplePicker people={others} />
              <SubmitButton className="btn-secondary">Add to this cycle</SubmitButton>
            </ActionForm>
          </section>
        )}
        <section className="card text-sm">
          <h2 className="mb-3 font-semibold">Details</h2>
          <ActionForm action={updateCycle.bind(null, cycle.id)} className="space-y-3">
            <CycleFields values={cycle} />
            <SubmitButton className="btn-secondary">Save details</SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
