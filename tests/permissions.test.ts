import test from "node:test";
import assert from "node:assert/strict";
import { ROLES, isHrOrAdmin, canManagePeople, canAccessEmployeeDocument } from "../src/lib/permissions";

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
