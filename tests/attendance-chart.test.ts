import assert from "node:assert/strict";
import test from "node:test";
import { heatCell, heatWeeks } from "../src/lib/attendance";

const TARGET = 480; // 8 hours

test("attendance chart shades a day by how much of the target was worked", () => {
  assert.equal(heatCell({ status: "ABSENT", worked: 0, marked: false }, false, TARGET), 0);
  assert.equal(heatCell({ status: "INCOMPLETE", worked: 200, marked: false }, false, TARGET), 1);
  assert.equal(heatCell({ status: "INCOMPLETE", worked: 240, marked: false }, false, TARGET), 2);
  assert.equal(heatCell({ status: "PRESENT", worked: 480, marked: false }, false, TARGET), 3);
  assert.equal(heatCell({ status: "OVERTIME", worked: 600, marked: false }, false, TARGET), 4);
  // HR marked someone present without punches: still a full day, not an empty one.
  assert.equal(heatCell({ status: "PRESENT", worked: 0, marked: true }, false, TARGET), 3);
  assert.equal(heatCell({ status: "MISPUNCH", worked: 0, marked: false }, false, TARGET), 0);
});

test("attendance chart keeps leave, days off and the future apart from absence", () => {
  assert.equal(heatCell({ status: "LEAVE", worked: 0, marked: false }, false, TARGET), "leave");
  assert.equal(heatCell({ status: "HOLIDAY", worked: 0, marked: false }, false, TARGET), "off");
  assert.equal(heatCell({ status: "WEEKLY_OFF", worked: 0, marked: false }, false, TARGET), "off");
  assert.equal(heatCell({ status: "NOT_YET", worked: 0, marked: false }, false, TARGET), "future");
  assert.equal(heatCell({ status: "ABSENT", worked: 0, marked: false }, true, TARGET), "future");
});

test("attendance chart weeks run Sunday to Saturday and end on the week holding today", () => {
  const today = new Date("2026-11-04T00:00:00Z"); // a Wednesday
  const weeks = heatWeeks(today, 26);
  assert.equal(weeks.length, 26);
  const last = weeks[25].days;
  assert.equal(last[0].toISOString().slice(0, 10), "2026-11-01");
  assert.equal(last[6].toISOString().slice(0, 10), "2026-11-07");
  assert.equal(weeks[0].days[0].getUTCDay(), 0);
  assert.equal(weeks[0].days[0].toISOString().slice(0, 10), "2026-05-10");
  // Month names on the first week and on weeks that hold the 1st.
  assert.equal(weeks[0].month, "May");
  assert.deepEqual(
    weeks.filter((w) => w.month).map((w) => w.month),
    ["May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov"],
  );
});
