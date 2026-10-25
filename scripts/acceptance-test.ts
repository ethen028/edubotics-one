import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Role } from "@prisma/client";
import { SignJWT } from "jose";

const database = new URL(process.env.DATABASE_URL ?? "");
const base = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3001");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.endsWith("_test"), "Use a local _test database");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Acceptance tests only target localhost");
assert.ok(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32);
const db = new PrismaClient();
const tag = `UAT${randomUUID().replaceAll("-", "").slice(0, 10)}`;
const users: string[] = [], employees: string[] = [], sessions: string[] = [];
let runId: string | undefined;
type Actor = { id: string; cookie: string; role: Role };
const decode = (text: string) => text.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&");

async function request(path: string, actor: Actor) {
  const response = await fetch(new URL(path, base), { headers: { cookie: actor.cookie }, redirect: "manual", signal: AbortSignal.timeout(60000) });
  return { status: response.status, location: response.headers.get("location"), body: await response.text() };
}
function denied(result: Awaited<ReturnType<typeof request>>) {
  return result.status === 307 && result.location?.includes("/no-access") || result.body.includes("NEXT_REDIRECT") && result.body.includes("/no-access");
}
async function page(path: string, actor: Actor) {
  const result = await request(path, actor);
  assert.equal(result.status, 200, `${actor.role} ${path}`);
  assert.ok(!result.body.includes("NEXT_REDIRECT") && !/:E\{\s*"digest"/.test(result.body), `Unexpected redirect/render error: ${path}`);
  return result.body;
}
async function form(path: string, actor: Actor, label: string) {
  let html = await page(path, actor);
  if (label.startsWith("role-for:")) { html = html.slice(html.indexOf(label.slice(9))); label = 'name="role"'; }
  const form = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(match => match[0]).find(value => decode(value).includes(label));
  assert.ok(form, `Missing form ${label}`);
  const hidden = [...form.matchAll(/<input\b[^>]*>/g)].map(match => Object.fromEntries([...match[0].matchAll(/([\w:$-]+)="([^"]*)"/g)].map(attr => [attr[1], decode(attr[2])]))).filter(input => input.type === "hidden" && input.name);
  assert.ok(hidden.some(input => input.name.startsWith("$ACTION_")));
  return { path, actor, hidden };
}
async function submit(target: Awaited<ReturnType<typeof form>>, values: Record<string, string> = {}, actor = target.actor) {
  const body = new FormData();
  for (const input of target.hidden) body.append(input.name, input.value ?? "");
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  const response = await fetch(new URL(target.path, base), { method: "POST", headers: { cookie: actor.cookie, origin: base.origin }, body, redirect: "manual", signal: AbortSignal.timeout(60000) });
  const html = await response.text();
  assert.ok([200, 303, 307].includes(response.status), `Action failed: ${response.status} ${html.slice(0, 120)}`);
  assert.ok(!html.includes('"digest":"') || html.includes("NEXT_REDIRECT"), "Streamed action error");
}

async function main() {
  const seed = await db.user.findUniqueOrThrow({ where: { email: process.env.SMOKE_ADMIN_EMAIL ?? "rebuild@example.invalid" } });
  async function actor(name: string, role: Role): Promise<Actor> {
    const user = await db.user.create({ data: { name: `${tag} ${name}`, email: `${tag}-${name}@example.invalid`.toLowerCase(), role, passwordHash: seed.passwordHash, emailVerifiedAt: new Date() } });
    users.push(user.id);
    const session = await db.session.create({ data: { userId: user.id, method: "PASSWORD" } });
    sessions.push(session.id);
    const token = await new SignJWT({ sub: user.id, sid: session.id }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30m").sign(new TextEncoder().encode(process.env.SESSION_SECRET));
    return { id: user.id, role, cookie: `eb_session=${token}` };
  }
  const admin = await actor("Admin", "ADMIN"), hr = await actor("HR", "HR"), manager = await actor("Manager", "MANAGER"), employee = await actor("Employee", "EMPLOYEE");
  for (const [name, identity] of [["Admin", admin], ["HR", hr], ["Manager", manager], ["Employee", employee]] as const) {
    for (const path of ["/", "/account", "/work", "/projects", "/inventory", "/hr", "/notices", "/helpdesk"]) await page(path, identity);
    if (identity.role === "ADMIN") {
      for (const path of ["/admin/users", "/admin/launch", "/hr/employees", "/payroll", "/accounts"]) await page(path, identity);
    } else {
      for (const path of ["/admin/users", "/admin/launch", "/admin/settings", "/payroll"]) assert.ok(denied(await request(path, identity)), `${name} should be denied ${path}`);
    }
    if (identity.role === "HR") {
      for (const path of ["/hr/employees/new", "/hr/approvals", "/hr/onboarding", "/hr/training", "/hr/assets", "/hr/departments", "/hr/leave-types", "/hr/attendance/register", "/recruitment"]) await page(path, identity);
      for (const path of ["/accounts", "/invoices", "/approvals", "/admin/roles"]) assert.ok(denied(await request(path, identity)), `HR should be denied ${path}`);
    }
    if (identity.role === "MANAGER") for (const path of ["/approvals", "/accounts", "/recruitment", "/timesheets/team"]) await page(path, identity);
    if (identity.role === "EMPLOYEE") for (const path of ["/accounts", "/invoices", "/approvals"]) assert.ok(denied(await request(path, identity)), `Employee should be denied ${path}`);
    console.log(`${name}: dashboard, shared modules, account and permission boundaries passed.`);
  }

  // Use an otherwise empty historical month so payroll cannot include any demo/live employee.
  const month = "2000-01";
  assert.equal(await db.payrollRun.count({ where: { month } }), 0, "Reserved acceptance month already has a run; refusing to alter it");
  assert.equal(await db.employee.count({ where: { dateOfJoining: { lte: new Date("2000-01-31") }, OR: [{ dateOfExit: null }, { dateOfExit: { gte: new Date("2000-01-01") } }] } }), 0, "Reserved month contains existing employees; refusing payroll mutation");
  const person = await db.employee.create({ data: { code: tag, firstName: tag, lastName: "Payroll", workEmail: `${tag}@example.invalid`.toLowerCase(), designation: "Acceptance fixture", dateOfJoining: new Date("2000-01-01"), dateOfExit: new Date("2000-01-31"), userId: employee.id, salaries: { create: { effectiveFrom: new Date("2000-01-01"), basic: 30000, hra: 12000, specialAllowance: 3000 } } } });
  employees.push(person.id);
  await submit(await form("/payroll", admin, "Prepare payroll"), { month });
  const run = await db.payrollRun.findUniqueOrThrow({ where: { month }, include: { payslips: true } });
  runId = run.id;
  assert.equal(run.status, "DRAFT"); assert.equal(run.payslips.length, 1); assert.equal(Number(run.payslips[0].gross), 45000);
  const slipPath = `/payroll/payslip/${run.payslips[0].id}`;
  assert.ok(!(await request(slipPath, employee)).body.includes("Gross earnings"), "Unpublished payslip must remain private");
  const finalize = await form(`/payroll/${month}`, admin, "Finalize and publish payslips");
  await submit(finalize, {}, manager);
  assert.equal((await db.payrollRun.findUniqueOrThrow({ where: { id: run.id } })).status, "DRAFT", "Manager cannot finalize payroll");
  await submit(finalize, {}, hr);
  assert.equal((await db.payrollRun.findUniqueOrThrow({ where: { id: run.id } })).status, "DRAFT", "HR cannot finalize payroll");
  await submit(finalize);
  assert.equal((await db.payrollRun.findUniqueOrThrow({ where: { id: run.id } })).status, "FINALIZED");
  assert.ok((await page(slipPath, employee)).includes("Gross earnings"), "Employee must see own published payslip");
  assert.ok(!(await request(slipPath, hr)).body.includes("Gross earnings"), "HR cannot see another employee payslip");
  assert.ok(!(await request(slipPath, manager)).body.includes("Gross earnings"), "Manager cannot see another employee's payslip");
  const profilePath = `/hr/employees/${person.id}`;
  const hrView = await page(profilePath, hr);
  assert.ok(!hrView.includes("Salary structure") && !hrView.includes('name="basic"'), "HR employee profile must not reveal salary forms");
  const baseFields = { code: `${tag}-HRNEW`, firstName: tag, lastName: "HRcreated", workEmail: `${tag}-hr-created@example.invalid`.toLowerCase(), designation: "Test employee", employmentType: "FULL_TIME", status: "ONBOARDING", dateOfJoining: "2026-01-05" };
  const create = await form("/hr/employees/new", hr, "Add employee");
  await submit(create, { ...baseFields, createLogin: "on", role: "ADMIN", password: "Test-only Strong Password 5931!" });
  assert.equal(await db.employee.count({ where: { code: baseFields.code } }), 0, "Forged HR login request must not create employee or user");
  assert.equal(await db.user.count({ where: { email: baseFields.workEmail } }), 0);
  await submit(create, baseFields);
  const created = await db.employee.findUniqueOrThrow({ where: { code: baseFields.code } }); employees.push(created.id);
  assert.equal(created.userId, null);
  assert.equal(await db.onboardingTask.count({ where: { employeeId: created.id } }), 10);
  const adminPerson = await db.employee.create({ data: { code: `${tag}-ADMIN`, firstName: tag, lastName: "Administrator", designation: "Admin", workEmail: `${tag}-admin-record@example.invalid`.toLowerCase(), dateOfJoining: new Date("2026-01-01"), userId: admin.id } }); employees.push(adminPerson.id);
  const adminEdit = await form(`/hr/employees/${adminPerson.id}`, admin, 'name="firstName"');
  await submit(adminEdit, { ...baseFields, code: adminPerson.code, workEmail: adminPerson.workEmail, firstName: "Unauthorized", status: "EXITED" }, hr);
  assert.equal((await db.employee.findUniqueOrThrow({ where: { id: adminPerson.id } })).firstName, tag);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).active, true);
  const createAccount = await form("/admin/users", admin, "Create login");
  await submit(createAccount, { name: "Forged Admin", email: `${tag}-forged@example.invalid`.toLowerCase(), role: "ADMIN", password: "Test-only Strong Password 5931!" }, hr);
  assert.equal(await db.user.count({ where: { email: `${tag}-forged@example.invalid`.toLowerCase() } }), 0);
  const docs = await Promise.all(["Resume", "Offer letter", "Other", "Unclassified legacy document"].map(type => db.employeeDocument.create({ data: { employeeId: person.id, type, fileName: `${type}.pdf`, mimeType: "application/pdf", size: 12, data: new Uint8Array([37, 80, 68, 70, 45]), uploadedById: admin.id } })));
  for (const doc of docs) {
    const response = await request(`/api/documents/${doc.id}`, hr);
    assert.equal(response.status, doc.type === "Resume" ? 200 : 404, `HR document policy ${doc.type}`);
  }
  const docPage = await page(profilePath, hr);
  assert.ok(!docPage.includes("Offer letter.pdf") && !docPage.includes("Unclassified legacy document.pdf"), "Hidden document metadata must not be rendered");
  await submit(await form(profilePath, hr, "Verify"), { status: "VERIFIED" });
  assert.equal((await db.employeeDocument.findUniqueOrThrow({ where: { id: docs[0].id } })).status, "VERIFIED");
  const changeRole = await form("/admin/users", admin, `role-for:${tag} Manager`);
  await submit(changeRole, { name: `${tag} Manager`, role: "HR", active: "on" });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: manager.id } })).role, "HR");
  assert.ok(denied(await request("/accounts", manager)), "Existing session must lose Manager finance access immediately after HR downgrade");
  assert.ok(await db.activityLog.count({ where: { action: "login.role", userId: admin.id } }) > 0, "Role change must be audited");
  console.log("HR: record creation, forged account denial, privileged account protection, private document policy, review and role-change session boundaries passed.");
  await submit(await form(`/payroll/${month}`, admin, "Mark as paid"), { paidOn: "2000-01-31" });
  assert.equal((await db.payrollRun.findUniqueOrThrow({ where: { id: run.id } })).status, "PAID");
  console.log("Payroll: prepare, exact gross, draft privacy, unauthorized finalization denial, publish, own-only payslip access and paid status passed. No money transferred.");
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (runId) await db.payrollRun.delete({ where: { id: runId } });
  await db.employee.deleteMany({ where: { id: { in: employees } } });
  await db.session.deleteMany({ where: { id: { in: sessions } } });
  await db.activityLog.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
