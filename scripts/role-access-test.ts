import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { PrismaClient, type Role } from "@prisma/client";
import { canOpenPage } from "../src/lib/page-access";
import { SignJWT } from "jose";

/**
 * Role access check: signs in as the owner, an admin, HR, a manager and an employee, opens every page by
 * typing its address, and checks each role reaches only what its job needs. Prints the whole table.
 * Opt-in, like the smoke test: a local _test database with the demo data (`npm run demo:seed`) and a running app.
 */
const database = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.endsWith("_test"), "Use a local database whose name ends in _test");
const base = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3001");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Only targets localhost");
assert.ok(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32, "Set SESSION_SECRET");
const db = new PrismaClient();
const sessions: string[] = [];

const ROLES = ["owner", "admin", "hr", "manager", "employee"] as const;
type Who = (typeof ROLES)[number];
type Outcome = "open" | "denied" | "not found" | "elsewhere" | "error";

// Who may open each page comes from the app's own access list (src/lib/page-access.ts); this script checks
// the running app really behaves that way. Someone else's payslip and a letter that shows pay are extra.
const PEOPLE: Record<Who, { role: Role; isOwner?: boolean }> = {
  owner: { role: "ADMIN", isOwner: true }, admin: { role: "ADMIN" }, hr: { role: "HR" }, manager: { role: "MANAGER" }, employee: { role: "EMPLOYEE" },
};
const EXTRA: Record<string, Who[]> = { "/payslip:other": ["owner", "admin"], "/letter:pay": ["owner", "admin"] };
const allowedFor = (route: string) => EXTRA[route] ?? ROLES.filter((r) => canOpenPage(PEOPLE[r], route));

async function cookieFor(userId: string) {
  const session = await db.session.create({ data: { userId, method: "PASSWORD" } });
  sessions.push(session.id);
  const token = await new SignJWT({ sub: userId, sid: session.id })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("15m")
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  return `eb_session=${token}`;
}

async function open(route: string, cookie: string): Promise<Outcome> {
  const response = await fetch(new URL(route, base), { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(60000) });
  const body = response.status === 200 ? await response.text() : "";
  const location = response.headers.get("location") ?? "";
  // A redirect or not-found after the loading screen starts streaming is carried in the page body.
  if ((response.status === 307 && location.includes("/no-access")) || (body.includes("NEXT_REDIRECT") && body.includes("/no-access"))) return "denied";
  if (response.status === 404 || body.includes("NEXT_HTTP_ERROR_FALLBACK;404")) return "not found";
  if (response.status === 307 || response.status === 308 || body.includes("NEXT_REDIRECT")) return "elsewhere";
  if (response.status !== 200 || /:E\{\s*"digest"/.test(body)) return "error";
  return "open";
}

async function main() {
  try {
    const find = (where: object) => db.user.findFirstOrThrow({ where: { active: true, ...where }, include: { employee: true } });
    const users: Record<Who, Awaited<ReturnType<typeof find>>> = {
      owner: await find({ isOwner: true }),
      admin: await find({ role: "ADMIN", isOwner: false }),
      hr: await find({ role: "HR" }),
      manager: await find({ role: "MANAGER" }),
      employee: await find({ role: "EMPLOYEE", employee: { isNot: null } }),
    };
    for (const u of Object.values(users)) assert.equal(u.mustChangePassword, false, `${u.email} must finish password setup first`);

    const files = await readdir("src/app/(app)", { recursive: true });
    const routes = files.filter((p) => /(^|[\\/])page\.tsx$/.test(p) && !p.includes("["))
      .map((p) => `/${p.replace(/\\/g, "/").replace(/(^|\/)page\.tsx$/, "")}`.replace(/\/$/, "") || "/")
      .sort();
    // Someone else's records, typed in by address.
    const otherPayslip = await db.payslip.findFirst({ where: { employee: { userId: { not: users.employee.id } } } });
    // A letter that shows someone else's pay: admins only, never HR.
    const payLetter = await db.hrLetter.findFirst({ where: { kind: { in: ["SALARY_CERTIFICATE", "APPOINTMENT", "REVISION", "ANNUAL_STATEMENT", "OFFER"] }, employeeId: { notIn: [users.employee.employee?.id ?? "", users.hr.employee?.id ?? "", users.manager.employee?.id ?? ""] } } });
    const extra: [string, string][] = [
      ...(otherPayslip ? [["/payslip:other", `/payroll/payslip/${otherPayslip.id}`] as [string, string]] : []),
      ...(payLetter ? [["/letter:pay", `/hr/letters/${payLetter.id}`] as [string, string]] : []),
    ];

    const cookies = Object.fromEntries(await Promise.all(ROLES.map(async (r) => [r, await cookieFor(users[r].id)] as const))) as Record<Who, string>;
    const table: { route: string; outcomes: Record<Who, Outcome> }[] = [];
    const all: [string, string][] = [...routes.map((r) => [r, r] as [string, string]), ...extra];
    for (let i = 0; i < all.length; i += 3) {
      await Promise.all(all.slice(i, i + 3).map(async ([name, path]) => {
        const outcomes = Object.fromEntries(await Promise.all(ROLES.map(async (r) => [r, await open(path, cookies[r])] as const))) as Record<Who, Outcome>;
        table.push({ route: name, outcomes });
      }));
    }
    table.sort((a, b) => a.route.localeCompare(b.route));

    const failures: string[] = [];
    for (const { route, outcomes } of table) {
      const allowed = allowedFor(route);
      for (const r of ROLES) {
        const reached = outcomes[r] === "open";
        if (outcomes[r] === "error") failures.push(`${route}: error for ${r}`);
        else if (reached && !allowed.includes(r)) failures.push(`${route}: ${r} should not reach it`);
        else if (!reached && allowed.includes(r) && !["elsewhere", "not found"].includes(outcomes[r])) failures.push(`${route}: ${r} should reach it (${outcomes[r]})`);
      }
    }
    const short: Record<Outcome, string> = { open: "yes", denied: "—", "not found": "404", elsewhere: "→", error: "ERR" };
    console.log(["page".padEnd(42), ...ROLES.map((r) => r.padEnd(9))].join(""));
    for (const { route, outcomes } of table) console.log([route.padEnd(42), ...ROLES.map((r) => short[outcomes[r]].padEnd(9))].join(""));
    console.log(`\n${table.length} pages checked for ${ROLES.length} roles.`);
    assert.deepEqual(failures, [], failures.join("\n"));
    console.log("Every role reaches only the pages its job needs.");
  } finally {
    await db.session.deleteMany({ where: { id: { in: sessions } } });
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
