import assert from "node:assert/strict";
import test from "node:test";
import { bucketIndex, isoDay, readRange } from "../src/lib/dashboard-range";

const today = new Date("2026-10-18T00:00:00Z");

test("this month compares with the same days of last month", () => {
  const r = readRange({}, today);
  assert.equal(isoDay(r.from), "2026-10-01");
  assert.equal(isoDay(r.prevFrom), "2026-09-01");
  assert.equal(isoDay(r.prevTo), "2026-09-18");
  assert.equal(r.unit, "week");
});

test("financial years run April to March", () => {
  const fy = readRange({ range: "fy" }, today);
  assert.equal(isoDay(fy.from), "2026-04-01");
  assert.equal(fy.unit, "month");
  const last = readRange({ range: "last-fy" }, today);
  assert.equal(isoDay(last.from), "2025-04-01");
  assert.equal(isoDay(last.to), "2026-03-31");
  assert.equal(isoDay(last.prevTo), "2025-03-31");
  assert.equal(last.buckets.length, 12);
});

test("custom ranges are ordered, stop at today, and broken ones fall back to this month", () => {
  const r = readRange({ range: "custom", from: "2026-10-30", to: "2026-10-10" }, today);
  assert.equal(isoDay(r.from), "2026-10-10");
  assert.equal(isoDay(r.to), "2026-10-18");
  assert.equal(r.unit, "day");
  assert.equal(readRange({ range: "custom", from: "2026-02-30", to: "x" }, today).key, "month");
});

test("every day of the range falls in exactly one bucket", () => {
  const r = readRange({ range: "quarter" }, today);
  for (let d = r.from; d <= r.to; d = new Date(d.getTime() + 86_400_000)) assert.ok(bucketIndex(r.buckets, d) >= 0);
  assert.equal(bucketIndex(r.buckets, new Date("2026-09-30T00:00:00Z")), -1);
});
