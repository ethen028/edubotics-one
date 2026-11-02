import assert from "node:assert/strict";
import test from "node:test";
import { dateOnlyInput, optionalDateOnlyInput, timeInput } from "../src/lib/date-input";
import { leaveDaysInYear, parseDateOnly } from "../src/lib/leave";

test("HR and stock forms reject impossible dates without throwing", () => {
  for (const value of ["0000-01-01", "2026-02-29", "2026-02-31", "2026-13-01", "tomorrow", ""]) assert.equal(dateOnlyInput.safeParse(value).success, false);
  assert.equal(dateOnlyInput.parse("2028-02-29").toISOString(), "2028-02-29T00:00:00.000Z");
  assert.equal(optionalDateOnlyInput.parse("  "), null);
  assert.equal(optionalDateOnlyInput.safeParse("2026-04-31").success, false);
});
test("cross-year leave charges each year's working days and keeps saved single-year totals", () => {
  const request = { startDate: parseDateOnly("2026-12-30"), endDate: parseDateOnly("2027-01-04"), days: 5, halfDay: false };
  assert.equal(leaveDaysInYear(request, 2026, [], [0]), 2);
  assert.equal(leaveDaysInYear(request, 2027, [], [0]), 3);
  assert.equal(leaveDaysInYear(request, 2027, [parseDateOnly("2027-01-01")], [0]), 2);
  assert.equal(leaveDaysInYear({ ...request, endDate: request.startDate, days: .5 }, 2026, [], [0]), .5);
  assert.throws(() => parseDateOnly("2026-02-31"), /Invalid date/);
});
test("attendance times stay within the same valid day", () => {
  for (const value of ["24:00", "12:60", "99:99", "9:30"]) assert.equal(timeInput.safeParse(value).success, false);
  assert.equal(timeInput.parse("23:59"), "23:59");
});
