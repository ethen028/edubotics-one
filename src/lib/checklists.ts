import "server-only";
import { cache } from "react";
import type { Prisma, Role } from "@prisma/client";
import { db } from "./db";
import { isAdmin, isManagerOrAdmin, type CurrentUser } from "./auth";
import { getSettings } from "./settings";
import { istDate } from "./attendance";
import { todayIST } from "./time";
import {
  SESSION_LEAD_DAYS,
  dateKey,
  periodSlots,
  sessionSlot,
  slotStatus,
  type Calendar,
  type Slot,
  type SlotStatus,
} from "./checklist-schedule";

const DAY = 86_400_000;

/** Admins and managers write checklists; admins edit any, managers their own. */
export const canCreateChecklists = isManagerOrAdmin;
export const canEditTemplate = (user: CurrentUser, t: { createdById: string }) => isAdmin(user) || t.createdById === user.id;

/**
 * Whose checklists this user can look at besides their own: everyone for admins,
 * direct reports for managers. Missed and overdue items are flagged to these people.
 */
export async function teamUserIds(user: CurrentUser): Promise<string[]> {
  if (isAdmin(user)) {
    return (await db.user.findMany({ where: { active: true }, select: { id: true } })).map((u) => u.id);
  }
  if (user.role !== "MANAGER" || !user.employee) return [];
  const reports = await db.employee.findMany({
    where: { managerId: user.employee.id, userId: { not: null }, user: { active: true } },
    select: { userId: true },
  });
  return reports.map((r) => r.userId!);
}

export async function canSeeUser(viewer: CurrentUser, userId: string) {
  return viewer.id === userId || (await teamUserIds(viewer)).includes(userId);
}

export const templateSelect = {
  id: true,
  title: true,
  frequency: true,
  weekday: true,
  dayOfMonth: true,
  dueTime: true,
  audience: true,
  role: true,
  startsOn: true,
  endsOn: true,
  createdById: true,
  assignees: { select: { userId: true } },
  _count: { select: { items: { where: { archivedAt: null } } } },
} satisfies Prisma.ChecklistTemplateSelect;

type Template = Prisma.ChecklistTemplateGetPayload<{ select: typeof templateSelect }>;
type Person = { id: string; name: string; role: Role; createdAt: Date };

/** Whether a day, week or month checklist is meant for this person. Session checklists go to each session's trainer. */
export function appliesTo(t: Pick<Template, "audience" | "role" | "assignees">, u: { id: string; role: Role }) {
  if (t.audience === "EVERYONE") return true;
  if (t.audience === "ROLE") return t.role === u.role;
  return t.assignees.some((a) => a.userId === u.id);
}

export type Entry = {
  template: Template;
  user: { id: string; name: string };
  slot: Slot;
  status: SlotStatus;
  run: { id: string; completedAt: Date | null; ticked: number } | null;
  total: number;
  session?: { id: string; startTime: string; classGroup: string | null; school: string };
};

/** Company working days, holidays and approved leave, for working out which days count. */
async function calendarFor(from: Date, to: Date, userIds: string[]) {
  const [settings, holidays, leave] = await Promise.all([
    getSettings(),
    // Month-end checklists look back from the last day of the month, so reach a little past the range.
    db.holiday.findMany({
      where: { optional: false, date: { gte: new Date(from.getTime() - 40 * DAY), lte: new Date(to.getTime() + 40 * DAY) } },
      select: { date: true },
    }),
    db.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: to }, endDate: { gte: from }, employee: { userId: { in: userIds } } },
      select: { startDate: true, endDate: true, halfDay: true, employee: { select: { userId: true } } },
    }),
  ]);
  const cal: Calendar = { weeklyOffDays: settings.weeklyOffDays, holidays: new Set(holidays.map((h) => dateKey(h.date))) };
  // A full day's leave means no daily checklist that day. Half days still count.
  const onLeave = new Set<string>();
  for (const l of leave) {
    if (l.halfDay) continue;
    for (let d = l.startDate; d <= l.endDate; d = new Date(d.getTime() + DAY)) onLeave.add(`${l.employee.userId}|${dateKey(d)}`);
  }
  return { cal, onLeave };
}

/**
 * Every checklist slot for these people whose period overlaps from..to (dates), with how far each got.
 * Nothing is stored until someone ticks, so slots are worked out from the checklists and matched to saved runs.
 */
export async function checklistEntries(opts: {
  userIds: string[];
  from: Date;
  to: Date;
  templateId?: string;
  now?: Date;
}): Promise<Entry[]> {
  const now = opts.now ?? new Date();
  const { from, to } = opts;
  if (opts.userIds.length === 0) return [];
  const [people, templates] = await Promise.all([
    db.user.findMany({ where: { id: { in: opts.userIds } }, select: { id: true, name: true, role: true, createdAt: true } }),
    db.checklistTemplate.findMany({
      where: {
        ...(opts.templateId ? { id: opts.templateId } : {}),
        startsOn: { lte: new Date(to.getTime() + SESSION_LEAD_DAYS * DAY) },
        OR: [{ endsOn: null }, { endsOn: { gte: new Date(from.getTime() - 31 * DAY) } }],
      },
      select: templateSelect,
      orderBy: { title: "asc" },
    }),
  ]);
  if (templates.length === 0) return [];
  const userIds = people.map((p) => p.id);
  const sessionTemplates = templates.filter((t) => t.frequency === "SESSION");

  const [{ cal, onLeave }, sessions] = await Promise.all([
    calendarFor(from, to, userIds),
    sessionTemplates.length
      ? db.programmeSession.findMany({
          // A session's checklist opens the day before, so tomorrow's classes overlap today.
          where: {
            date: { gte: from, lte: new Date(to.getTime() + SESSION_LEAD_DAYS * DAY) },
            status: { not: "CANCELLED" },
            OR: [{ trainerId: { in: userIds } }, { checklistRuns: { some: { userId: { in: userIds } } } }],
          },
          select: {
            id: true,
            date: true,
            startTime: true,
            classGroup: true,
            trainerId: true,
            programme: { select: { organization: { select: { name: true } } } },
          },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        })
      : [],
  ]);

  // Slots per checklist, before deciding who each one is for.
  const periodic = new Map(
    templates.filter((t) => t.frequency !== "SESSION").map((t) => [t.id, periodSlots(t, from, to, cal).filter((s) => !t.endsOn || s.dueDate <= t.endsOn)]),
  );
  const allSlots = [...periodic.values()].flat().concat(sessions.map(sessionSlot));
  if (allSlots.length === 0) return [];
  const dueDates = allSlots.map((s) => s.dueDate.getTime());

  const runs = await db.checklistRun.findMany({
    where: {
      userId: { in: userIds },
      templateId: { in: templates.map((t) => t.id) },
      dueDate: { gte: new Date(Math.min(...dueDates)), lte: new Date(Math.max(...dueDates)) },
    },
    select: { id: true, templateId: true, userId: true, periodKey: true, completedAt: true, _count: { select: { ticks: true } } },
  });
  const runOf = new Map(runs.map((r) => [`${r.templateId}|${r.userId}|${r.periodKey}`, r]));

  const entries: Entry[] = [];
  const push = (template: Template, person: Person, slot: Slot, session?: Entry["session"]) => {
    const run = runOf.get(`${template.id}|${person.id}|${slot.periodKey}`);
    // People added after a slot was due, and days on leave, aren't expected to have done it.
    if (!run) {
      if (slot.dueDate < istDate(person.createdAt) && slot.closesAt <= now) return;
      if (template.frequency === "DAILY" && onLeave.has(`${person.id}|${dateKey(slot.dueDate)}`)) return;
    }
    entries.push({
      template,
      user: { id: person.id, name: person.name },
      slot,
      status: slotStatus(slot, run?.completedAt, now),
      run: run ? { id: run.id, completedAt: run.completedAt, ticked: run._count.ticks } : null,
      total: template._count.items,
      session,
    });
  };

  for (const t of templates) {
    if (t.frequency === "SESSION") continue;
    for (const person of people) {
      const slots = periodic.get(t.id)!;
      const forThem = appliesTo(t, person);
      for (const s of slots) {
        if (forThem || runOf.has(`${t.id}|${person.id}|${s.periodKey}`)) push(t, person, s);
      }
    }
  }
  const byId = new Map(people.map((p) => [p.id, p]));
  for (const s of sessions) {
    const slot = sessionSlot(s);
    const session = { id: s.id, startTime: s.startTime, classGroup: s.classGroup, school: s.programme.organization.name };
    for (const t of sessionTemplates) {
      if (s.date < t.startsOn || (t.endsOn && s.date > t.endsOn)) continue;
      // The current trainer, plus anyone who started it before the class was handed over.
      const who = new Set(runs.filter((r) => r.templateId === t.id && r.periodKey === slot.periodKey).map((r) => r.userId));
      if (s.trainerId) who.add(s.trainerId);
      for (const uid of who) {
        const person = byId.get(uid);
        if (person) push(t, person, slot, session);
      }
    }
  }
  return entries.sort((a, b) => a.slot.dueAt.getTime() - b.slot.dueAt.getTime() || a.template.title.localeCompare(b.template.title));
}

/** What's open for one person right now: to do or overdue, what they've finished, and what they missed this week. Cached per request (menu badge and Home share it). */
export const myChecklistsNow = cache(async (userId: string) => {
  const now = new Date();
  const today = todayIST();
  const entries = await checklistEntries({ userIds: [userId], from: new Date(today.getTime() - 7 * DAY), to: today, now });
  const open = entries.filter((e) => e.status === "DUE" || e.status === "OVERDUE");
  const doneNow = entries.filter((e) => (e.status === "DONE" || e.status === "LATE") && e.slot.closesAt > now);
  const missed = entries.filter((e) => e.status === "MISSED").reverse();
  return { open, doneNow, missed };
});

/** Overdue now, and missed in the last week, for a manager's team. */
export async function teamFlags(user: CurrentUser, today: Date, now = new Date()) {
  const ids = (await teamUserIds(user)).filter((id) => id !== user.id);
  const entries = await checklistEntries({ userIds: ids, from: new Date(today.getTime() - 7 * DAY), to: today, now });
  return {
    overdue: entries.filter((e) => e.status === "OVERDUE"),
    missed: entries.filter((e) => e.status === "MISSED").reverse(),
  };
}

/** On time, late and missed counts, for history summaries. Slots still open aren't counted yet. */
export function tally(entries: Entry[]) {
  const t = { done: 0, late: 0, missed: 0, total: 0 };
  for (const e of entries) {
    if (e.status === "DONE") t.done++;
    else if (e.status === "LATE") t.late++;
    else if (e.status === "MISSED") t.missed++;
    else continue;
    t.total++;
  }
  return { ...t, onTimePct: t.total ? Math.round((t.done / t.total) * 100) : null };
}
