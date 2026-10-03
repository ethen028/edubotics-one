import "server-only";
import type { AttendanceSession } from "@prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";
import { dateKey, dayStatus, type DayResult } from "./attendance";

export type DayDetail = DayResult & { sessions: AttendanceSession[] };

/** Attendance for each employee and each date in [from, to], keyed by employeeId then yyyy-mm-dd. */
export async function getAttendance(employeeIds: string[], from: Date, to: Date, now = new Date()) {
  const [settings, sessions, marks, leaves, holidays] = await Promise.all([
    getSettings(),
    db.attendanceSession.findMany({
      where: { employeeId: { in: employeeIds }, workDate: { gte: from, lte: to } },
      orderBy: { checkIn: "asc" },
    }),
    db.attendanceMark.findMany({ where: { employeeId: { in: employeeIds }, workDate: { gte: from, lte: to } } }),
    db.leaveRequest.findMany({
      where: { employeeId: { in: employeeIds }, status: "APPROVED", startDate: { lte: to }, endDate: { gte: from } },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
    db.holiday.findMany({ where: { date: { gte: from, lte: to }, optional: false }, select: { date: true } }),
  ]);
  const holidaySet = new Set(holidays.map((h) => dateKey(h.date)));

  const result = new Map<string, Map<string, DayDetail>>();
  for (const id of employeeIds) {
    const days = new Map<string, DayDetail>();
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400000)) {
      const k = dateKey(d);
      const daySessions = sessions.filter((s) => s.employeeId === id && dateKey(s.workDate) === k);
      const r = dayStatus({
        date: d,
        sessions: daySessions,
        mark: marks.find((m) => m.employeeId === id && dateKey(m.workDate) === k)?.status,
        onLeave: leaves.some((l) => l.employeeId === id && l.startDate <= d && l.endDate >= d),
        holiday: holidaySet.has(k),
        rules: settings,
        now,
      });
      days.set(k, { ...r, sessions: daySessions });
    }
    result.set(id, days);
  }
  return { days: result, settings };
}

export type MonthSummary = Record<"present" | "incomplete" | "overtime" | "absent" | "leave" | "mispunch", number> & {
  worked: number;
  shortfall: number;
  extra: number;
};

/** Counts and minute balance across a set of days (working days only for shortfall/extra). */
export function summarize(days: Iterable<DayDetail>, target: number): MonthSummary {
  const s: MonthSummary = { present: 0, incomplete: 0, overtime: 0, absent: 0, leave: 0, mispunch: 0, worked: 0, shortfall: 0, extra: 0 };
  for (const d of days) {
    s.worked += d.worked;
    if (d.status === "PRESENT") s.present++;
    if (d.status === "INCOMPLETE") {
      s.incomplete++;
      s.shortfall += Math.max(0, target - d.worked);
    }
    if (d.status === "OVERTIME") {
      s.overtime++;
      s.extra += Math.max(0, d.worked - target);
    }
    if (d.status === "ABSENT") s.absent++;
    if (d.status === "LEAVE") s.leave++;
    if (d.status === "MISPUNCH") s.mispunch++;
  }
  return s;
}
