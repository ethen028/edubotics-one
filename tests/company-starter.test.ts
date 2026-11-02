import { test } from "node:test";
import assert from "node:assert/strict";
import { holidaysToAdd, starterHolidays } from "../src/lib/company-starter";

const rows = starterHolidays(new Date("2026-10-28T00:00:00Z"));
const years = (list: { date: Date }[]) => [...new Set(list.map((h) => h.date.getUTCFullYear()))].sort();

test("a new company gets the starter holidays for this year and next", () => {
  assert.deepEqual(years(holidaysToAdd(rows, new Set())), [2026, 2027]);
  assert.ok(rows.some((h) => h.name === "Christmas" && h.date.toISOString().startsWith("2026-12-25")));
});

test("a year that already has holidays is left alone, so deleted holidays stay deleted", () => {
  const added = holidaysToAdd(rows, new Set([2026]));
  assert.deepEqual(years(added), [2027]);
  assert.equal(holidaysToAdd(rows, new Set([2026, 2027])).length, 0);
});
