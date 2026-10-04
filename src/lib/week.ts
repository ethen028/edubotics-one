/** Week helpers for timesheets. Weeks start on Monday; dates are UTC midnight like Postgres DATE. */

const DAY = 86400000;

export function mondayOf(d: Date) {
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0 … Sunday = 6
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offset));
}

export function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * DAY);
}

export function weekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}
