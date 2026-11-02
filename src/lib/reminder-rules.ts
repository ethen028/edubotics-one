/*
 * The rules for automatic payment reminders, kept free of the database so they can be tested.
 * src/lib/payment-reminders.ts loads the facts, asks these rules who is due, and sends.
 */

const DAY = 24 * 3600 * 1000;
const IST_OFFSET = 5.5 * 3600 * 1000;

/** Reminders go out from 10 AM India time. A computer switched on later the same day still sends, until 6 PM. */
export const SEND_FROM_HOUR = 10;
export const SEND_UNTIL_HOUR = 18;
/** At most this many schools in one day's round, to stay well inside Gmail's sending limits. The rest go the next day. */
export const MAX_SCHOOLS_PER_ROUND = 25;

export type ReminderSettings = { afterDays: number; everyDays: number; maxPerInvoice: number };

export type OpenInvoice = {
  id: string;
  dueDate: Date; // UTC midnight of the India-time due date
  balance: number;
  autoReminders: number; // automatic reminders already sent for this invoice
};

export type SchoolFacts = {
  id: string;
  paused: boolean;
  email: string | null;
  lastReminder: Date | null; // the newest payment reminder that went out, by hand or automatic
  invoices: OpenInvoice[];
};

export type SchoolPlan =
  | { id: string; send: true; invoiceIds: string[] }
  | { id: string; send: false; why: "paused" | "no-email" | "not-due" | "reminded-recently" | "limit-reached"; nextOn: Date | null };

const daysLate = (today: Date, due: Date) => Math.round((today.getTime() - due.getTime()) / DAY);

/** India-time hour and day (as UTC midnight) for a moment. */
export function indiaClock(now: Date) {
  const ist = new Date(now.getTime() + IST_OFFSET);
  return { hour: ist.getUTCHours(), day: new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate())) };
}

/** Whether today's round may go out now: a working day, inside sending hours, and not already sent today. */
export function roundDue(now: Date, lastRunOn: Date | null, dayOff: (day: Date) => boolean) {
  const { hour, day } = indiaClock(now);
  if (hour < SEND_FROM_HOUR || hour >= SEND_UNTIL_HOUR) return false;
  if (dayOff(day)) return false;
  return !lastRunOn || lastRunOn.getTime() < day.getTime();
}

/**
 * Whether a school gets a reminder today, and which invoices it lists.
 *
 * A school is reminded once its oldest unpaid invoice is `afterDays` past due, and then no more
 * often than every `everyDays` (counting reminders sent by hand). Each school gets one email listing
 * all its overdue invoices. An invoice drops out after `maxPerInvoice` automatic reminders.
 * Because the gap is measured from the last reminder actually sent, days when the app was off
 * never add up: the next round sends one reminder, not one for every missed day.
 */
export function planSchool(school: SchoolFacts, today: Date, s: ReminderSettings): SchoolPlan {
  const open = school.invoices.filter((i) => i.balance > 0 && daysLate(today, i.dueDate) > 0 && i.autoReminders < s.maxPerInvoice);
  const ripe = open.filter((i) => daysLate(today, i.dueDate) >= s.afterDays);
  const firstOn = open.length ? new Date(Math.min(...open.map((i) => i.dueDate.getTime())) + s.afterDays * DAY) : null;
  const gapOn = school.lastReminder ? new Date(indiaClock(school.lastReminder).day.getTime() + s.everyDays * DAY) : null;
  const nextOn = firstOn && gapOn ? new Date(Math.max(firstOn.getTime(), gapOn.getTime())) : firstOn;

  if (school.paused) return { id: school.id, send: false, why: "paused", nextOn: null };
  const overdue = school.invoices.some((i) => i.balance > 0 && daysLate(today, i.dueDate) > 0);
  if (overdue && open.length === 0) return { id: school.id, send: false, why: "limit-reached", nextOn: null };
  if (ripe.length === 0) return { id: school.id, send: false, why: "not-due", nextOn };
  if (!school.email) return { id: school.id, send: false, why: "no-email", nextOn: null };
  if (gapOn && gapOn.getTime() > today.getTime()) return { id: school.id, send: false, why: "reminded-recently", nextOn };
  return { id: school.id, send: true, invoiceIds: open.map((i) => i.id) };
}

/** Today's round: the schools to email, most overdue first, at most MAX_SCHOOLS_PER_ROUND. */
export function planRound(schools: SchoolFacts[], today: Date, s: ReminderSettings) {
  const oldest = (f: SchoolFacts) => Math.min(...f.invoices.map((i) => i.dueDate.getTime()));
  return schools
    .map((f) => ({ facts: f, plan: planSchool(f, today, s) }))
    .filter((x): x is { facts: SchoolFacts; plan: Extract<SchoolPlan, { send: true }> } => x.plan.send)
    .sort((a, b) => oldest(a.facts) - oldest(b.facts))
    .slice(0, MAX_SCHOOLS_PER_ROUND)
    .map((x) => x.plan);
}
