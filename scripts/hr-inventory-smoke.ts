import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Role } from "@prisma/client";
import { companyScope, mainCompanyId } from "../src/lib/company-scope";
import { SignJWT } from "jose";

// Real HTTP/server-action checks, restricted to disposable fixtures in a local test database.
const database = new URL(process.env.DATABASE_URL ?? "");
const base = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3001");
assert.ok(["127.0.0.1", "localhost"].includes(database.hostname) && database.pathname.endsWith("_test"));
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname));
assert.ok(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32);
const rawDb = new PrismaClient();
const db = rawDb.$extends(companyScope(() => mainCompanyId(rawDb))); // the first company, like the app before sign-in
const tag = `WF${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const users: string[] = [], employees: string[] = [], sessions: string[] = [];
const decode = (text: string) => text.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w:$-]+)="([^"]*)"/g)].map(match => [match[1], decode(match[2])]));
type Actor = { id: string; cookie: string };
type NativeForm = { path: string; actor: Actor; hidden: [string, string][] };
type Values = Record<string, string | string[] | File>;

async function identity(id: string): Promise<Actor> {
  const session = await db.session.create({ data: { userId: id, method: "PASSWORD" } }); sessions.push(session.id);
  const token = await new SignJWT({ sub: id, sid: session.id }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30m").sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  return { id, cookie: `eb_session=${token}` };
}
async function page(path: string, actor: Actor) {
  const response = await fetch(new URL(path, base), { headers: { cookie: actor.cookie }, signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200, path); return response.text();
}
async function form(path: string, actor: Actor, needle: string, extra?: string): Promise<NativeForm> {
  const html = await page(path, actor);
  const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(match => match[0]);
  const found = forms.find(value => decode(value).includes(needle) && (!extra || decode(value).includes(extra)));
  assert.ok(found, `Missing form ${needle} on ${path}`);
  const hidden = [...found.matchAll(/<input\b[^>]*>/g)].map(match => attrs(match[0])).filter(input => input.type === "hidden" && input.name).map(input => [input.name, input.value ?? ""] as [string, string]);
  assert.ok(hidden.some(([name]) => name.startsWith("$ACTION_")), `Missing progressive server-action metadata on ${path}`);
  return { path, actor, hidden };
}
async function submit(form: NativeForm, values: Values = {}, actor = form.actor) {
  const body = new FormData();
  for (const [name, value] of form.hidden) body.append(name, value);
  for (const [name, value] of Object.entries(values)) { body.delete(name); for (const entry of Array.isArray(value) ? value : [value]) body.append(name, entry); }
  const response = await fetch(new URL(form.path, base), { method: "POST", headers: { cookie: actor.cookie, origin: base.origin }, body, redirect: "manual", signal: AbortSignal.timeout(60000) });
  const html = await response.text();
  assert.ok([200, 303, 307].includes(response.status), `Server-action failure on ${form.path}: HTTP ${response.status} ${html.slice(0, 200)}`);
  assert.ok(!html.includes('"digest":"') || html.includes("NEXT_REDIRECT"), `Streamed action error on ${form.path}`);
  return html;
}

async function main() {
  const seed = await db.user.findUniqueOrThrow({ where: { email: process.env.SMOKE_ADMIN_EMAIL ?? "rebuild@example.invalid" } });
  const admin = await identity(seed.id);
  const createUser = async (role: Role, name: string) => {
    const user = await db.user.create({ data: { email: `${tag}-${name}@example.invalid`, name: `${tag} ${name}`, passwordHash: seed.passwordHash, role, emailVerifiedAt: new Date() } }); users.push(user.id); return identity(user.id);
  };
  const manager = await createUser("MANAGER", "Manager");
  const staff = await createUser("EMPLOYEE", "Employee");
  const managerEmployee = await db.employee.create({ data: { code: `${tag}-M`, firstName: tag, lastName: "Manager", designation: "Manager", workEmail: `${tag}-manager-record@example.invalid`, dateOfJoining: new Date("2026-01-01"), userId: manager.id } }); employees.push(managerEmployee.id);
  const email = `${tag}-employee-record@example.invalid`.toLowerCase();
  const invalidEmployee = await form("/hr/employees/new", admin, "Add employee");
  await submit(invalidEmployee, { code: `${tag}-BAD`, firstName: tag, lastName: "Invalid", workEmail: `${tag}-bad@example.invalid`.toLowerCase(), designation: "Trainer", employmentType: "FULL_TIME", status: "ACTIVE", dateOfJoining: "2026-02-31" });
  assert.equal(await db.employee.count({ where: { code: `${tag}-BAD` } }), 0, "Invalid calendar dates must not create employees");
  const createdPage = await submit(await form("/hr/employees/new", admin, "Add employee"), { code: `${tag}-E`, firstName: tag, lastName: "Employee", workEmail: email, designation: "Trainer", employmentType: "FULL_TIME", status: "ONBOARDING", dateOfJoining: "2026-01-05", managerId: managerEmployee.id });
  const saved = await db.employee.findUnique({ where: { workEmail: email } });
  assert.ok(saved, "Employee creation failed: " + [...createdPage.matchAll(/role="alert"[^>]*>([\s\S]*?)<\/div>/g)].map(match => match[1].replace(/<[^>]*>/g, "")).join("; "));
  const employee = await db.employee.findUniqueOrThrow({ where: { workEmail: email } }); employees.push(employee.id);
  await db.employee.update({ where: { id: employee.id }, data: { userId: staff.id } });
  assert.equal(await db.onboardingTask.count({ where: { employeeId: employee.id } }), 10);
  assert.ok((await page("/hr", staff)).includes("Your leave balances"));
  const clockIn = await form("/hr", staff, "Check in");
  await Promise.all([submit(clockIn), submit(clockIn)]);
  assert.equal(await db.attendanceSession.count({ where: { employeeId: employee.id, checkOut: null } }), 1, "Parallel check-in must create one open session");
  await submit(await form("/hr", staff, "Check out"));
  assert.equal(await db.attendanceSession.count({ where: { employeeId: employee.id, checkOut: null } }), 0);
  const previousDay = new Date(new Date(new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10)).getTime() - 86400000);
  const missed = await db.attendanceSession.create({ data: { employeeId: employee.id, workDate: previousDay, checkIn: new Date(previousDay.getTime() + 4 * 3600000) } });
  const correctionForm = await form(`/hr/attendance?month=${previousDay.toISOString().slice(0, 7)}`, staff, missed.id, 'name="time"');
  await Promise.all([submit(correctionForm, { time: "17:30", reason: "Missed test punch" }), submit(correctionForm, { time: "17:30", reason: "Missed test punch" })]);
  assert.equal(await db.attendanceCorrection.count({ where: { sessionId: missed.id } }), 1);
  const correction = await db.attendanceCorrection.findFirstOrThrow({ where: { sessionId: missed.id } });
  await submit(await form("/approvals", manager, correction.id), { decision: "APPROVED" });
  assert.ok((await db.attendanceSession.findUniqueOrThrow({ where: { id: missed.id } })).checkOut);
  const manualSession = await form("/hr/attendance/register", manager, 'name="in"');
  const manualValues = { employeeId: employee.id, date: previousDay.toISOString().slice(0, 10), in: "18:00", out: "19:00" };
  await submit(manualSession, manualValues); await submit(manualSession, manualValues);
  assert.equal(await db.attendanceSession.count({ where: { employeeId: employee.id, workDate: previousDay } }), 2, "Overlapping manual sessions must not be duplicated");
  const leaveType = await db.leaveType.create({ data: { code: tag.slice(-6).toUpperCase(), name: `${tag} Leave`, annualQuota: 2, paid: true } });
  const leaveForm = await form("/hr/leave", staff, 'name="leaveTypeId"');
  const leave = { leaveTypeId: leaveType.id, startDate: "2027-03-01", endDate: "2027-03-01", reason: "Workflow verification" };
  await Promise.all([submit(leaveForm, leave), submit(leaveForm, leave)]);
  assert.equal(await db.leaveRequest.count({ where: { employeeId: employee.id } }), 1, "Parallel overlapping leave must not duplicate");
  await submit(await form("/hr/approvals", manager, 'name="decision"'), { decision: "APPROVED" });
  assert.equal((await db.leaveRequest.findFirstOrThrow({ where: { employeeId: employee.id } })).status, "APPROVED");
  await submit(await form("/hr/leave", staff, "Cancel"));
  assert.equal((await db.leaveRequest.findFirstOrThrow({ where: { employeeId: employee.id } })).status, "CANCELLED");
  const task = await db.onboardingTask.findFirstOrThrow({ where: { employeeId: employee.id } });
  await submit(await form(`/hr/employees/${employee.id}`, staff, task.id, 'name="status"'), { status: "COMPLETED" });
  assert.equal((await db.onboardingTask.findUniqueOrThrow({ where: { id: task.id } })).status, "COMPLETED");
  const trainingModule = await db.trainingModule.create({ data: { title: `${tag} Training` } });
  await submit(await form(`/hr/employees/${employee.id}`, manager, 'name="moduleId"'), { moduleId: trainingModule.id });
  const training = await db.trainingAssignment.findUniqueOrThrow({ where: { employeeId_moduleId: { employeeId: employee.id, moduleId: trainingModule.id } } });
  await submit(await form(`/hr/employees/${employee.id}`, staff, training.id, 'name="status"'), { status: "COMPLETED" });
  assert.ok((await db.trainingAssignment.findUniqueOrThrow({ where: { id: training.id } })).completedAt);
  await submit(await form("/hr/assets", admin, "Add asset"), { code: `${tag}-A`, name: `${tag} Laptop`, category: "Laptop", serialNo: "", purchaseDate: "2026-01-01", notes: "Workflow fixture" });
  const asset = await db.asset.findFirstOrThrow({ where: { code: `${tag}-A`.toUpperCase() } });
  await submit(await form("/hr/assets", admin, asset.id, 'name="employeeId"'), { employeeId: employee.id });
  assert.equal((await db.asset.findUniqueOrThrow({ where: { id: asset.id } })).employeeId, employee.id);
  await submit(await form("/hr/assets", admin, asset.id, 'value="AVAILABLE"'), { status: "AVAILABLE" });
  assert.equal((await db.asset.findUniqueOrThrow({ where: { id: asset.id } })).employeeId, null);
  const profile = `/hr/employees/${employee.id}`;
  await submit(await form(profile, staff, 'name="file"'), { type: "Other", file: new File(["%PDF-1.4\nWorkflow fixture\n%%EOF\n"], "workflow.pdf", { type: "application/pdf" }) });
  const document = await db.employeeDocument.findFirstOrThrow({ where: { employeeId: employee.id } });
  assert.ok([403, 404].includes((await fetch(new URL(`/api/documents/${document.id}`, base), { headers: { cookie: manager.cookie } })).status), "Managers must not download employee identity documents");
  await submit(await form(profile, admin, document.id, 'name="status"'), { status: "VERIFIED" });
  assert.equal((await db.employeeDocument.findUniqueOrThrow({ where: { id: document.id } })).status, "VERIFIED");
  await submit(await form(profile, admin, "Save changes"), { code: employee.code, firstName: tag, lastName: "Employee", workEmail: email, designation: "Trainer", employmentType: "FULL_TIME", status: "ACTIVE", dateOfJoining: "2026-01-05", managerId: managerEmployee.id });
  assert.equal((await db.employee.findUniqueOrThrow({ where: { id: employee.id } })).status, "ACTIVE");
  await submit(await form("/hr/reviews/cycles/new", admin, "Start review cycle"), { name: `${tag} Review`, kind: "ANNUAL", periodStart: "2026-01-01", periodEnd: "2026-12-31", employeeIds: employee.id });
  const cycle = await db.reviewCycle.findFirstOrThrow({ where: { name: `${tag} Review` } });
  const review = await db.performanceReview.findFirstOrThrow({ where: { employeeId: employee.id, cycleId: cycle.id } });
  const reviewPath = `/hr/reviews/${review.id}`;
  await submit(await form(reviewPath, staff, "Save goals"), { title_new0: "Deliver workshops", measure_new0: "Session reports", weight_new0: "100" });
  await submit(await form(reviewPath, manager, "Agree these goals"));
  await submit(await form(`/hr/reviews/cycles/${cycle.id}`, admin, "Open reviews"));
  const goal = await db.reviewGoal.findFirstOrThrow({ where: { reviewId: review.id } });
  const privateSelf = `${tag} private self draft`;
  await submit(await form(reviewPath, staff, 'name="selfAchievements"'), { [`rating_${goal.id}`]: "4", selfAchievements: privateSelf, intent: "draft" });
  assert.ok(!(await page(reviewPath, manager)).includes(privateSelf), "A reviewer must not see a private self-review draft");
  await submit(await form(reviewPath, staff, 'name="selfAchievements"'), { [`rating_${goal.id}`]: "4", selfAchievements: "Test achievements", intent: "submit" });
  const privateManager = `${tag} private manager draft`;
  await submit(await form(reviewPath, manager, 'name="managerStrengths"'), { [`rating_${goal.id}`]: "4", managerRating: "4", managerComment: privateManager, intent: "draft" });
  assert.ok(!(await page(reviewPath, staff)).includes(privateManager), "An employee must not see an unshared manager draft");
  await submit(await form(reviewPath, manager, 'name="managerStrengths"'), { [`rating_${goal.id}`]: "4", managerRating: "4", managerComment: "Test review", intent: "submit" });
  await submit(await form(reviewPath, staff, 'name="employeeComment"'), { employeeComment: "Read the test review" });
  assert.ok((await db.performanceReview.findUniqueOrThrow({ where: { id: review.id } })).acknowledgedAt);
  console.log("HR workflows passed: employee/onboarding creation, concurrent check-in, check-out, concurrent leave, approval/cancel, own onboarding/training completion and asset issue/return.");
  console.log("HR document/review checks passed: upload/verification, manager download denial, goal agreement, private drafts, self/manager submission and employee acknowledgment.");

  await submit(await form("/inventory", admin, "Add item"), { sku: tag, name: `${tag} Robotics kit`, category: "Robotics kit", unit: "kit", returnable: "on", opening: "20", reorderLevel: "5", unitCost: "", location: "Test shelf", notes: "Workflow fixture" });
  const item = await db.stockItem.findFirstOrThrow({ where: { sku: tag.toUpperCase() } });
  await submit(await form(`/inventory/${item.id}`, admin, 'name="sku"'), { sku: item.sku, name: item.name, category: item.category, unit: item.unit, reorderLevel: "5", unitCost: "", location: "Test shelf", notes: "Workflow fixture" });
  assert.equal((await db.stockItem.findUniqueOrThrow({ where: { id: item.id } })).returnable, true, "Historical item return rules must not change");
  await submit(await form("/inventory/requests/new", staff, "Send request"), { itemId: item.id, quantity: "8", purpose: `${tag} Teaching`, projectId: "", neededBy: "2027-03-01", returnBy: "2027-03-05" });
  const request = await db.stockRequest.findFirstOrThrow({ where: { requesterId: staff.id }, include: { lines: true } });
  assert.equal(request.status, "PENDING");
  const path = `/inventory/requests/${request.id}`;
  await submit(await form(path, manager, 'name="decision"'), { decision: "APPROVED" });
  const issue = await form(path, admin, "Issue items");
  await submit(issue, { [`issue_${request.lines[0].id}`]: "8" }, staff);
  assert.equal((await db.stockItem.findUniqueOrThrow({ where: { id: item.id } })).onHand, 20, "Employee cannot issue stock");
  await Promise.all([submit(issue, { [`issue_${request.lines[0].id}`]: "8" }), submit(issue, { [`issue_${request.lines[0].id}`]: "8" })]);
  assert.equal((await db.stockItem.findUniqueOrThrow({ where: { id: item.id } })).onHand, 12, "Duplicate issue must deduct once");
  const back = await form(path, admin, "Record return");
  const partial = { [`return_${request.lines[0].id}`]: "2", [`lost_${request.lines[0].id}`]: "1", note: "One damaged kit" };
  await submit(back, partial); await submit(back, partial);
  assert.equal((await db.stockItem.findUniqueOrThrow({ where: { id: item.id } })).onHand, 14, "Replayed partial return must not add twice");
  await submit(await form(path, admin, "Record return"), { [`return_${request.lines[0].id}`]: "5", [`lost_${request.lines[0].id}`]: "0", note: "Remaining kits returned" });
  const closed = await db.stockRequest.findUniqueOrThrow({ where: { id: request.id }, include: { lines: true } });
  assert.equal(closed.status, "CLOSED"); assert.equal(closed.lines[0].returned, 7); assert.equal(closed.lines[0].writtenOff, 1);
  const ledger = await db.stockMovement.aggregate({ where: { itemId: item.id }, _sum: { quantity: true } });
  assert.equal(ledger._sum.quantity, 19); assert.equal((await db.stockItem.findUniqueOrThrow({ where: { id: item.id } })).onHand, 19);
  assert.equal(await db.stockMovement.count({ where: { itemId: item.id, type: "WRITE_OFF", quantity: 0 } }), 1);
  const outsider = await createUser("EMPLOYEE", "Unrelated");
  const secret = `${tag} Private unrelated loan`;
  const [foreignRequest] = await db.$transaction([
    db.stockRequest.create({ data: { number: 900000 + Math.floor(Math.random() * 99999), requesterId: outsider.id, purpose: secret, status: "ISSUED", returnBy: new Date("2026-01-05"), lines: { create: { itemId: item.id, quantity: 1, issued: 1 } }, movements: { create: { itemId: item.id, byId: admin.id, type: "ISSUE", quantity: -1, note: secret } } } }),
    db.stockItem.update({ where: { id: item.id }, data: { onHand: { decrement: 1 } } }),
  ]);
  assert.ok(!(await page(`/inventory/${item.id}`, staff)).includes(secret), "Item ledger must not expose unrelated request notes");
  assert.ok(!(await page(`/inventory/${item.id}`, staff)).includes(`${tag} Unrelated`), "Item loans must not expose unrelated requesters");
  assert.ok(!(await (await fetch(new URL(`/inventory/requests/${foreignRequest.id}`, base), { headers: { cookie: staff.cookie } })).text()).includes(secret), "Unrelated requests stay private");
  for (const path of ["/hr/employees?status=bogus", "/hr/employees?q=a&q=b", "/inventory?q=a&q=b", "/inventory/requests?status=overdue"]) await page(path, admin);
  console.log("Inventory workflows passed: create/request/manager approval, unauthorized issue rejection, concurrent issue, partial return replay rejection, loss audit, complete return and ledger reconciliation; malformed filter URLs render.");
  const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  await submit(await form("/hr/exits/resign", staff, "Send my resignation"), { proposedLastDay: today, reason: "Disposable workflow verification" });
  const exit = await db.employeeExit.findFirstOrThrow({ where: { employeeId: employee.id } });
  assert.equal(exit.stage, "REQUESTED");
  const exitPath = `/hr/exits/${exit.id}`;
  await submit(await form(exitPath, manager, "Accept resignation"), { lastWorkingDay: today });
  assert.equal((await db.employee.findUniqueOrThrow({ where: { id: employee.id } })).status, "ON_NOTICE");
  assert.ok(await db.exitTask.count({ where: { exitId: exit.id } }));
  await submit(await form(exitPath, admin, "Mark as left"));
  assert.equal((await db.employee.findUniqueOrThrow({ where: { id: employee.id } })).status, "EXITED");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).active, false);
  assert.equal((await fetch(new URL("/hr", base), { headers: { cookie: staff.cookie }, redirect: "manual" })).status, 307, "Exited user's existing session must stop working");
  console.log("Exit workflow passed: resignation, manager acceptance/checklist, admin departure, employee status and login revocation.");
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Workflow check failed"); process.exitCode = 1; }).finally(async () => {
  await db.stockRequest.deleteMany({ where: { requesterId: { in: users } } });
  await db.stockItem.deleteMany({ where: { sku: tag.toUpperCase() } });
  await db.asset.deleteMany({ where: { code: `${tag}-A`.toUpperCase() } });
  await db.reviewCycle.deleteMany({ where: { name: `${tag} Review` } });
  await db.employeeExit.deleteMany({ where: { employeeId: { in: employees } } });
  await db.employee.deleteMany({ where: { OR: [{ id: { in: employees } }, { workEmail: `${tag}-employee-record@example.invalid`.toLowerCase() }] } });
  await db.leaveType.deleteMany({ where: { name: `${tag} Leave` } });
  await db.trainingModule.deleteMany({ where: { title: `${tag} Training` } });
  await db.session.deleteMany({ where: { id: { in: sessions } } });
  await db.activityLog.deleteMany({ where: { OR: [{ userId: { in: users } }, { summary: { contains: tag } }] } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
