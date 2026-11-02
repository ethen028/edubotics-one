import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SCHOOLS_PER_ROUND, planRound, planSchool, roundDue, type SchoolFacts } from "../src/lib/reminder-rules";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const rules = { afterDays: 7, everyDays: 7, maxPerInvoice: 3 };
const school = (over: Partial<SchoolFacts> = {}): SchoolFacts => ({
  id: "s1",
  paused: false,
  email: "accounts@school.example",
  lastReminder: null,
  invoices: [{ id: "i1", dueDate: day("2026-10-01"), balance: 5000, autoReminders: 0 }],
  ...over,
});

test("a school is first reminded once an invoice is a week late", () => {
  assert.deepEqual(planSchool(school(), day("2026-10-07"), rules), { id: "s1", send: false, why: "not-due", nextOn: day("2026-10-08") });
  assert.deepEqual(planSchool(school(), day("2026-10-08"), rules), { id: "s1", send: true, invoiceIds: ["i1"] });
});

test("no school hears from us more often than the gap, reminders by hand included", () => {
  const lastReminder = new Date("2026-10-10T06:00:00Z"); // 11:30 AM India time on 10 Oct
  assert.equal(planSchool(school({ lastReminder }), day("2026-10-16"), rules).send, false);
  assert.equal(planSchool(school({ lastReminder }), day("2026-10-17"), rules).send, true);
});

test("days the app was off never add up: one reminder after a long gap, then the normal gap again", () => {
  const lastReminder = new Date("2026-09-01T05:00:00Z");
  const first = planSchool(school({ lastReminder }), day("2026-10-20"), rules);
  assert.equal(first.send, true);
  const next = planSchool(school({ lastReminder: new Date("2026-10-20T05:00:00Z") }), day("2026-10-21"), rules);
  assert.deepEqual(next, { id: "s1", send: false, why: "reminded-recently", nextOn: day("2026-10-27") });
});

test("one email lists every overdue invoice still under the limit; used-up invoices drop out", () => {
  const invoices = [
    { id: "old", dueDate: day("2026-08-01"), balance: 100, autoReminders: 3 },
    { id: "late", dueDate: day("2026-09-20"), balance: 100, autoReminders: 1 },
    { id: "recent", dueDate: day("2026-10-15"), balance: 100, autoReminders: 0 },
    { id: "future", dueDate: day("2026-11-01"), balance: 100, autoReminders: 0 },
    { id: "paid", dueDate: day("2026-09-01"), balance: 0, autoReminders: 0 },
  ];
  assert.deepEqual(planSchool(school({ invoices }), day("2026-10-18"), rules), { id: "s1", send: true, invoiceIds: ["late", "recent"] });
  const usedUp = invoices.map((i) => ({ ...i, autoReminders: 3 }));
  assert.deepEqual(planSchool(school({ invoices: usedUp }), day("2026-10-18"), rules), { id: "s1", send: false, why: "limit-reached", nextOn: null });
});

test("a stopped school or one with no email address is never sent to", () => {
  assert.equal(planSchool(school({ paused: true }), day("2026-10-18"), rules).send, false);
  assert.deepEqual(planSchool(school({ email: null }), day("2026-10-18"), rules), { id: "s1", send: false, why: "no-email", nextOn: null });
});

test("the round goes out once a working day, from 10 AM to 6 PM India time", () => {
  const working = () => false;
  assert.equal(roundDue(new Date("2026-10-19T04:00:00Z"), null, working), false); // 9:30 AM
  assert.equal(roundDue(new Date("2026-10-19T04:30:00Z"), null, working), true); // 10 AM
  assert.equal(roundDue(new Date("2026-10-19T12:30:00Z"), null, working), false); // 6 PM
  assert.equal(roundDue(new Date("2026-10-19T05:00:00Z"), day("2026-10-19"), working), false); // already sent today
  assert.equal(roundDue(new Date("2026-10-19T05:00:00Z"), day("2026-10-12"), working), true);
  const sunday = (d: Date) => d.getUTCDay() === 0;
  assert.equal(roundDue(new Date("2026-10-18T05:00:00Z"), null, sunday), false);
});

test("a round is capped and starts with the longest overdue schools", () => {
  const many = Array.from({ length: MAX_SCHOOLS_PER_ROUND + 5 }, (_, n) =>
    school({ id: `s${n}`, invoices: [{ id: `i${n}`, dueDate: new Date(day("2026-09-01").getTime() + n * 86400000), balance: 1, autoReminders: 0 }] }),
  );
  const round = planRound(many.reverse(), day("2026-10-18"), rules);
  assert.equal(round.length, MAX_SCHOOLS_PER_ROUND);
  assert.equal(round[0].id, "s0");
});
