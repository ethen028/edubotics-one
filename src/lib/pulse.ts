import "server-only";
import type { Prisma, TimesheetStatus } from "@prisma/client";
import { db } from "./db";
import { isAdmin, type CurrentUser } from "./auth";
import { OPEN_PROJECT_STAGES, progress, projectScope } from "./projects";
import { todayIST } from "./time";

const DAY = 86400000;

export const PULSE_RANGES = { today: 1, week: 7, fortnight: 14 } as const;
export type PulseRange = keyof typeof PULSE_RANGES;
export const pulseRangeLabel: Record<PulseRange, string> = { today: "Today", week: "Last 7 days", fortnight: "Last 14 days" };

export function readRange(v: string | undefined): PulseRange {
  return v && v in PULSE_RANGES ? (v as PulseRange) : "week";
}

/** Work logged by this user, or (for managers and admins) on their projects and by the people who report to them. */
function entryScope(user: CurrentUser): Prisma.TimeEntryWhereInput {
  if (isAdmin(user)) return {};
  const own: Prisma.TimeEntryWhereInput = { timesheet: { employeeId: user.employee?.id ?? "__none__" } };
  if (user.role !== "MANAGER") return own;
  return {
    OR: [
      own,
      { project: projectScope(user) },
      ...(user.employee ? [{ timesheet: { employee: { managerId: user.employee.id } } }] : []),
    ],
  };
}

/**
 * Task Flow v5's Daily Pulse: a read-only briefing, scoped to what the user can see. Signals are rules, not guesses:
 * overdue, due within 3 days and under 75% done, blocked or overdue tasks, tasks waiting for review, update requests.
 */
export async function dailyPulse(user: CurrentUser, range: PulseRange) {
  const today = todayIST();
  const days = PULSE_RANGES[range];
  const from = new Date(today.getTime() - (days - 1) * DAY);
  const deadline = new Date(today.getTime() + (days - 1) * DAY);
  const soon = new Date(today.getTime() + 3 * DAY);
  const mineOnly = user.role === "EMPLOYEE";
  const trendDays = Math.max(days, 7);
  const trendFrom = new Date(today.getTime() - (trendDays - 1) * DAY);

  const [projects, loaded] = await Promise.all([
    db.project.findMany({
      where: { ...projectScope(user), stage: { in: [...OPEN_PROJECT_STAGES] } },
      include: {
        owner: { select: { name: true } },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            progress: true,
            dueDate: true,
            blockedAt: true,
            blockedReason: true,
            updateRequestedAt: true,
            assigneeId: true,
            assignee: { select: { name: true } },
          },
        },
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    db.timeEntry.findMany({
      where: { date: { gte: trendFrom, lte: today }, ...entryScope(user) },
      include: {
        timesheet: { select: { status: true, employee: { select: { firstName: true, lastName: true } } } },
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 2000,
    }),
  ]);

  const entries = loaded.filter((e) => e.date >= from);
  const rows = projects.map((p) => {
    const tasks = mineOnly ? p.tasks.filter((t) => t.assigneeId === user.id) : p.tasks;
    const open = tasks.filter((t) => t.status !== "DONE");
    const pct = progress(p.tasks);
    const reasons: string[] = [];
    if (p.dueDate && p.dueDate < today) reasons.push("Project overdue");
    else if (p.dueDate && p.dueDate <= soon && pct < 75) reasons.push("Due soon, under 75%");
    const blocked = open.filter((t) => t.blockedAt).length;
    const late = open.filter((t) => t.dueDate && t.dueDate < today).length;
    const review = open.filter((t) => t.status === "REVIEW").length;
    const requested = open.filter((t) => t.updateRequestedAt).length;
    if (blocked) reasons.push(`${blocked} blocked`);
    if (late) reasons.push(`${late} task(s) overdue`);
    if (review) reasons.push(`${review} waiting for review`);
    if (requested) reasons.push(`${requested} update request(s)`);
    if (p.onHold) reasons.push("On hold");
    const projectEntries = entries.filter((e) => e.projectId === p.id);
    return {
      project: p,
      progress: pct,
      openTasks: open.length,
      blocked,
      reasons,
      approvedHours: sumHours(projectEntries.filter((e) => e.timesheet.status === "APPROVED")),
      pendingHours: sumHours(projectEntries.filter((e) => e.timesheet.status !== "APPROVED")),
    };
  });

  const attention = rows
    .filter((r) => r.reasons.length > 0)
    .sort((a, b) => {
      const ao = a.project.dueDate && a.project.dueDate < today ? 0 : 1;
      const bo = b.project.dueDate && b.project.dueDate < today ? 0 : 1;
      return ao - bo || b.reasons.length - a.reasons.length;
    });
  const deadlines = rows.filter((r) => r.project.dueDate && r.project.dueDate >= today && r.project.dueDate <= deadline);

  const queue = projects
    .flatMap((p) => (mineOnly ? p.tasks.filter((t) => t.assigneeId === user.id) : p.tasks).map((t) => ({ ...t, project: { id: p.id, name: p.name } })))
    .filter((t) => t.status !== "DONE" && (t.blockedAt || t.status === "REVIEW" || (t.dueDate && t.dueDate <= deadline)))
    .sort(
      (a, b) =>
        Number(!a.blockedAt) - Number(!b.blockedAt) || (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity),
    );

  const byStatus = (s: TimesheetStatus[]) => entries.filter((e) => s.includes(e.timesheet.status));
  const trend = Array.from({ length: trendDays }, (_, i) => {
    const date = new Date(trendFrom.getTime() + i * DAY);
    const dayEntries = loaded.filter((e) => e.date.getTime() === date.getTime());
    return {
      date,
      approved: sumHours(dayEntries.filter((e) => e.timesheet.status === "APPROVED")),
      other: sumHours(dayEntries.filter((e) => e.timesheet.status !== "APPROVED")),
    };
  });

  return {
    today,
    from,
    deadline,
    mineOnly,
    rows,
    attention,
    deadlines,
    queue,
    entries,
    logged: sumHours(entries),
    approved: sumHours(byStatus(["APPROVED"])),
    waiting: sumHours(byStatus(["SUBMITTED"])),
    sentBack: new Set(byStatus(["REJECTED"]).map((e) => e.timesheetId)).size,
    todayBlocks: entries.filter((e) => e.date.getTime() === today.getTime()).length,
    trend,
  };
}

function sumHours(entries: { hours: Prisma.Decimal }[]) {
  return Math.round(entries.reduce((s, e) => s + Number(e.hours), 0) * 100) / 100;
}
