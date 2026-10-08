import Link from "next/link";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { myReviewTodos, reviewStatus, STAGE_LABEL } from "@/lib/reviews";
import { todayIST } from "@/lib/time";
import { RatingBadge, ReviewTodos } from "./ui";

export const metadata = { title: "Performance reviews" };

const period = (c: { periodStart: Date; periodEnd: Date }) => `${formatDate(c.periodStart)} – ${formatDate(c.periodEnd)}`;

export default async function ReviewsPage() {
  const user = await requireUser();
  const admin = isAdmin(user);
  const today = todayIST();
  const [todos, mine, reviewing, cycles] = await Promise.all([
    myReviewTodos(user),
    user.employee
      ? db.performanceReview.findMany({
          where: { employeeId: user.employee.id },
          include: { cycle: true, reviewer: { select: { name: true } } },
          orderBy: { cycle: { periodEnd: "desc" } },
        })
      : [],
    db.performanceReview.findMany({
      where: {
        employeeId: { not: user.employee?.id ?? "__none__" },
        cycle: { stage: { not: "CLOSED" } },
        ...(admin ? { OR: [{ reviewerId: user.id }, { reviewerId: null }] } : { reviewerId: user.id }),
      },
      include: {
        cycle: true,
        employee: { select: { firstName: true, lastName: true, designation: true } },
        _count: { select: { goals: true } },
      },
      orderBy: [{ cycle: { periodEnd: "desc" } }, { employee: { firstName: "asc" } }],
    }),
    admin
      ? db.reviewCycle.findMany({
          orderBy: { periodEnd: "desc" },
          include: { reviews: { select: { acknowledgedAt: true, managerSubmittedAt: true } } },
        })
      : [],
  ]);

  return (
    <>
      <PageHeader
        title="Performance reviews"
        subtitle="Goals for the year or half-year, a self review, then the manager's rating. Each review stays on the person's profile."
        actions={
          admin && (
            <Link href="/hr/reviews/cycles/new" className="btn-primary">
              New review cycle
            </Link>
          )
        }
      />

      <ReviewTodos todos={todos} today={today} />

      {user.employee && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">My reviews</h2>
          {mine.length === 0 ? (
            <Empty>You haven&apos;t been part of a review yet.</Empty>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="table">
                <thead>
                  <tr>
                    <th>Review</th>
                    <th>Period</th>
                    <th>Reviewer</th>
                    <th>Where it stands</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((r) => {
                    const s = reviewStatus(r, r.cycle.stage);
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/hr/reviews/${r.id}`} className="link">
                            {r.cycle.name}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap">{period(r.cycle)}</td>
                        <td>{r.reviewer?.name ?? "Admin"}</td>
                        <td>
                          <Badge color={s.color}>{s.label}</Badge>
                        </td>
                        <td>{r.managerSubmittedAt ? <RatingBadge rating={r.managerRating} /> : <span className="text-slate-400">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {reviewing.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold">{admin ? "Reviews you do (yours and those with no manager)" : "Reviews you do"}</h2>
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Review</th>
                  <th>Goals</th>
                  <th>Where it stands</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {reviewing.map((r) => {
                  const s = reviewStatus(r, r.cycle.stage);
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/hr/reviews/${r.id}`} className="link">
                          {r.employee.firstName} {r.employee.lastName}
                        </Link>
                        <div className="text-xs text-slate-500">{r.employee.designation}</div>
                      </td>
                      <td>{r.cycle.name}</td>
                      <td>{r._count.goals || "—"}</td>
                      <td>
                        <Badge color={s.color}>{s.label}</Badge>
                      </td>
                      <td>{r.managerSubmittedAt ? <RatingBadge rating={r.managerRating} /> : <span className="text-slate-400">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {admin && (
        <section>
          <h2 className="mb-2 font-semibold">Review cycles</h2>
          {cycles.length === 0 ? (
            <Empty>
              No review cycles yet. Start one with <span className="font-medium">New review cycle</span>: pick the period and who is
              reviewed, and everyone sets their goals.
            </Empty>
          ) : (
            <div className="card overflow-x-auto p-0">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cycle</th>
                    <th>Period</th>
                    <th>Stage</th>
                    <th>Manager reviews done</th>
                    <th>Signed off</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/hr/reviews/cycles/${c.id}`} className="link">
                          {c.name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">{period(c)}</td>
                      <td>
                        <Badge color={c.stage === "CLOSED" ? "gray" : c.stage === "REVIEW" ? "amber" : "blue"}>{STAGE_LABEL[c.stage]}</Badge>
                      </td>
                      <td>
                        {c.reviews.filter((r) => r.managerSubmittedAt).length}/{c.reviews.length}
                      </td>
                      <td>
                        {c.reviews.filter((r) => r.acknowledgedAt).length}/{c.reviews.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
