import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { PAGE_ACCESS, accessAllows, canOpenPage, routeFor, whoCanOpen, type PageAccess } from "../src/lib/page-access";
import { buildNav, type NavCounts } from "../src/lib/nav";
import { ROLES } from "../src/lib/permissions";

/*
 * Role-based access, checked from the source so it runs without a database: every page's guard matches the
 * access list, every server action checks the role before it touches the database, every download checks
 * sign-in, and the menu never links a role to a page it cannot open.
 */

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
const all = files("src/app").map((f) => relative("src/app", f).replace(/\\/g, "/"));
const read = (f: string) => readFileSync(join("src/app", f), "utf8");

const APP_PAGES = all.filter((f) => f.startsWith("(app)/") && f.endsWith("/page.tsx") || f === "(app)/page.tsx");
const routeOf = (f: string) => `/${f.replace(/^\(app\)\/?/, "").replace(/\/?page\.tsx$/, "")}`.replace(/\/$/, "") || "/";

/** The access a page's own code enforces, read from its first guard call. */
function guardOf(source: string): PageAccess | "none" {
  // requireTeamwork() is requireUser() plus the company-email check (src/lib/teamwork.ts), open to every role.
  const m = source.match(/requireOwner\(\)|requireUser\(\s*(\[[^\]]*\])?\s*\)|requireTeamwork\(\)|getCurrentSession\(\)/);
  if (!m) return "none";
  if (m[0] === "requireOwner()") return "owner";
  if (!m[1]) return "everyone";
  return JSON.parse(m[1].replace(/,\s*\]$/, "]"));
}

test("every signed-in page has a row in the access list and enforces exactly that row", () => {
  const seen = new Set<string>();
  for (const f of APP_PAGES) {
    const route = routeOf(f);
    seen.add(route);
    assert.ok(route in PAGE_ACCESS, `${route} is missing from PAGE_ACCESS in src/lib/page-access.ts`);
    assert.deepEqual(guardOf(read(f)), PAGE_ACCESS[route as keyof typeof PAGE_ACCESS], `${route}: the page's guard differs from PAGE_ACCESS`);
  }
  for (const route of Object.keys(PAGE_ACCESS)) assert.ok(seen.has(route), `${route} is in PAGE_ACCESS but has no page`);
});

// Server actions that run before anyone is signed in (sign-in, password reset, email links).
const PUBLIC_ACTIONS = new Set(["actions.ts#login", "actions.ts#logout", "account-actions.ts#requestPasswordReset", "account-actions.ts#resetPassword", "account-actions.ts#verifyEmail"]);
const GUARD = /\b(requireUser|requireOwner|requireTeamwork|getCurrentSession|getApiUser|getTeamworkApiUser)\s*\(/;

test("every server action checks who is signed in before it touches the database", () => {
  const actionFiles = all.filter((f) => /^\s*["']use server["']/m.test(read(f)));
  assert.ok(actionFiles.length > 20, "found the server action files");
  const problems: string[] = [];
  for (const f of actionFiles) {
    const src = read(f);
    const fns = [...src.matchAll(/^(export )?(?:async )?function (\w+)\s*\(|^(export )?const (\w+) = (?:async )?\(/gm)].map((m) => ({
      name: m[2] ?? m[4],
      exported: !!(m[1] ?? m[3]),
      start: m.index,
    }));
    const bodies = fns.map((fn, i) => ({ ...fn, body: src.slice(fn.start, fns[i + 1]?.start ?? src.length) }));
    // Local helpers such as requireRecruiter() count as a guard when they call one themselves.
    const helpers = bodies.filter((b) => !b.exported && GUARD.test(b.body)).map((b) => b.name);
    const guard = new RegExp(`${GUARD.source}|\\b(${helpers.join("|") || "$^"})\\s*\\(`);
    for (const fn of bodies.filter((b) => b.exported)) {
      if (PUBLIC_ACTIONS.has(`${f}#${fn.name}`)) continue;
      const body = fn.body.slice(fn.body.indexOf("{"));
      const guardAt = body.search(guard);
      const dbAt = body.search(/\bdb\.|\$transaction/);
      if (guardAt < 0) problems.push(`${f} ${fn.name}: no sign-in or role check`);
      else if (dbAt >= 0 && dbAt < guardAt) problems.push(`${f} ${fn.name}: reads the database before checking the role`);
    }
  }
  assert.deepEqual(problems, []);
});

// Downloads open to the public on purpose: health check, the cron call (it checks CRON_SECRET),
// Google sign-in, the careers application form and browser error reports (which check sign-in themselves).
const PUBLIC_ROUTES = new Set(["api/health/route.ts", "api/cron/payment-reminders/route.ts", "auth/google/route.ts", "auth/google/callback/route.ts", "careers/[id]/apply/route.ts"]);

test("every download and export checks sign-in, including a finished password setup", () => {
  for (const f of all.filter((x) => x.endsWith("/route.ts"))) {
    const src = read(f);
    // getCurrentUser skips the "replace your temporary password" step that pages enforce.
    assert.doesNotMatch(src, /getCurrentUser\(/, `${f} should use getApiUser() or requireUser()`);
    if (PUBLIC_ROUTES.has(f)) continue;
    assert.match(src, /\b(getApiUser|getTeamworkApiUser|requireUser|requireOwner)\(/, `${f} has no sign-in check`);
  }
});

const PEOPLE = {
  owner: { role: "ADMIN", isOwner: true },
  admin: { role: "ADMIN" },
  hr: { role: "HR" },
  manager: { role: "MANAGER" },
  employee: { role: "EMPLOYEE" },
} as const;
const BUSY: NavCounts = {
  teamwork: true, inbox: 1, messages: 1, toAcknowledge: 1, checklists: 1, overdueChecklists: true, helpdesk: 1, approvals: 1,
  lowStock: 1, onlineApplications: 1, myInterviews: 1, reviewTodos: 1, planToUpdate: 1,
};

test("the menu and search only offer pages the person's role can open", () => {
  for (const [who, person] of Object.entries(PEOPLE)) {
    for (const employee of [{ id: "e1" }, null]) {
      for (const group of buildNav({ ...person, employee }, BUSY)) {
        for (const item of group.items) assert.ok(canOpenPage(person, item.href), `${who}: menu links to ${item.href}, which their role cannot open`);
      }
    }
  }
});

test("roles reach only the pages their job needs", () => {
  const opens = (who: keyof typeof PEOPLE, path: string) => canOpenPage(PEOPLE[who], path);
  // Owner only
  assert.equal(opens("owner", "/dashboard"), true);
  assert.equal(opens("admin", "/dashboard"), false);
  // Admin only: logins, settings, payroll, offers, payables, review cycles, starting an exit
  for (const path of ["/admin/users", "/admin/settings", "/payroll", "/payroll/2026-10", "/recruitment/offers/x", "/purchases/payables", "/hr/reviews/cycles/new", "/hr/exits/new"]) {
    assert.equal(opens("admin", path), true, path);
    for (const who of ["hr", "manager", "employee"] as const) assert.equal(opens(who, path), false, `${who} ${path}`);
  }
  // HR: people pages, letters, no money and no exits
  for (const path of ["/hr/letters", "/hr/letters/x", "/hr/employees/new", "/hr/departments", "/dashboard/hr"]) {
    assert.equal(opens("hr", path), true, path);
    assert.equal(opens("employee", path), false, path);
  }
  for (const path of ["/invoices", "/accounts", "/approvals", "/hr/exits", "/crm/commission"]) assert.equal(opens("hr", path), false, path);
  // Managers: billing and team pages, not HR set-up
  for (const path of ["/invoices/x", "/quotes/new", "/approvals", "/timesheets/team", "/hr/exits"]) assert.equal(opens("manager", path), true, path);
  for (const path of ["/hr/letters", "/hr/departments", "/dashboard/hr"]) assert.equal(opens("manager", path), false, path);
  // Everyone: their own work
  for (const path of ["/", "/payroll/my", "/hr/leave", "/timesheets", "/expenses", "/no-access"]) assert.equal(opens("employee", path), true, path);
  // Addresses that are not pages are refused.
  assert.equal(opens("owner", "/nowhere"), false);
});

test("typed addresses map to their page, fixed names before [id]", () => {
  assert.equal(routeFor("/hr/letters/abc"), "/hr/letters/[id]");
  assert.equal(routeFor("/hr/letters/new"), "/hr/letters/new");
  assert.equal(routeFor("/projects/pulse?range=week"), "/projects/pulse");
  assert.equal(routeFor("/"), "/");
});

test("the refusal page names who a page is for in plain words", () => {
  assert.equal(whoCanOpen(["ADMIN"]), "Admin");
  assert.equal(whoCanOpen(["ADMIN", "MANAGER"]), "Admin and Manager");
  assert.equal(whoCanOpen(["ADMIN", "HR", "MANAGER"]), "Admin, HR and Manager");
  assert.equal(whoCanOpen("owner"), "the owner");
  for (const role of ROLES) {
    assert.equal(accessAllows("owner", { role, isOwner: true }), role === "ADMIN");
    assert.equal(accessAllows("everyone", { role }), true);
  }
});
