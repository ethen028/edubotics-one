/**
 * When a checklist is due. Pure date maths, no database: dates are UTC midnight like Postgres DATE,
 * times are India time.
 *
 * Each checklist turns into "slots": one per working day (daily), week (weekly), month (monthly)
 * or school session. A slot opens, is due at its due time, and closes at the end of its period.
 * Ticking is allowed while it's open; anything not finished when it closes counts as missed.
 */
import type { ChecklistFrequency } from "@prisma/client";

const DAY = 86_400_000;
const IST_OFFSET = 5.5 * 3600 * 1000;

export const FREQUENCY_LABEL: Record<ChecklistFrequency, string> = {
  DAILY: "Every working day",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  SESSION: "Before each school session",
};

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Session checklists show up this many days before the class, so kit can be packed the day before. */
export const SESSION_LEAD_DAYS = 1;

export type Slot = {
  periodKey: string; // "2026-10-07" or "session-<id>"
  dueDate: Date;
  opensAt: Date;
  dueAt: Date;
  closesAt: Date;
  sessionId?: string;
};

export type SlotStatus = "DONE" | "LATE" | "DUE" | "OVERDUE" | "MISSED" | "UPCOMING";

export const STATUS_LABEL: Record<SlotStatus, string> = {
  DONE: "Done",
  LATE: "Done late",
  DUE: "To do",
  OVERDUE: "Overdue",
  MISSED: "Missed",
  UPCOMING: "Not open yet",
};

export const STATUS_COLOR: Record<SlotStatus, "green" | "amber" | "red" | "blue" | "gray"> = {
  DONE: "green",
  LATE: "amber",
  DUE: "blue",
  OVERDUE: "red",
  MISSED: "red",
  UPCOMING: "gray",
};

export const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
/** An India-time clock time on a date, as a real instant. */
const at = (date: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(date.getTime() + (h * 60 + m) * 60_000 - IST_OFFSET);
};
/** Midnight India time at the end of a date. */
const endOf = (date: Date) => new Date(date.getTime() + DAY - IST_OFFSET);

export type Calendar = { weeklyOffDays: number[]; holidays: Set<string> };

export const isWorkingDay = (d: Date, cal: Calendar) => !cal.weeklyOffDays.includes(d.getUTCDay()) && !cal.holidays.has(dateKey(d));

function lastWorkingDay(year: number, month: number, cal: Calendar) {
  let d = new Date(Date.UTC(year, month + 1, 0));
  for (let i = 0; i < 10 && !isWorkingDay(d, cal); i++) d = addDays(d, -1);
  return d;
}

type Schedule = {
  frequency: ChecklistFrequency;
  weekday: number | null;
  dayOfMonth: number | null;
  dueTime: string | null;
  startsOn: Date;
};

function slot(periodKey: string, dueDate: Date, opens: Date, closes: Date, dueTime: string | null, sessionId?: string): Slot {
  const closesAt = endOf(closes);
  return { periodKey, dueDate, opensAt: at(opens, "00:00"), dueAt: dueTime ? at(dueDate, dueTime) : endOf(dueDate), closesAt, sessionId };
}

/**
 * Day, week and month slots whose period overlaps from..to (dates, inclusive).
 * Weeks run Monday to Sunday. Nothing before the checklist's start date.
 */
export function periodSlots(t: Schedule, from: Date, to: Date, cal: Calendar): Slot[] {
  const out: Slot[] = [];
  if (t.frequency === "DAILY") {
    for (let d = from < t.startsOn ? t.startsOn : from; d <= to; d = addDays(d, 1)) {
      if (isWorkingDay(d, cal)) out.push(slot(dateKey(d), d, d, d, t.dueTime));
    }
  } else if (t.frequency === "WEEKLY") {
    const monday = addDays(from, -((from.getUTCDay() + 6) % 7));
    for (let w = monday; w <= to; w = addDays(w, 7)) {
      const due = addDays(w, ((t.weekday ?? 1) + 6) % 7);
      if (due >= t.startsOn) out.push(slot(dateKey(due), due, w < t.startsOn ? t.startsOn : w, addDays(w, 6), t.dueTime));
    }
  } else if (t.frequency === "MONTHLY") {
    for (let first = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); first <= to; ) {
      const y = first.getUTCFullYear();
      const m = first.getUTCMonth();
      const last = new Date(Date.UTC(y, m + 1, 0));
      const due = t.dayOfMonth ? new Date(Date.UTC(y, m, Math.min(t.dayOfMonth, last.getUTCDate()))) : lastWorkingDay(y, m, cal);
      if (due >= t.startsOn) out.push(slot(dateKey(due), due, first < t.startsOn ? t.startsOn : first, last, t.dueTime));
      first = new Date(Date.UTC(y, m + 1, 1));
    }
  }
  return out;
}

/** A school session's slot: opens the day before, due when the class starts, closes at the end of that day. */
export function sessionSlot(s: { id: string; date: Date; startTime: string }): Slot {
  return slot(`session-${s.id}`, s.date, addDays(s.date, -SESSION_LEAD_DAYS), s.date, s.startTime, s.id);
}

export function slotStatus(s: Slot, completedAt: Date | null | undefined, now: Date): SlotStatus {
  if (completedAt) return completedAt <= s.dueAt ? "DONE" : "LATE";
  if (now >= s.closesAt) return "MISSED";
  if (now < s.opensAt) return "UPCOMING";
  return now >= s.dueAt ? "OVERDUE" : "DUE";
}

/** "today", "tomorrow", "yesterday" or "Sat 12 Oct". */
export function dayWord(date: Date, today: Date) {
  const diff = Math.round((date.getTime() - today.getTime()) / DAY);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "by 10:00 am today", "by end of Sat 12 Oct" */
export function dueLabel(s: Slot, dueTime: string | null, today: Date) {
  const day = dayWord(s.dueDate, today);
  return dueTime ? `by ${clock(dueTime)} ${day}` : `by end of ${day}`;
}

export function clock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** How often, in a short phrase: "Every working day by 9:30 am", "Fridays", "Last working day of the month". */
export function scheduleLabel(t: Pick<Schedule, "frequency" | "weekday" | "dayOfMonth" | "dueTime">) {
  const by = t.dueTime && t.frequency !== "SESSION" ? ` by ${clock(t.dueTime)}` : "";
  switch (t.frequency) {
    case "DAILY":
      return `Every working day${by}`;
    case "WEEKLY":
      return `Every ${WEEKDAY_NAMES[t.weekday ?? 1]}${by}`;
    case "MONTHLY":
      return `${t.dayOfMonth ? `Day ${t.dayOfMonth} of each month` : "Last working day of each month"}${by}`;
    case "SESSION":
      return "Before each school session";
  }
}
