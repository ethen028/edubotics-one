import test from "node:test";
import assert from "node:assert/strict";
import { PERMISSION_ROWS, ROLES, ROLE_COLUMNS, canAccessEmployeeDocument, canManagePeople, dashboardsFor, homeDashboard, isHrOrAdmin, isOwner } from "../src/lib/permissions";

test("HR has people privileges independently of managers and administrators", () => {
  for (const role of ROLES) {
    assert.equal(isHrOrAdmin({ role }), role === "ADMIN" || role === "HR");
    assert.equal(canManagePeople({ role }), role !== "EMPLOYEE");
  }
});
test("HR documents deny unknown and compensation categories by default", () => {
  const user = { role: "HR" as const, employee: { id: "self" } };
  for (const type of ["Other", "Offer letter", "Bank details", "Salary slip", "Experience letter", "Resume payroll"]) {
    assert.equal(canAccessEmployeeDocument(user, { employeeId: "other", type }), false);
    assert.equal(canAccessEmployeeDocument(user, { employeeId: "self", type }), true);
  }
  assert.equal(canAccessEmployeeDocument(user, { employeeId: "other", type: "Resume" }), true);
  assert.equal(canAccessEmployeeDocument({ role: "MANAGER" }, { employeeId: "other", type: "Resume" }), false);
  assert.equal(canAccessEmployeeDocument({ role: "ADMIN" }, { employeeId: "other", type: "Unknown" }), true);
});
test("each role opens only the dashboards its job needs, its own first", () => {
  const keys = (user: { role: "ADMIN" | "HR" | "MANAGER" | "EMPLOYEE"; isOwner?: boolean }) => dashboardsFor(user).map((d) => d.key);
  assert.deepEqual(keys({ role: "ADMIN", isOwner: true }), ["owner", "admin", "hr", "me"]);
  assert.deepEqual(keys({ role: "ADMIN" }), ["admin", "hr", "me"]);
  assert.deepEqual(keys({ role: "HR" }), ["hr", "me"]);
  assert.deepEqual(keys({ role: "MANAGER" }), ["me"]);
  assert.deepEqual(keys({ role: "EMPLOYEE" }), ["me"]);
  // The owner mark means nothing without the admin role.
  assert.equal(isOwner({ role: "HR", isOwner: true }), false);
  assert.equal(homeDashboard({ role: "EMPLOYEE", isOwner: true }).key, "me");
  assert.equal(homeDashboard({ role: "ADMIN", isOwner: true }).key, "owner");
});
test("the permissions table has a column for the owner and each role", () => {
  for (const row of PERMISSION_ROWS) assert.equal(row.access.length, ROLE_COLUMNS.length, row.label);
});
