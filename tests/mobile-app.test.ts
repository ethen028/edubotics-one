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
