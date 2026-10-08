/** Daily work log helpers (from Task Flow's worksheet). Shared by the server action and the form. */

/** The office lunch break, left out of logged hours. */
export const LUNCH = { start: "13:00", end: "14:00" };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Minutes worked between two "HH:MM" times, minus any overlap with lunch. Null if the end isn't after the start. */
export function workedMinutes(start: string, end: string) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (!(e > s)) return null;
  const overlap = Math.max(0, Math.min(e, toMinutes(LUNCH.end)) - Math.max(s, toMinutes(LUNCH.start)));
  return e - s - overlap;
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} hr ${m} min`;
  return h ? `${h} hr` : `${m} min`;
}

export const DAILY_STATUS_LABEL = {
  COMPLETED: "Completed",
  IN_PROGRESS: "In progress",
  PENDING: "Pending",
  BLOCKED: "Blocked",
} as const;
