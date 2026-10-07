import "server-only";
import type { PerformanceReview, ReviewCycle, ReviewGoal } from "@prisma/client";
import { db } from "./db";
import { todayIST } from "./time";
import { isAdmin, type CurrentUser } from "./auth";

export const STAGE_LABEL = { GOAL_SETTING: "Setting goals", REVIEW: "Reviews open", CLOSED: "Closed" } as const;

type ReviewTimes = Pick<PerformanceReview, "goalsAgreedAt" | "selfSubmittedAt" | "managerSubmittedAt" | "acknowledgedAt">;

/** Where one person's review stands. */
export function reviewStatus(r: ReviewTimes, stage: ReviewCycle["stage"]) {
  if (r.acknowledgedAt) return { key: "DONE", label: "Completed", color: "green" } as const;
  if (r.managerSubmittedAt) return { key: "ACK", label: "Waiting for employee to read", color: "purple" } as const;
  if (stage === "CLOSED") return { key: "UNFINISHED", label: "Not finished", color: "gray" } as const;
  if (!r.goalsAgreedAt) return { key: "GOALS", label: "Setting goals", color: "gray" } as const;
  if (stage === "GOAL_SETTING") return { key: "AGREED", label: "Goals agreed", color: "blue" } as const;
  if (r.selfSubmittedAt) return { key: "MANAGER", label: "Waiting for manager review", color: "amber" } as const;
  return { key: "SELF", label: "Self review due", color: "amber" } as const;
}

/** Weighted (or plain) average of the goal ratings, one decimal; null until every goal is rated. */
export function scoreOf(goals: ReviewGoal[], who: "self" | "manager") {
  const ratings = goals.map((g) => (who === "self" ? g.selfRating : g.managerRating));
  if (goals.length === 0 || ratings.some((r) => r == null)) return null;
  const weighted = goals.every((g) => g.weight != null);
  const total = weighted
    ? goals.reduce((s, g, i) => s + g.weight! * ratings[i]!, 0) / 100
    : ratings.reduce((s: number, r) => s + r!, 0) / goals.length;
  return Math.round(total * 10) / 10;
}

/** Whether this user can do the manager side of a review. Nobody reviews themselves. */
export function isReviewer(user: CurrentUser, review: Pick<PerformanceReview, "reviewerId" | "employeeId">) {
  if (user.employee?.id === review.employeeId) return false;
  return review.reviewerId === user.id || isAdmin(user);
}

/**
 * A review with the parts this user may see, or null when they may not open it.
 * The person, their reviewer, their current manager (read only) and admins can open it.
 */
export async function reviewFor(user: CurrentUser, id: string) {
  const review = await db.performanceReview.findUnique({
    where: { id },
    include: {
      cycle: true,
      employee: { select: { id: true, firstName: true, lastName: true, designation: true, code: true, managerId: true, userId: true, department: { select: { name: true } } } },
      reviewer: { select: { id: true, name: true } },
      managerSubmittedBy: { select: { name: true } },
      goals: { orderBy: [{ sort: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!review) return null;
  const isSelf = user.employee?.id === review.employeeId;
  const reviewer = isReviewer(user, review);
  const isManager = !!user.employee && user.employee.id === review.employee.managerId;
  if (!isSelf && !reviewer && !isManager) return null;
  return { review, isSelf, reviewer, isManager };
}

/** Reviews where this user is the one to act next, for the Home card and the menu count. */
export async function myReviewTodos(user: CurrentUser) {
  const open = { cycle: { stage: { in: ["GOAL_SETTING", "REVIEW"] as ReviewCycle["stage"][] } } };
  const [mine, theirs] = await Promise.all([
    user.employee
      ? db.performanceReview.findMany({
          where: { employeeId: user.employee.id, acknowledgedAt: null, OR: [open, { managerSubmittedAt: { not: null } }] },
          include: { cycle: true, _count: { select: { goals: true } } },
        })
      : [],
    db.performanceReview.findMany({
      where: {
        ...open,
        managerSubmittedAt: null,
        employeeId: { not: user.employee?.id ?? "__none__" },
        ...(isAdmin(user) ? { OR: [{ reviewerId: user.id }, { reviewerId: null }] } : { reviewerId: user.id }),
      },
      include: { cycle: true, employee: { select: { firstName: true, lastName: true, userId: true } }, _count: { select: { goals: true } } },
    }),
  ]);
  const today = todayIST();
  const todos: { id: string; label: string; due: Date | null }[] = [];
  for (const r of mine) {
    if (r.managerSubmittedAt) todos.push({ id: r.id, label: `Read your ${r.cycle.name} and sign it off`, due: null });
    else if (!r.goalsAgreedAt && r._count.goals === 0) todos.push({ id: r.id, label: `Write your goals for ${r.cycle.name}`, due: r.cycle.goalsDue });
    else if (r.goalsAgreedAt && r.cycle.stage === "REVIEW" && !r.selfSubmittedAt)
      todos.push({ id: r.id, label: `Fill in your self review for ${r.cycle.name}`, due: r.cycle.selfDue });
  }
  for (const r of theirs) {
    const who = `${r.employee.firstName} ${r.employee.lastName}`.trim();
    if (!r.goalsAgreedAt && r._count.goals > 0) todos.push({ id: r.id, label: `Agree ${who}'s goals`, due: r.cycle.goalsDue });
    else if (r.goalsAgreedAt && r.cycle.stage === "REVIEW" && (r.selfSubmittedAt || !r.employee.userId || (r.cycle.selfDue && r.cycle.selfDue < today)))
      todos.push({ id: r.id, label: `Review ${who}`, due: r.cycle.managerDue });
  }
  return todos;
}

/** The user who reviews an employee by default: their manager's login, else any admin (null). */
export async function defaultReviewer(employeeId: string) {
  const e = await db.employee.findUnique({
    where: { id: employeeId },
    select: { manager: { select: { user: { select: { id: true, active: true } } } } },
  });
  const u = e?.manager?.user;
  return u?.active ? u.id : null;
}
