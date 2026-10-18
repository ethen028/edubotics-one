// Checks for rewards and recognition: milestones, the monthly tally and who may highlight or remove.
// Run with `npm test`. Pure functions only: no database needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canFeature, canRemove, isRecognitionValue, milestones, spotlightSince, tally } from "../src/lib/recognition-rules";

const thanks = (...values: string[]) => values.map((value) => ({ value }));

test("no recognition, no milestones, first one is next", () => {
  const m = milestones([], 0);
  assert.deepEqual(m.done, []);
  assert.deepEqual(m.next, { label: "First recognition", have: 0, need: 1 });
});

test("received milestones step up at 1, 5 and 10", () => {
  const five = milestones(thanks("Thank you", "Thank you", "Thank you", "Thank you", "Thank you"), 0);
  assert.deepEqual(five.done.map((d) => d.key), ["received-1", "received-5"]);
  assert.deepEqual(five.next, { label: "10 recognitions", have: 5, need: 10 });
});

test("all-rounder needs four different values", () => {
  assert.ok(!milestones(thanks("Team player", "Problem solver", "Thank you"), 0).done.some((d) => d.key === "all-rounder"));
  assert.ok(milestones(thanks("Team player", "Problem solver", "Thank you", "Always learning"), 0).done.some((d) => d.key === "all-rounder"));
});

test("giving thanks earns its own milestones", () => {
  assert.deepEqual(milestones([], 4).done, []);
  assert.deepEqual(milestones([], 20).done.map((d) => d.key), ["given-5", "given-20"]);
});

test("after 50 there is no next milestone", () => {
  assert.equal(milestones(thanks(...Array(50).fill("Thank you")), 0).next, null);
});

test("monthly tally counts per person, most first, ties by name", () => {
  const row = (toId: string, name: string) => ({ toId, to: { name } });
  const t = tally([row("b", "Bina"), row("a", "Anu"), row("b", "Bina"), row("c", "Arun")]);
  assert.deepEqual(t.map((x) => [x.name, x.count]), [["Bina", 2], ["Anu", 1], ["Arun", 1]]);
});

test("only managers, HR and admins put recognition in the spotlight", () => {
  assert.ok(canFeature({ role: "ADMIN" }));
  assert.ok(canFeature({ role: "MANAGER" }));
  assert.ok(canFeature({ role: "HR" }));
  assert.ok(!canFeature({ role: "EMPLOYEE" }));
});

test("the giver or an admin can remove a recognition, nobody else", () => {
  const r = { fromId: "giver" };
  assert.ok(canRemove({ id: "giver", role: "EMPLOYEE" }, r));
  assert.ok(canRemove({ id: "boss", role: "ADMIN" }, r));
  assert.ok(!canRemove({ id: "someone", role: "MANAGER" }, r));
});

test("values are a fixed list and the spotlight lasts 30 days", () => {
  assert.ok(isRecognitionValue("Team player"));
  assert.ok(!isRecognitionValue("Bonus"));
  assert.equal(spotlightSince(new Date("2026-10-31T00:00:00Z")).toISOString(), "2026-10-01T00:00:00.000Z");
});
