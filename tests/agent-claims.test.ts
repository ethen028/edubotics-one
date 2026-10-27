// Checks for the agent's read-only claims view. Pure functions only: no database needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAIMS_API_METHODS,
  CLAIMS_CATALOG,
  claimScopeFor,
  monthBounds,
  summarizeClaims,
  toAgentClaim,
  toPaise,
  type AgentClaim,
} from "../src/lib/agent/claims-rules";
import { searchCatalog } from "../src/lib/agent/catalog";

const claim = (over: Partial<AgentClaim>): AgentClaim => ({
  id: "c1",
  date: "2026-10-05",
  category: "TRAVEL",
  description: "Choice School visit",
  status: "SUBMITTED",
  claimed: "100.00",
  payable: null,
  employee: "Test Person",
  ...over,
});

test("an employee may read only their own claims", () => {
  assert.deepEqual(claimScopeFor({ role: "EMPLOYEE", employee: { id: "e1" } }), { employeeId: "e1" });
});

test("HR is limited to their own claims, never the whole company", () => {
  assert.deepEqual(claimScopeFor({ role: "HR", employee: { id: "h1" } }), { employeeId: "h1" });
});

test("a manager reads their own claims and their direct reports' claims", () => {
  assert.deepEqual(claimScopeFor({ role: "MANAGER", employee: { id: "m1" } }), {
    OR: [{ employeeId: "m1" }, { employee: { managerId: "m1" } }],
  });
});

test("an admin reads every claim in the company (company filter is added by db)", () => {
  assert.deepEqual(claimScopeFor({ role: "ADMIN", employee: null }), {});
});

test("a login with no employee record matches no claims", () => {
  assert.deepEqual(claimScopeFor({ role: "EMPLOYEE", employee: null }), { id: { in: [] } });
});

test("month bounds cover the whole month at UTC midnight", () => {
  const b = monthBounds("2026-02");
  assert.ok(b);
  assert.equal(b.start.toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal(b.end.toISOString(), "2026-02-28T00:00:00.000Z");
});

test("malformed months are rejected", () => {
  assert.equal(monthBounds("2026-13"), null);
  assert.equal(monthBounds("October"), null);
  assert.equal(monthBounds("2026-1"), null);
});

test("money strings convert to whole paise without float drift", () => {
  assert.equal(toPaise("0.10") + toPaise("0.20"), 30);
  assert.equal(toPaise("1250.5"), 125050);
  assert.throws(() => toPaise("12,50"));
  assert.throws(() => toPaise("abc"));
});

test("payable counts only approved and paid claims, using the approved amount", () => {
  const s = summarizeClaims([
    claim({ status: "SUBMITTED", claimed: "300.00" }),
    claim({ status: "APPROVED", claimed: "500.00", payable: "450.00" }),
    claim({ status: "PAID", claimed: "200.00", payable: "200.00" }),
    claim({ status: "REJECTED", claimed: "999.00" }),
  ]);
  assert.equal(s.count, 4);
  assert.deepEqual(s.byStatus.APPROVED, { count: 1, claimed: "500.00", payable: "450.00" });
  assert.deepEqual(s.byStatus.PAID, { count: 1, claimed: "200.00", payable: "200.00" });
  assert.deepEqual(s.byStatus.REJECTED, { count: 1, claimed: "999.00", payable: "0.00" });
  assert.deepEqual(s.byStatus.SUBMITTED, { count: 1, claimed: "300.00", payable: "0.00" });
});

test("ten cents added twenty times is exactly two dollars' worth of paise, not 1.9999", () => {
  const claims = Array.from({ length: 20 }, () => claim({ status: "PAID", claimed: "0.10", payable: "0.10" }));
  assert.equal(summarizeClaims(claims).byStatus.PAID.payable, "2.00");
});

test("a claim's payable is the claimed amount until the approver changes it", () => {
  const row = toAgentClaim({
    id: "c9",
    date: new Date("2026-10-05T00:00:00Z"),
    category: "TRAVEL",
    description: "Visit",
    status: "APPROVED",
    amount: { toString: () => "300.00" },
    approvedAmount: null,
    employee: { firstName: "Asha", lastName: "K" },
  });
  assert.equal(row.payable, "300.00");
  assert.equal(row.date, "2026-10-05");
  assert.equal(row.employee, "Asha K");
});

test("the catalog offers exactly the functions the API object has", () => {
  assert.deepEqual(CLAIMS_CATALOG.entries.map((e) => e.name).sort(), [...CLAIMS_API_METHODS].sort());
  for (const e of CLAIMS_CATALOG.entries) {
    assert.ok(e.declaration.startsWith(e.name + "("), `declaration for ${e.name} must start with its name`);
  }
});

test("search finds the function whose name or description matches the words asked for", () => {
  const top = searchCatalog(CLAIMS_CATALOG.entries, "totals per status")[0];
  assert.equal(top.name, "summarizeClaims");
  assert.equal(searchCatalog(CLAIMS_CATALOG.entries, "getClaim by id")[0].name, "getClaim");
});

test("search with no matching words returns nothing, and an empty query returns the first few", () => {
  assert.deepEqual(searchCatalog(CLAIMS_CATALOG.entries, "weather in Kochi"), []);
  assert.equal(searchCatalog(CLAIMS_CATALOG.entries, "", 2).length, 2);
});
