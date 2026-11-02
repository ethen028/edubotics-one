import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { isHrOrAdmin } from "@/lib/permissions";
import { addMonths, monthRhythm, monthStart } from "@/lib/plan-rules";

export type CalendarKind = "holiday" | "rhythm" | "plan" | "meeting" | "session" | "workshop" | "leave" | "due";

export type CalendarEvent = { date: Date; kind: CalendarKind; title: string; href?: string; time?: string };

export const CALENDAR_KINDS: { kind: CalendarKind; label: string; color: string }[] = [
  { kind: "holiday", label: "Holidays", color: "var(--color-emerald-600)" },
  { kind: "rhythm", label: "Planning and reviews", color: "var(--color-navy)" },
  { kind: "plan", label: "Plan deadlines", color: "var(--color-amber-500)" },
  { kind: "meeting", label: "Meetings", color: "#06b6d4" }, // the brand cyan
  { kind: "session", label: "School sessions", color: "var(--color-brand-700)" },
  { kind: "workshop", label: "Workshops and internships", color: "var(--color-violet-500)" },
  { kind: "leave", label: "Leave", color: "var(--color-slate-400)" },
  { kind: "due", label: "Due dates and interviews", color: "var(--color-red-500)" },
];

const DAY = 86400000;
const dateOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
/** A timestamp's date and clock time in India. */
function ist(d: Date) {
  const t = new Date(d.getTime() + 5.5 * 3600000);
  return { date: dateOnly(t), time: t.toISOString().slice(11, 16) };
}

/**
 * Everything on the company calendar between two dates (inclusive) that this person should see: holidays,
 * the planning rhythm from the operating plan, plan deadlines, school sessions, workshops, approved leave,
 * project milestones and tasks, interviews, and the meetings they organise or are invited to (never anyone else's). Managers and admins see the whole team's; others see their own.
 */
export async function calendarEvents(user: CurrentUser, from: Date, to: Date): Promise<CalendarEvent[]> {
  const manager = user.role === "ADMIN" || user.role === "MANAGER";
  const people = manager || isHrOrAdmin(user);
  const span = { gte: from, lte: to };
  const [holidays, months, planTasks, sessions, workshops, leave, milestones, tasks, interviews, meetings] = await Promise.all([
    db.holiday.findMany({ where: { date: span }, orderBy: { date: "asc" } }),
    db.planMonth.findMany({ where: { month: { gte: monthStart(from), lte: to } } }),
    db.planTask.findMany({
      where: { deadline: span, status: { not: "DONE" }, ...(manager ? {} : { ownerId: user.id }) },
      include: { month: { select: { month: true } }, owner: { select: { name: true } } },
    }),
    db.programmeSession.findMany({
      where: { date: span, status: { not: "CANCELLED" }, ...(manager ? {} : { trainerId: user.id }) },
      include: { programme: { select: { organization: { select: { name: true } } } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.workshop.findMany({ where: { status: { not: "CANCELLED" }, startDate: { lte: to }, endDate: { gte: from } } }),
    db.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: to },
        endDate: { gte: from },
        ...(people ? {} : { employeeId: user.employee?.id ?? "__none__" }),
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    }),
    db.milestone.findMany({
      where: { dueDate: span, doneAt: null, project: manager ? {} : { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] } },
      include: { project: { select: { id: true, name: true } } },
    }),
    db.projectTask.findMany({
      where: { dueDate: span, assigneeId: user.id, status: { not: "DONE" } },
      select: { id: true, title: true, dueDate: true, projectId: true },
    }),
    db.interview.findMany({
      where: { scheduledAt: { gte: from, lt: new Date(to.getTime() + DAY) }, status: "SCHEDULED", ...(people ? {} : { interviewerId: user.id }) },
      include: { candidate: { select: { id: true, name: true } } },
    }),
    db.meeting.findMany({
      where: {
        startsAt: { gte: new Date(from.getTime() - 5.5 * 3600000), lt: new Date(to.getTime() + DAY - 5.5 * 3600000) },
        cancelledAt: null,
        OR: [{ organizerId: user.id }, { attendees: { some: { userId: user.id, response: { not: "NO" } } } }],
      },
      select: { id: true, title: true, startsAt: true },
    }),
  ]);

  const events: CalendarEvent[] = [];
  const holidayDates = holidays.filter((h) => !h.optional).map((h) => h.date);
  for (const h of holidays) events.push({ date: h.date, kind: "holiday", title: h.optional ? `${h.name} (restricted)` : h.name, href: "/hr/holidays" });

  // The monthly rhythm, for every month the range touches (Friday reminders are left off the grid).
  for (let m = monthStart(from); m <= to; m = addMonths(m, 1)) {
    const plan = months.find((p) => p.month.getTime() === m.getTime());
    for (const e of monthRhythm(m, holidayDates, plan?.planningMeeting)) {
      if (e.date < from || e.date > to || e.title.startsWith("Update your")) continue;
      events.push({ date: e.date, kind: "rhythm", title: e.title, time: e.time, href: e.title.startsWith("Commission") ? "/crm/commission" : "/plan" });
    }
  }
  for (const t of planTasks) {
    if (!t.deadline) continue;
    events.push({
      date: t.deadline,
      kind: "plan",
      title: manager && t.owner ? `${t.activity} · ${t.owner.name}` : t.activity,
      href: `/plan?month=${t.month.month.toISOString().slice(0, 7)}#task-${t.id}`,
    });
  }
  if (manager) {
    // One line per school per day keeps the month readable.
    const perDay = new Map<string, { date: Date; schools: Set<string>; n: number }>();
    for (const s of sessions) {
      const key = s.date.toISOString();
      const entry = perDay.get(key) ?? { date: s.date, schools: new Set<string>(), n: 0 };
      entry.schools.add(s.programme.organization.name);
      entry.n++;
      perDay.set(key, entry);
    }
    for (const d of perDay.values()) {
      events.push({
        date: d.date,
        kind: "session",
        title: `${d.n} session${d.n === 1 ? "" : "s"} · ${[...d.schools].slice(0, 2).join(", ")}${d.schools.size > 2 ? "…" : ""}`,
        href: `/operations/schedule?week=${d.date.toISOString().slice(0, 10)}`,
      });
    }
  } else {
    for (const s of sessions) events.push({ date: s.date, kind: "session", time: s.startTime, title: `${s.programme.organization.name}${s.classGroup ? ` · ${s.classGroup}` : ""}`, href: `/operations/sessions/${s.id}` });
  }
  for (const w of workshops) {
    const label = w.kind === "INTERNSHIP" ? "Internship" : w.kind === "TEACHER_TRAINING" ? "Teacher training" : "Workshop";
    for (let d = w.startDate < from ? from : w.startDate; d <= w.endDate && d <= to; d = new Date(d.getTime() + DAY)) {
      if (d.getUTCDay() === 0 && d.getTime() !== w.startDate.getTime()) continue;
      events.push({ date: d, kind: "workshop", title: `${label}: ${w.title}`, href: `/workshops/${w.id}` });
    }
  }
  for (const l of leave) {
    for (let d = l.startDate < from ? from : l.startDate; d <= l.endDate && d <= to; d = new Date(d.getTime() + DAY)) {
      if (d.getUTCDay() === 0) continue;
      events.push({ date: d, kind: "leave", title: `${l.employee.firstName} ${l.employee.lastName.slice(0, 1)}. on leave${l.halfDay ? " (half day)" : ""}`, href: people ? "/hr/approvals" : "/hr/leave" });
    }
  }
  for (const m of milestones) if (m.dueDate) events.push({ date: m.dueDate, kind: "due", title: `Milestone: ${m.title} · ${m.project.name}`, href: `/projects/${m.project.id}` });
  for (const t of tasks) if (t.dueDate) events.push({ date: t.dueDate, kind: "due", title: `Task due: ${t.title}`, href: `/projects/${t.projectId}` });
  for (const i of interviews) {
    const at = ist(i.scheduledAt);
    events.push({ date: at.date, time: at.time, kind: "due", title: `Interview: ${i.candidate.name} (${i.round})`, href: `/recruitment/candidates/${i.candidate.id}` });
  }
  for (const m of meetings) {
    const at = ist(m.startsAt);
    events.push({ date: at.date, time: at.time, kind: "meeting", title: m.title, href: `/meetings/${m.id}` });
  }
  const order: CalendarKind[] = ["holiday", "rhythm", "due", "meeting", "plan", "workshop", "session", "leave"];
  return events.sort((a, b) => a.date.getTime() - b.date.getTime() || order.indexOf(a.kind) - order.indexOf(b.kind) || (a.time ?? "").localeCompare(b.time ?? ""));
}
