import "server-only";
import type { Prisma, ProgrammeStatus, SessionStatus } from "@prisma/client";
import { db } from "./db";
import { isManagerOrAdmin, type CurrentUser } from "./auth";
import { dateKey } from "./attendance";

export const PROGRAMME_STATUSES = ["PLANNED", "RUNNING", "PAUSED", "COMPLETED"] as const satisfies readonly ProgrammeStatus[];
export const SESSION_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED", "MISSED"] as const satisfies readonly SessionStatus[];

/** Admins and managers run every school; a programme's coordinator runs their own. */
export function canManageProgramme(user: CurrentUser, programme: { coordinatorId: string }) {
  return isManagerOrAdmin(user) || programme.coordinatorId === user.id;
}

/** The session's trainer logs it; whoever manages the programme can too (e.g. covering for a sick trainer). */
export function canLogSession(user: CurrentUser, session: { trainerId: string | null; programme: { coordinatorId: string } }) {
  return session.trainerId === user.id || canManageProgramme(user, session.programme);
}

/** Past sessions nobody has logged yet. */
export function needsLogWhere(today: Date): Prisma.ProgrammeSessionWhereInput {
  return { status: "SCHEDULED", date: { lt: today } };
}

export function minutesOf(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const clock = (mins: number) => {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const suffix = h < 12 ? "am" : "pm";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
};

/** "10:30" + 45 → "10:30 am – 11:15 am" */
export function timeRange(startTime: string, durationMins: number) {
  const start = minutesOf(startTime);
  return `${clock(start)} – ${clock(start + durationMins)}`;
}

type Slot = { id: string; date: Date; startTime: string; durationMins: number; trainerId: string | null; status: SessionStatus };

/** Sessions whose trainer is booked somewhere else at an overlapping time on the same day. */
export function findClashes(sessions: Slot[]): Set<string> {
  const clashes = new Set<string>();
  const live = sessions.filter((s) => s.trainerId && s.status !== "CANCELLED");
  const byTrainerDay = new Map<string, Slot[]>();
  for (const s of live) {
    const k = `${s.trainerId}|${dateKey(s.date)}`;
    byTrainerDay.set(k, [...(byTrainerDay.get(k) ?? []), s]);
  }
  for (const group of byTrainerDay.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const a0 = minutesOf(a.startTime);
        const b0 = minutesOf(b.startTime);
        if (a0 < b0 + b.durationMins && b0 < a0 + a.durationMins) {
          clashes.add(a.id);
          clashes.add(b.id);
        }
      }
    }
  }
  return clashes;
}

/** "userId|yyyy-mm-dd" for every day a trainer is on approved or pending leave between two dates. */
export async function trainerLeaveDays(from: Date, to: Date) {
  const requests = await db.leaveRequest.findMany({
    where: {
      status: { in: ["APPROVED", "PENDING"] },
      startDate: { lte: to },
      endDate: { gte: from },
      employee: { userId: { not: null } },
    },
    select: { startDate: true, endDate: true, employee: { select: { userId: true } } },
  });
  const days = new Set<string>();
  for (const r of requests) {
    for (let d = new Date(Math.max(r.startDate.getTime(), from.getTime())); d <= r.endDate && d <= to; d = new Date(d.getTime() + 86400000)) {
      days.add(`${r.employee.userId}|${dateKey(d)}`);
    }
  }
  return days;
}

/** Sessions held / planned, for progress bars. Planned falls back to the number scheduled. */
export function programmeProgress(p: { sessionsPlanned: number | null }, counts: { completed: number; total: number }) {
  const planned = p.sessionsPlanned || counts.total;
  return { planned, completed: counts.completed, pct: planned ? Math.min(100, Math.round((counts.completed / planned) * 100)) : 0 };
}

/** Count sessions by status for a set of programmes in one query. */
export async function sessionCounts(programmeIds: string[]) {
  const rows = await db.programmeSession.groupBy({
    by: ["programmeId", "status"],
    where: { programmeId: { in: programmeIds } },
    _count: true,
  });
  const out = new Map<string, Record<SessionStatus, number> & { total: number }>();
  for (const id of programmeIds) out.set(id, { SCHEDULED: 0, COMPLETED: 0, CANCELLED: 0, MISSED: 0, total: 0 });
  for (const r of rows) {
    const c = out.get(r.programmeId)!;
    c[r.status] = r._count;
    if (r.status !== "CANCELLED") c.total += r._count;
  }
  return out;
}

export const programmeStatusColor: Record<ProgrammeStatus, "gray" | "blue" | "amber" | "green"> = {
  PLANNED: "gray",
  RUNNING: "blue",
  PAUSED: "amber",
  COMPLETED: "green",
};

export const sessionStatusColor: Record<SessionStatus, "gray" | "green" | "amber" | "red"> = {
  SCHEDULED: "gray",
  COMPLETED: "green",
  CANCELLED: "amber",
  MISSED: "red",
};

export const WEEKDAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
] as const;
