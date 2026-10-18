// Checks for the operating calendar: the monthly rhythm, the Green / Amber / Red suggestion and sales commission.
// Run with `npm test`. Pure functions only: no database needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OPERATING_CALENDAR,
  firstWorkingDay,
  lastWorkingDays,
  monthRhythm,
  needsUpdate,
  parseMonth,
  percent,
  reviewDays,
  suggestRag,
} from "../src/lib/plan-rules";
import { byPerson, commissionFor } from "../src/lib/commission-math";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const day = (x: Date) => x.toISOString().slice(0, 10);
const gandhiJayanthi = d("2026-10-02");

test("the calendar covers June 2026 to May 2027, one entry a month", () => {
  assert.equal(OPERATING_CALENDAR.length, 12);
  assert.equal(OPERATING_CALENDAR[0].month, "2026-06");
  assert.equal(OPERATING_CALENDAR[11].month, "2027-05");
  assert.equal(new Set(OPERATING_CALENDAR.map((m) => m.month)).size, 12);
});

test("first working day skips Sundays and holidays", () => {
  assert.equal(day(firstWorkingDay(d("2026-11-01"), [])), "2026-11-02"); // 1 Nov 2026 is a Sunday
  assert.equal(day(firstWorkingDay(d("2026-10-01"), [d("2026-10-01"), gandhiJayanthi])), "2026-10-03");
});

test("weekly reviews fall on Saturdays that aren't holidays", () => {
  assert.deepEqual(reviewDays(d("2026-10-01"), []).map(day), ["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]);
  assert.deepEqual(reviewDays(d("2026-10-01"), [d("2026-10-10")]).map(day), ["2026-10-03", "2026-10-17", "2026-10-24", "2026-10-31"]);
});

test("month results go on the last two working days", () => {
  assert.deepEqual(lastWorkingDays(d("2026-10-01"), []).map(day), ["2026-10-30", "2026-10-31"]);
  assert.deepEqual(lastWorkingDays(d("2026-05-01"), []).map(day), ["2026-05-29", "2026-05-30"]); // 31 May 2026 is a Sunday
});

test("the month's rhythm has the planning meeting, Friday updates, reviews and the commission date", () => {
  const events = monthRhythm(d("2026-10-01"), [gandhiJayanthi]);
  assert.equal(day(events[0].date), "2026-10-01");
  assert.equal(events[0].title, "Monthly planning meeting");
  const fridays = events.filter((e) => e.title.startsWith("Update")).map((e) => day(e.date));
  assert.deepEqual(fridays, ["2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"]); // 2 Oct is a holiday
  assert.ok(events.some((e) => e.title === "Commission statement due" && day(e.date) === "2026-10-05"));
  // A planning meeting set by hand wins over the first working day.
  const set = monthRhythm(d("2026-10-01"), [], new Date("2026-10-05T04:30:00Z")).find((e) => e.title === "Monthly planning meeting");
  assert.equal(day(set!.date), "2026-10-05");
});

test("Green / Amber / Red follows the pace towards the target", () => {
  const base = { status: "IN_PROGRESS" as const, target: 20, deadline: d("2026-10-31"), monthStart: d("2026-10-01") };
  const mid = d("2026-10-16"); // about halfway
  assert.equal(suggestRag({ ...base, actual: 10 }, mid), "GREEN");
  assert.equal(suggestRag({ ...base, actual: 8 }, mid), "AMBER");
  assert.equal(suggestRag({ ...base, actual: 4 }, mid), "RED");
  assert.equal(suggestRag({ ...base, actual: 20 }, mid), "GREEN");
  assert.equal(suggestRag({ ...base, actual: 0 }, d("2026-10-01")), null); // too early to judge
  assert.equal(suggestRag({ ...base, status: "BLOCKED", actual: 15 }, mid), "RED");
});

test("an overdue task is Amber when it is nearly there and Red otherwise", () => {
  const base = { status: "IN_PROGRESS" as const, target: 10, deadline: d("2026-10-10"), monthStart: d("2026-10-01") };
  assert.equal(suggestRag({ ...base, actual: 8 }, d("2026-10-12")), "AMBER");
  assert.equal(suggestRag({ ...base, actual: 3 }, d("2026-10-12")), "RED");
  // Without a number: done is Green, overdue is Red, otherwise no suggestion.
  const plain = { ...base, target: null, actual: null };
  assert.equal(suggestRag({ ...plain, status: "DONE" }, d("2026-10-12")), "GREEN");
  assert.equal(suggestRag(plain, d("2026-10-12")), "RED");
  assert.equal(suggestRag(plain, d("2026-10-05")), null);
});

test("a task needs an update once a new week starts", () => {
  const saturday = d("2026-10-17");
  assert.equal(needsUpdate({ status: "IN_PROGRESS", lastUpdateAt: null }, saturday), true);
  assert.equal(needsUpdate({ status: "IN_PROGRESS", lastUpdateAt: d("2026-10-16") }, saturday), false);
  assert.equal(needsUpdate({ status: "IN_PROGRESS", lastUpdateAt: d("2026-10-10") }, saturday), true);
  assert.equal(needsUpdate({ status: "DONE", lastUpdateAt: null }, saturday), false);
});

test("percent and month parsing", () => {
  assert.equal(percent(150, 600), 25);
  assert.equal(percent(5, null), null);
  assert.equal(day(parseMonth("2026-10")!), "2026-10-01");
  assert.equal(parseMonth("October"), null);
});

test("commission is 5% of what was received without GST", () => {
  // ₹1,18,000 invoice (₹1,00,000 + 18% GST) paid in full: base ₹1,00,000, commission ₹5,000.
  assert.deepEqual(commissionFor(118000, 100000, 118000, 5), { base: 100000, commission: 5000 });
  // Half paid: half the base.
  assert.deepEqual(commissionFor(59000, 100000, 118000, 5), { base: 50000, commission: 2500 });
  assert.deepEqual(commissionFor(1000, 0, 0, 5), { base: 0, commission: 0 });
});

test("commission adds up per person, biggest first", () => {
  const rows = [
    { userId: "a", userName: "Rahul", base: 1000, commission: 50 },
    { userId: "b", userName: "Sneha", base: 5000, commission: 250 },
    { userId: "a", userName: "Rahul", base: 2000.5, commission: 100.03 },
  ];
  assert.deepEqual(byPerson(rows), [
    { userId: "b", name: "Sneha", base: 5000, commission: 250, count: 1 },
    { userId: "a", name: "Rahul", base: 3000.5, commission: 150.03, count: 2 },
  ]);
});
