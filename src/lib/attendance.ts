import type { AttendanceStatus } from "@prisma/client";

const IST_OFFSET = 5.5 * 3600 * 1000;

/** The IST calendar date of an instant, as UTC midnight (matches Postgres DATE). */
export function istDate(instant: Date): Date {
  const ist = new Date(instant.getTime() + IST_OFFSET);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** An IST wall-clock time ("17:30") on a DATE value, as a real instant. */
export function istTimeOn(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(date.getTime() + (h * 60 + m) * 60000 - IST_OFFSET);
}

export const dateKey = (d: Date) => d.toISOString().slice(0, 10);

type Session = { checkIn: Date; checkOut: Date | null; workDate: Date };
type Rules = { workMinutesPerDay: number; overtimeAfterMins: number; weeklyOffDays: number[] };

export type DayStatus = AttendanceStatus | "IN_PROGRESS" | "NOT_YET";

export type DayResult = { status: DayStatus; worked: number; marked: boolean };

/** Minutes worked in a session. An open session only counts while it is still today. */
export function sessionMinutes(s: Session, now: Date): number {
  if (s.checkOut) return Math.max(0, Math.round((s.checkOut.getTime() - s.checkIn.getTime()) / 60000));
  if (dateKey(s.workDate) === dateKey(istDate(now))) return Math.max(0, Math.round((now.getTime() - s.checkIn.getTime()) / 60000));
  return 0;
}

/**
 * Status of one employee-day, following the Edubotics HR V1.2 rules:
 * worked ≥ target → Present; well past target → OD (overtime); some work → ID (incomplete);
 * a check-in that was never checked out → Mis-punch. An HR mark always wins.
 */
export function dayStatus(args: {
  date: Date;
  sessions: Session[];
  mark?: AttendanceStatus | null;
  onLeave: boolean;
  holiday: boolean;
  rules: Rules;
  now: Date;
}): DayResult {
  const { date, sessions, mark, onLeave, holiday, rules, now } = args;
  const worked = sessions.reduce((sum, s) => sum + sessionMinutes(s, now), 0);
  if (mark) return { status: mark, worked, marked: true };

  const today = istDate(now);
  const isToday = dateKey(date) === dateKey(today);
  const result = (status: DayStatus): DayResult => ({ status, worked, marked: false });

  if (date > today) return result(onLeave ? "LEAVE" : "NOT_YET");
  if (onLeave) return result("LEAVE");
  if (!isToday && sessions.some((s) => !s.checkOut)) return result("MISPUNCH");
  if (isToday && sessions.some((s) => !s.checkOut)) return result("IN_PROGRESS");

  const offDay = holiday || rules.weeklyOffDays.includes(date.getUTCDay());
  if (offDay) return result(worked > 0 ? "OVERTIME" : holiday ? "HOLIDAY" : "WEEKLY_OFF");

  if (worked === 0) return result(isToday ? "NOT_YET" : "ABSENT");
  if (worked >= rules.workMinutesPerDay + rules.overtimeAfterMins) return result("OVERTIME");
  if (worked >= rules.workMinutesPerDay) return result("PRESENT");
  return result(isToday ? "IN_PROGRESS" : "INCOMPLETE");
}

export const STATUS_LABEL: Record<DayStatus, string> = {
  PRESENT: "Present",
  INCOMPLETE: "ID · Incomplete",
  OVERTIME: "OD · Overtime",
  ABSENT: "Absent",
  LEAVE: "Leave",
  MISPUNCH: "Mis-punch",
  HOLIDAY: "Holiday",
  WEEKLY_OFF: "Weekly off",
  IN_PROGRESS: "Working",
  NOT_YET: "—",
};

export const STATUS_COLOR: Record<DayStatus, "green" | "amber" | "purple" | "gray" | "red" | "blue"> = {
  PRESENT: "green",
  INCOMPLETE: "amber",
  OVERTIME: "purple",
  ABSENT: "red",
  LEAVE: "blue",
  MISPUNCH: "red",
  HOLIDAY: "gray",
  WEEKLY_OFF: "gray",
  IN_PROGRESS: "blue",
  NOT_YET: "gray",
};

export function formatMinutes(m: number) {
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function monthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  for (let d = new Date(Date.UTC(year, month, 1)); d.getUTCMonth() === month; d = new Date(d.getTime() + 86400000)) days.push(d);
  return days;
}

/** "2026-10" → year/month (0-based) plus a label and neighbouring months; falls back to the current IST month. */
export function parseMonth(value: string | undefined, now: Date) {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  const today = istDate(now);
  const year = m ? Number(m[1]) : today.getUTCFullYear();
  const month = m ? Number(m[2]) - 1 : today.getUTCMonth();
  const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const shift = (n: number) => {
    const d = new Date(Date.UTC(year, month + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  return { year, month, label, prev: shift(-1), next: shift(1) };
}

export const formatTime = (d: Date | null) =>
  d ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—";
