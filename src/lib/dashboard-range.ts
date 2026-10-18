/**
 * The date range the owner dashboard is read for, chosen at the top of the page and carried in the address
 * (?range=fy, or ?range=custom&from=2026-04-01&to=2026-06-30). Dates are UTC midnight, like Postgres DATE columns.
 */

const DAY = 86_400_000;
const MAX_DAYS = 3 * 366; // a custom range can cover up to three years

export const RANGE_PRESETS = [
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "30d", label: "Last 30 days" },
  { key: "quarter", label: "This quarter" },
  { key: "last-quarter", label: "Last quarter" },
  { key: "fy", label: "This financial year" },
  { key: "last-fy", label: "Last financial year" },
] as const;

export type RangeKey = (typeof RANGE_PRESETS)[number]["key"] | "custom";
export type BucketUnit = "day" | "week" | "month";

export type Bucket = { from: Date; to: Date; label: string };

export type DashboardRange = {
  key: RangeKey;
  label: string;
  from: Date;
  to: Date; // inclusive
  prevFrom: Date;
  prevTo: Date;
  unit: BucketUnit;
  buckets: Bucket[];
};

const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const lastOfMonth = (y: number, m: number) => utc(y, m + 1, 0);
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);

/** "2026-10-18" for a UTC-midnight date. */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The same day n months earlier or later, pulled back to the month's last day when it has fewer days. */
function addMonths(d: Date, n: number) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  return utc(y, m, Math.min(d.getUTCDate(), lastOfMonth(y, m).getUTCDate()));
}

/** 1 April of the Indian financial year the date falls in. */
export function financialYearStart(d: Date) {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return utc(y, 3, 1);
}

/** The first day of the quarter (Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar). */
function quarterStart(d: Date) {
  return utc(d.getUTCFullYear(), d.getUTCMonth() - (d.getUTCMonth() % 3), 1);
}

function parseDay(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || isoDay(d) !== value ? null : d;
}

/**
 * The period before, to compare with. Calendar periods step back a whole month, quarter or year and cover the same
 * stretch of it (1–18 Oct compares with 1–18 Sep); a period ending on a month's last day compares with a whole one.
 * Other ranges compare with the same number of days just before.
 */
function previous(from: Date, to: Date, months: number | null) {
  if (months === null) {
    const length = daysBetween(from, to) + 1;
    return { prevFrom: addDays(from, -length), prevTo: addDays(from, -1) };
  }
  const prevFrom = addMonths(from, -months);
  const endsMonth = isoDay(to) === isoDay(lastOfMonth(to.getUTCFullYear(), to.getUTCMonth()));
  const prevTo = endsMonth ? lastOfMonth(to.getUTCFullYear(), to.getUTCMonth() - months) : addMonths(to, -months);
  return { prevFrom, prevTo };
}

const dayLabel = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** Days for up to two weeks, weeks (from Monday) up to about three months, months beyond that. */
export function makeBuckets(from: Date, to: Date): { unit: BucketUnit; buckets: Bucket[] } {
  const days = daysBetween(from, to) + 1;
  const buckets: Bucket[] = [];
  if (days <= 14) {
    for (let d = from; d <= to; d = addDays(d, 1)) buckets.push({ from: d, to: d, label: dayLabel(d) });
    return { unit: "day", buckets };
  }
  if (days <= 92) {
    for (let start = from; start <= to; ) {
      const nextMonday = addDays(start, 7 - ((start.getUTCDay() + 6) % 7));
      const end = nextMonday > to ? to : addDays(nextMonday, -1);
      buckets.push({ from: start, to: end, label: dayLabel(start) });
      start = nextMonday;
    }
    return { unit: "week", buckets };
  }
  const withYear = from.getUTCFullYear() !== to.getUTCFullYear() && days > 366;
  for (let start = from; start <= to; ) {
    const monthEnd = lastOfMonth(start.getUTCFullYear(), start.getUTCMonth());
    const end = monthEnd > to ? to : monthEnd;
    const label = start.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC", ...(withYear ? { year: "2-digit" } : {}) });
    buckets.push({ from: start, to: end, label });
    start = addDays(monthEnd, 1);
  }
  return { unit: "month", buckets };
}

/** Index of the bucket a date falls in, or -1 outside the range. */
export function bucketIndex(buckets: Bucket[], d: Date) {
  const t = d.getTime();
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < buckets[mid].from.getTime()) hi = mid - 1;
    else if (t > buckets[mid].to.getTime()) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Read the range from the page address; anything missing or broken falls back to this month. */
export function readRange(sp: Record<string, string | string[] | undefined>, today: Date): DashboardRange {
  const key = typeof sp.range === "string" ? sp.range : "month";
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  let from: Date;
  let to = today;
  let months: number | null;
  switch (key) {
    case "last-month":
      from = utc(y, m - 1, 1);
      to = lastOfMonth(y, m - 1);
      months = 1;
      break;
    case "30d":
      from = addDays(today, -29);
      months = null;
      break;
    case "quarter":
      from = quarterStart(today);
      months = 3;
      break;
    case "last-quarter":
      from = addMonths(quarterStart(today), -3);
      to = addDays(quarterStart(today), -1);
      months = 3;
      break;
    case "fy":
      from = financialYearStart(today);
      months = 12;
      break;
    case "last-fy":
      from = addMonths(financialYearStart(today), -12);
      to = addDays(financialYearStart(today), -1);
      months = 12;
      break;
    case "custom": {
      let a = parseDay(sp.from);
      let b = parseDay(sp.to);
      if (a && b) {
        if (a > b) [a, b] = [b, a];
        if (b > today) b = today;
        if (a > b) a = b;
        if (daysBetween(a, b) >= MAX_DAYS) a = addDays(b, -(MAX_DAYS - 1));
        const { prevFrom, prevTo } = previous(a, b, null);
        return { key: "custom", label: rangeText(a, b), from: a, to: b, prevFrom, prevTo, ...makeBuckets(a, b) };
      }
      return monthRange(today);
    }
    default:
      return monthRange(today);
  }
  const preset = RANGE_PRESETS.find((p) => p.key === key)!;
  return { key: preset.key, label: preset.label, from, to, ...previous(from, to, months), ...makeBuckets(from, to) };
}

function monthRange(today: Date): DashboardRange {
  const from = utc(today.getUTCFullYear(), today.getUTCMonth(), 1);
  return { key: "month", label: "This month", from, to: today, ...previous(from, today, 1), ...makeBuckets(from, today) };
}

/** "1 Apr – 18 Oct 2026", or "1 Apr 2025 – 31 Mar 2026" across years, or "18 Oct 2026" for one day. */
export function rangeText(from: Date, to: Date) {
  const full = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  if (isoDay(from) === isoDay(to)) return full(to);
  if (from.getUTCFullYear() === to.getUTCFullYear()) return `${dayLabel(from)} – ${full(to)}`;
  return `${full(from)} – ${full(to)}`;
}

/** The address query for a range: "range=fy", or "range=custom&from=…&to=…" for a custom one or any part of a range. */
export function rangeQuery(r: { key: RangeKey; from: Date; to: Date } | { from: Date; to: Date }) {
  if ("key" in r && r.key !== "custom") return r.key === "month" ? "" : `range=${r.key}`;
  return `range=custom&from=${isoDay(r.from)}&to=${isoDay(r.to)}`;
}

/** Change from the previous period as a whole percentage, or null when there is nothing to compare with. */
export function percentChange(now: number, before: number) {
  if (before === 0) return null;
  return Math.round(((now - before) / Math.abs(before)) * 100);
}
