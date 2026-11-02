import assert from "node:assert/strict";
import test from "node:test";
import { checkHealth } from "../src/lib/health";

test("health is ready after a successful database check", async () => {
  assert.deepEqual(await checkHealth(async () => 1), { status: "ok" });
});

test("health is unavailable when the database rejects", async () => {
  assert.deepEqual(await checkHealth(async () => { throw new Error("offline"); }), { status: "unavailable" });
});

test("health is unavailable when the database check exceeds its deadline", async () => {
  assert.deepEqual(await checkHealth(() => new Promise(() => {}), 5), { status: "unavailable" });
});
