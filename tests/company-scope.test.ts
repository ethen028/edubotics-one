import { test } from "node:test";
import assert from "node:assert/strict";
import { isScopedModel, linkedIds, scopeArgs } from "../src/lib/company-scope";

const C = "cmp_a";

test("lists and counts only see the current company", () => {
  assert.deepEqual(scopeArgs("Lead", "findMany", { where: { status: "NEW" } }, C).where, { AND: [{ status: "NEW" }, { companyId: C }] });
  assert.deepEqual(scopeArgs("Lead", "count", undefined, C).where, { companyId: C });
  assert.deepEqual(scopeArgs("Invoice", "deleteMany", { where: { id: "x" } }, C).where, { AND: [{ id: "x" }, { companyId: C }] });
});

test("opening, changing or deleting one record by id fails for another company's record", () => {
  assert.deepEqual(scopeArgs("Invoice", "findUnique", { where: { id: "inv1" } }, C).where, { id: "inv1", companyId: C });
  assert.deepEqual(scopeArgs("Employee", "update", { where: { id: "e1" }, data: { phone: "1" } }, C).where, { id: "e1", companyId: C });
  assert.deepEqual(scopeArgs("Employee", "delete", { where: { id: "e1" } }, C).where, { id: "e1", companyId: C });
});

test("a new record is filed under the current company", () => {
  assert.deepEqual(scopeArgs("Lead", "create", { data: { name: "St Mary's", ownerId: "u1" } }, C).data, { name: "St Mary's", ownerId: "u1", companyId: C });
  const many = scopeArgs("Holiday", "createMany", { data: [{ name: "Onam" }, { name: "Vishu" }] }, C).data as { companyId: string }[];
  assert.deepEqual(many.map((h) => h.companyId), [C, C]);
});

test("relation-style data gets the company as a relation, as Prisma takes one style or the other", () => {
  const data = scopeArgs("Lead", "create", { data: { name: "x", owner: { connect: { id: "u1" } } } }, C).data as Record<string, unknown>;
  assert.deepEqual(data.company, { connect: { id: C } });
  assert.equal(data.companyId, undefined);
});

test("lines created with an invoice are in the invoice's company too", () => {
  const data = scopeArgs("Invoice", "create", {
    data: { organizationId: "o1", lines: { create: [{ description: "Kit", amount: 1 }] } },
  }, C).data as { lines: { create: { companyId: string }[] } };
  assert.equal(data.lines.create[0].companyId, C);
});

test("nested creates inside an update and an upsert are filed under the company", () => {
  const upd = scopeArgs("Quote", "update", {
    where: { id: "q1" },
    data: { lines: { deleteMany: {}, create: [{ description: "Kit" }] } },
  }, C) as { data: { lines: { create: { companyId: string }[] } } };
  assert.equal(upd.data.lines.create[0].companyId, C);
  const ups = scopeArgs("PlanMonth", "upsert", { where: { id: "p" }, create: { focus: "x", metrics: { create: { label: "Leads" } } }, update: {} }, C) as {
    where: { companyId: string }; create: { companyId: string; metrics: { create: { companyId: string } } };
  };
  assert.equal(ups.where.companyId, C);
  assert.equal(ups.create.companyId, C);
  assert.equal(ups.create.metrics.create.companyId, C);
});

test("sign-in tables and the company list are never filtered", () => {
  for (const m of ["Company", "Session", "LoginAttempt", "AccountToken", "RateLimitBucket", "AccountMailJob"]) assert.equal(isScopedModel(m), false, m);
  for (const m of ["User", "Employee", "Invoice", "CompanySettings", "ActivityLog", "ChatMessage"]) assert.equal(isScopedModel(m), true, m);
});

test("a company named in the data is kept, not overwritten", () => {
  assert.equal((scopeArgs("CompanySettings", "create", { data: { companyId: "cmp_b" } }, C).data as { companyId: string }).companyId, "cmp_b");
});

const links = (model: string, operation: string, args: Record<string, unknown>) =>
  Object.fromEntries([...linkedIds(model, operation, args)].map(([k, v]) => [k, [...v].sort()]));

test("a new invoice's school, contact and maker are all checked to be in the same company", () => {
  assert.deepEqual(links("Invoice", "create", { data: { organizationId: "org1", contactId: "c1", createdById: "u1", billToName: "x", lines: { create: [{ description: "Kit" }] } } }), {
    "Organization.id": ["org1"],
    "Contact.id": ["c1"],
    "User.id": ["u1"],
  });
});

test("links made with connect, inside nested creates and in updates are checked too", () => {
  assert.deepEqual(links("Project", "create", { data: { name: "P", owner: { connect: { id: "u1" } }, members: { create: [{ userId: "u2" }] } } }), {
    "User.id": ["u1", "u2"],
  });
  assert.deepEqual(links("ProjectTask", "update", { where: { id: "t1" }, data: { assigneeId: { set: "u3" } } }), { "User.id": ["u3"] });
  assert.deepEqual(links("ProjectMember", "upsert", { where: {}, create: { projectId: "p1", userId: "u4" }, update: {} }), {
    "Project.id": ["p1"],
    "User.id": ["u4"],
  });
});

test("reads and writes with no links need no extra check", () => {
  assert.equal(linkedIds("Invoice", "findMany", { where: { organizationId: "org1" } }).size, 0);
  assert.equal(linkedIds("Lead", "update", { where: { id: "l1" }, data: { name: "New name" } }).size, 0);
  assert.equal(linkedIds("Lead", "update", { where: { id: "l1" }, data: { ownerId: null } }).size, 0);
});
