import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMetricPath, recordRequest, reportServerError, telemetrySnapshot } from "../src/lib/telemetry";

test("metrics remove identifying path values and queries", () => {
  assert.equal(normalizeMetricPath("/careers/secret-job?email=private@example.com"), "/careers/[job]");
  assert.equal(normalizeMetricPath("/careers/abc/apply"), "/careers/[job]/apply");
  assert.equal(normalizeMetricPath("/hr/employees/person-name"), "other");
  assert.equal(normalizeMetricPath("/api/private/person-name"), "/api/*");
  assert.equal(normalizeMetricPath("/login?token=secret"), "/login");
});

test("metrics aggregate status classes and discard invalid durations", () => {
  recordRequest("/careers/private-one", 200, 10);
  recordRequest("/careers/private-two", 201, Infinity);
  const row = telemetrySnapshot().rows.find((value) => value.route === "/careers/[job]" && value.status === "2xx");
  assert.equal(row?.count, 2);
  assert.equal(row?.durationCount, 1);
  assert.equal(row?.durationTotal, 10);
  assert.equal(JSON.stringify(telemetrySnapshot()).includes("private-one"), false);
});

test("error logging excludes raw errors and identifying context", () => {
  const original = console.error;
  const logs: string[] = [];
  console.error = (value) => logs.push(String(value));
  try {
    const id = reportServerError(new Error("password=super-secret"), { path: "/hr/employees/private-person?token=secret" });
    assert.match(id, /^[a-f0-9-]{36}$/);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].includes("super-secret"), false);
    assert.equal(logs[0].includes("private-person"), false);
    assert.equal(telemetrySnapshot().errors.at(-1)?.route, "other");
  } finally { console.error = original; }
});

test("counters and error references expire within 24 hours", () => {
  const original = Date.now;
  const future = original() + 24 * 60 * 60 * 1000 + 1;
  Date.now = () => future;
  try {
    assert.equal(telemetrySnapshot().rows.length, 0);
    assert.equal(telemetrySnapshot().errors.length, 0);
  } finally { Date.now = original; }
});
