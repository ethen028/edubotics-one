/** Date-only helpers. All leave dates are stored as UTC midnight (Postgres DATE). */

export function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid date");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value.startsWith("0000")) throw new Error("Invalid date");
  return date;
}

const key = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Working days between start and end (inclusive), skipping the company's weekly
 * off days (0 = Sunday … 6 = Saturday) and holidays.
 */
export function countLeaveDays(
  start: Date,
  end: Date,
  holidays: Date[],
  halfDay = false,
  weeklyOffDays: number[] = [0],
): number {
  if (end < start) return 0;
  const off = new Set(holidays.map(key));
  let days = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (weeklyOffDays.includes(d.getUTCDay()) || off.has(key(d))) continue;
    days += 1;
  }
  if (halfDay && days > 0) return days === 1 ? 0.5 : days - 0.5;
  return days;
}

export function yearBounds(year: number) {
  return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
}

/** Keep saved single-year totals; allocate a crossing request to the working days in this year. */
export function leaveDaysInYear(request: { startDate: Date; endDate: Date; days: number; halfDay: boolean }, year: number, holidays: Date[], weeklyOffDays: number[]) {
  if (request.startDate.getUTCFullYear() === request.endDate.getUTCFullYear()) return request.startDate.getUTCFullYear() === year ? request.days : 0;
  const from = new Date(Math.max(request.startDate.getTime(), Date.UTC(year, 0, 1)));
  const to = new Date(Math.min(request.endDate.getTime(), Date.UTC(year, 11, 31)));
  return countLeaveDays(from, to, holidays, false, weeklyOffDays);
}
