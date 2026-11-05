import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildNav, type NavCounts } from "../src/lib/nav";
import { canOpenPage } from "../src/lib/page-access";
import { phoneMenu } from "../src/lib/mobile-menu";

/* The phone app's More tab and its way of opening Orbit pages signed in. */

const QUIET: NavCounts = {
  teamwork: true, inbox: 0, messages: 3, toAcknowledge: 0, checklists: 0, overdueChecklists: false, helpdesk: 0, approvals: 0,
  lowStock: 0, onlineApplications: 0, myInterviews: 0, reviewTodos: 0, planToUpdate: 0,
};
const PEOPLE = {
  superadmin: { role: "ADMIN", isOwner: true, isSuperadmin: true, employee: { id: "e" } },
  admin: { role: "ADMIN", employee: { id: "e" } },
  hr: { role: "HR", employee: { id: "e" } },
  manager: { role: "MANAGER", employee: { id: "e" } },
  employee: { role: "EMPLOYEE", employee: { id: "e" } },
} as const;

test("the phone menu only lists pages the person may open, for every role", () => {
  for (const [who, person] of Object.entries(PEOPLE)) {
    const menu = phoneMenu(buildNav(person, QUIET), person);
    assert.ok(menu.length > 0, `${who} has an empty phone menu`);
    for (const item of menu.flatMap((g) => g.items)) assert.ok(canOpenPage(person, item.href), `${who} sees ${item.href}`);
  }
});

test("the phone menu has the same pages as the web menu", () => {
  const person = PEOPLE.admin;
  const web = buildNav(person, QUIET).flatMap((g) => g.items.map((i) => i.href)).filter((h) => canOpenPage(person, h));
  const phone = phoneMenu(buildNav(person, QUIET), person).flatMap((g) => g.items.map((i) => i.href));
  assert.deepEqual(phone, web);
});

test("the phone menu shows a count only when something is waiting", () => {
  const items = phoneMenu(buildNav(PEOPLE.employee, QUIET), PEOPLE.employee).flatMap((g) => g.items);
  assert.equal(items.find((i) => i.href === "/messages")?.badge, 3);
  assert.equal(items.find((i) => i.href === "/inbox")?.badge, undefined);
});

test("opening a page in the app checks a one-time code and stays inside Orbit", () => {
  const open = readFileSync("src/app/api/mobile/open/route.ts", "utf8");
  assert.match(open, /redeemOpenCode\(/, "the opener must check the code");
  assert.match(open, /safeAppPath\(/, "the opener must only send people to pages inside Orbit");
  const lib = readFileSync("src/lib/mobile-open.ts", "utf8");
  assert.match(lib, /allowRequest\(USE, jti, 1,/, "a code must work only once");
  assert.match(lib, /session\.endedAt/, "an ended session must not open pages");
  assert.match(lib, /OPEN_CODE_SECONDS = 60\b/, "codes last a minute");
});

test("the phone app's icons and colours are the web app's", async () => {
  const web = readFileSync("src/components/icons.tsx", "utf8");
  const phone = readFileSync("mobile-app/src/icon-paths.ts", "utf8");
  const pairs = [...phone.matchAll(/^ {2}(\w+): ("[^"]*"),$/gm)];
  assert.ok(pairs.length > 20, "the phone icon list should not be empty");
  for (const [, name, d] of pairs) assert.ok(web.includes(`\n  ${name}: ${d},`), `phone icon ${name} differs from the web icon`);
  const { BRAND } = await import("../src/lib/brand");
  const theme = readFileSync("mobile-app/src/theme.ts", "utf8");
  for (const key of ["blue", "navy", "orange", "page", "line", "ink", "muted", "tint", "onNavyMuted"] as const) {
    assert.match(theme, new RegExp(`\\b${key}: '${BRAND[key]}'`), `phone colour ${key} should be ${BRAND[key]}`);
  }
});

test("the phone's leave routes use the same rules as the web form", () => {
  const web = readFileSync("src/app/(app)/hr/actions.ts", "utf8");
  for (const fn of ["requestLeave(", "cancelOwnLeave(", "decideLeaveRequest("]) assert.ok(web.includes(fn), `the web form should call ${fn}`);
  const phone = readFileSync("src/app/api/mobile/leave/route.ts", "utf8");
  assert.match(phone, /getApiUser\(\)/);
  assert.match(phone, /requestLeave\(access\.user, parsed\.data\)/);
  assert.match(readFileSync("src/app/api/mobile/leave/[id]/cancel/route.ts", "utf8"), /cancelOwnLeave\(access\.user, id\)/);
});

test("the phone's approvals use the same rules as the web Approvals page", () => {
  const actions: Record<string, string> = {
    "src/app/(app)/hr/attendance/actions.ts": "decideCorrectionRequest(",
    "src/app/(app)/timesheets/actions.ts": "decideTimesheetRequest(",
    "src/app/(app)/expenses/actions.ts": "decideClaimRequest(",
    "src/app/(app)/projects/actions.ts": "decideProjectApproval(",
    "src/app/(app)/inventory/actions.ts": "decideStockRequestDecision(",
    "src/app/(app)/purchases/actions.ts": "decidePurchaseOrderDecision(",
  };
  for (const [file, fn] of Object.entries(actions)) assert.ok(readFileSync(file, "utf8").includes(fn), `${file} should call ${fn}`);

  const list = readFileSync("src/app/api/mobile/approvals/route.ts", "utf8");
  assert.match(list, /getApiUser\(\)/);
  assert.match(list, /\["ADMIN", "MANAGER"\]\.includes\(access\.user\.role\)/);
  const decide = readFileSync("src/app/api/mobile/approvals/decide/route.ts", "utf8");
  assert.match(decide, /getApiUser\(\)/);
  for (const fn of ["decideLeaveRequest(", ...Object.values(actions)]) assert.ok(decide.includes(fn), `the phone should call ${fn}`);

  // Every decision checks the role and that the item is still waiting.
  const rules = readFileSync("src/lib/decisions.ts", "utf8");
  const fns = rules.split("export async function ").slice(1);
  assert.equal(fns.length, 6);
  for (const fn of fns) {
    assert.match(fn, /includes\(user\.role\)\) return NOT_YOURS/, fn.slice(0, 40));
    assert.match(fn, /updateMany\(/, fn.slice(0, 40));
  }
});

test("the phone's CRM screens stand for real CRM pages, and say when they show sample data", () => {
  const native = readFileSync("mobile-app/src/native.tsx", "utf8");
  const crmPaths = [...native.matchAll(/^ {2}'(\/crm\/[\w/]+)': \w+,$/gm)].map((m) => m[1]);
  assert.deepEqual(crmPaths.sort(), ["/crm/activities", "/crm/contacts", "/crm/deals", "/crm/leads", "/crm/organizations"]);
  const person = PEOPLE.employee;
  const menu = phoneMenu(buildNav(person, QUIET), person).flatMap((g) => g.items.map((i) => i.href));
  for (const path of crmPaths) assert.ok(menu.includes(path!), `${path} should be in an employee's phone menu`);
  for (const record of ["/crm/leads/abc", "/crm/deals/abc", "/crm/organizations/abc"]) assert.ok(canOpenPage(person, record), record);
  const data = readFileSync("mobile-app/src/crm/data.ts", "utf8");
  const parts = readFileSync("mobile-app/src/crm/parts.tsx", "utf8");
  if (/CRM_IS_SAMPLE = true/.test(data)) assert.match(parts, /CRM_IS_SAMPLE \? <SampleNote \/>/, "sample data must be labelled on screen");
});
