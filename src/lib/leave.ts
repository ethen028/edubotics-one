/** Date-only helpers. All leave dates are stored as UTC midnight (Postgres DATE). */

export function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid date");
  return new Date(`${value}T00:00:00.000Z`);
}

const key = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Working days between start and end (inclusive), skipping Sundays and
 * company holidays. Second Saturdays are working days unless listed as holidays.
 */
export function countLeaveDays(start: Date, end: Date, holidays: Date[], halfDay = false): number {
  if (end < start) return 0;
  const off = new Set(holidays.map(key));
  let days = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0 || off.has(key(d))) continue;
    days += 1;
  }
  if (halfDay && days > 0) return days === 1 ? 0.5 : days - 0.5;
  return days;
}

export function yearBounds(year: number) {
  return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
}
