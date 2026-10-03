const DAY = 24 * 3600 * 1000;
const IST_OFFSET = 5.5 * 3600 * 1000;

/** A moment n days from now (negative for the past). */
export function daysFromNow(n: number) {
  return new Date(Date.now() + n * DAY);
}

/** Start of tomorrow in India time, as a UTC instant. */
export function startOfTomorrowIST() {
  const ist = new Date(Date.now() + IST_OFFSET);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1) - IST_OFFSET);
}

/** Today's date in India time, as UTC midnight (matches Postgres DATE columns). */
export function todayIST() {
  const ist = new Date(Date.now() + IST_OFFSET);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}
