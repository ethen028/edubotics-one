/**
 * Demo data for trying Edubotics One or showing it to someone: eight made-up staff with logins for every role,
 * and a few weeks of Kerala ed-tech work around today (schools, deals, invoices, workshops, sessions, plan).
 *
 * Run with `npm run db:seed-demo` after `npm run db:seed`, on a database of its own. It refuses to run:
 * - on a database whose name doesn't contain "demo" or "test" (set DEMO_SEED_ALLOW=yes to override), and
 * - on any database that already holds real records (people, schools, leads, invoices, projects, workshops).
 * Running it again on the demo database only resets the demo passwords.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { PrismaClient, type Prisma, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loadOperatingCalendar } from "../src/lib/plan-load";
import { monthStart } from "../src/lib/plan-rules";

if (existsSync(".env")) loadEnvFile(".env");

const DOMAIN = "example.com"; // reserved for examples, so no email can ever reach a real inbox
const ADMIN_EMAIL = `admin.demo@${DOMAIN}`;

function refuse(message: string): never {
  console.error(`Demo data not added. ${message}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? "";
let dbName = "";
try {
  dbName = decodeURIComponent(new URL(url).pathname.slice(1));
} catch {
  refuse("DATABASE_URL is missing or not a postgres address.");
}
if (!/demo|test/i.test(dbName) && process.env.DEMO_SEED_ALLOW !== "yes") {
  refuse(
    `The database is called "${dbName}". Demo data only goes into a database whose name contains "demo" or "test", ` +
      "so it can never land in the office database by mistake. Set DEMO_SEED_ALLOW=yes if this really is a spare database.",
  );
}

const prisma = new PrismaClient();

// ---- dates around today, in India time -------------------------------------------------------------------------
const IST = 5.5 * 3600000;
const DAY = 86400000;
const now = new Date();
const today = new Date(Date.UTC(new Date(now.getTime() + IST).getUTCFullYear(), new Date(now.getTime() + IST).getUTCMonth(), new Date(now.getTime() + IST).getUTCDate()));
const day = (offset: number) => new Date(today.getTime() + offset * DAY);
/** A time on a given day, written as India time. */
const at = (d: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(d.getTime() + (h * 60 + m) * 60000 - IST);
};
const isSunday = (d: Date) => d.getUTCDay() === 0;
/** Working days (Monday to Saturday) from `from` days ago up to and including `to` days from today. */
function workingDays(from: number, to: number) {
  const out: Date[] = [];
  for (let i = from; i <= to; i++) if (!isSunday(day(i))) out.push(day(i));
  return out;
}
function financialYear(d: Date) {
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}
const money = (n: number) => Math.round(n * 100) / 100;

// ---- people ----------------------------------------------------------------------------------------------------
type Person = { code: string; first: string; last: string; login: string; role: Role; title: string; dept: string; joined: string; basic: number; hra: number; special: number };
const PEOPLE: Person[] = [
  { code: "DEMO-001", first: "Anjali", last: "Menon", login: "admin.demo", role: "ADMIN", title: "Director", dept: "Management", joined: "2022-06-01", basic: 45000, hra: 18000, special: 12000 },
  { code: "DEMO-002", first: "Fathima", last: "Rahman", login: "hr.demo", role: "HR", title: "HR and Admin Executive", dept: "Management", joined: "2024-01-15", basic: 18000, hra: 7200, special: 4800 },
  { code: "DEMO-003", first: "Arjun", last: "Nair", login: "manager.demo", role: "MANAGER", title: "Operations Manager", dept: "Operations", joined: "2023-04-03", basic: 30000, hra: 12000, special: 8000 },
  { code: "DEMO-004", first: "Rahul", last: "Varghese", login: "employee.demo", role: "EMPLOYEE", title: "Sales Executive", dept: "Sales & Partnerships", joined: "2024-07-01", basic: 16000, hra: 6400, special: 3600 },
  { code: "DEMO-005", first: "Sneha", last: "Pillai", login: "sales.demo", role: "EMPLOYEE", title: "Sales Executive", dept: "Sales & Partnerships", joined: "2025-02-10", basic: 15000, hra: 6000, special: 3000 },
  { code: "DEMO-006", first: "Vishnu", last: "Krishnan", login: "trainer.demo", role: "EMPLOYEE", title: "Robotics Trainer", dept: "Training & Delivery", joined: "2024-06-03", basic: 17000, hra: 6800, special: 3200 },
  { code: "DEMO-007", first: "Aswathy", last: "Thomas", login: "trainer2.demo", role: "EMPLOYEE", title: "Robotics Trainer", dept: "Training & Delivery", joined: "2025-06-02", basic: 15000, hra: 6000, special: 2500 },
  { code: "DEMO-008", first: "Nikhil", last: "Joseph", login: "engineer.demo", role: "EMPLOYEE", title: "R&D Engineer", dept: "R&D / Technical", joined: "2025-01-06", basic: 20000, hra: 8000, special: 4000 },
];

async function hasRealData(db: Prisma.TransactionClient) {
  const counts = await Promise.all([
    db.employee.count(),
    db.organization.count(),
    db.lead.count(),
    db.invoice.count(),
    db.project.count(),
    db.workshop.count(),
    db.user.count({ where: { role: { not: "ADMIN" } } }),
  ]);
  return counts.some((c) => c > 0);
}

async function main(db: Prisma.TransactionClient) {
  const password = process.env.DEMO_PASSWORD || `Demo-${randomBytes(6).toString("base64url")}-26`;
  if (password.length < 10) refuse("DEMO_PASSWORD needs at least 10 characters.");
  const passwordHash = await bcrypt.hash(password, 12);

  if (await db.user.findUnique({ where: { email: ADMIN_EMAIL } })) {
    await db.user.updateMany({ where: { email: { endsWith: `.demo@${DOMAIN}` } }, data: { passwordHash, active: true } });
    printLogins(password, "Demo data was already here, so only the passwords were reset.");
    return;
  }
  if (await hasRealData(db)) {
    refuse("This database already has people, schools, leads, invoices, projects or workshops in it. Use an empty database for the demo.");
  }

  const leaveTypes = await db.leaveType.findMany();
  const departments = await db.department.findMany();
  if (leaveTypes.length === 0 || departments.length === 0) refuse("Run `npm run db:seed` first, so departments, leave types and holidays are in place.");
  const dept = (name: string) => departments.find((d) => d.name === name)?.id ?? null;
  const leaveType = (code: string) => leaveTypes.find((t) => t.code === code)!.id;

  await db.companySettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
  await db.companySettings.update({
    where: { id: 1 },
    data: {
      weeklyOffDays: [0], // Saturdays hold the weekly review in the operating calendar
      companyPhone: "+91 484 400 0000",
      companyEmail: `office@${DOMAIN}`,
      gstin: "32AAACE0000A1Z5",
      pan: "AAACE0000A",
      bankName: "Demo Bank",
      bankAccountName: "Edubotics Global",
      bankAccountNo: "000000000000",
      bankIfsc: "DEMO0000001",
      twoWheelerRatePerKm: 4,
      carRatePerKm: 9,
      certSignatoryName: "Anjali Menon",
    },
  });

  // People, logins and salaries. Arjun manages everyone except the director and himself.
  const users: Record<string, { id: string; name: string }> = {};
  const employees: Record<string, { id: string }> = {};
  for (const p of PEOPLE) {
    const name = `${p.first} ${p.last}`;
    const user = await db.user.create({
      data: { email: `${p.login}@${DOMAIN}`, name, role: p.role, passwordHash, emailVerifiedAt: new Date(), passwordChangedAt: new Date() },
    });
    users[p.login] = user;
    employees[p.login] = await db.employee.create({
      data: {
        code: p.code,
        firstName: p.first,
        lastName: p.last,
        workEmail: `${p.login}@${DOMAIN}`,
        phone: `+91 90000 0${p.code.slice(-4)}`,
        designation: p.title,
        departmentId: dept(p.dept),
        dateOfJoining: new Date(`${p.joined}T00:00:00Z`),
        city: "Kochi",
        userId: user.id,
        salaries: { create: { effectiveFrom: new Date(`${p.joined}T00:00:00Z`), basic: p.basic, hra: p.hra, specialAllowance: p.special } },
      },
    });
  }
  const manager = employees["manager.demo"];
  await db.employee.updateMany({ where: { code: { notIn: ["DEMO-001", "DEMO-003"] } }, data: { managerId: manager.id } });
  await db.employee.update({ where: { id: manager.id }, data: { managerId: employees["admin.demo"].id } });
  const U = (login: string) => users[login].id;

  // Attendance for the last two weeks (no Sundays), and a punch-in today when today is a working day.
  for (const d of workingDays(-14, -1)) {
    for (const p of PEOPLE) {
      if (p.login === "trainer2.demo" && d.getTime() >= day(-3).getTime()) continue; // on leave
      const late = (p.code.charCodeAt(7) + d.getUTCDate()) % 5 === 0;
      await db.attendanceSession.create({
        data: { employeeId: employees[p.login].id, workDate: d, checkIn: at(d, late ? "09:40" : "09:05"), checkOut: at(d, late ? "18:20" : "18:10") },
      });
    }
  }
  if (!isSunday(today)) {
    for (const login of ["admin.demo", "manager.demo", "employee.demo", "trainer.demo", "hr.demo"]) {
      await db.attendanceSession.create({ data: { employeeId: employees[login].id, workDate: today, checkIn: at(today, "09:10") } });
    }
  }

  // Leave: one approved last week, one waiting for the manager, one coming up.
  await db.leaveRequest.createMany({
    data: [
      { employeeId: employees["trainer2.demo"].id, leaveTypeId: leaveType("SL"), startDate: day(-3), endDate: day(-1), days: 2, reason: "Fever", status: "APPROVED", approverId: manager.id, decidedAt: day(-3) },
      { employeeId: employees["employee.demo"].id, leaveTypeId: leaveType("CL"), startDate: day(9), endDate: day(10), days: 2, reason: "Family function in Kottayam", status: "PENDING" },
      { employeeId: employees["engineer.demo"].id, leaveTypeId: leaveType("CL"), startDate: day(4), endDate: day(4), days: 1, reason: "Bank work", status: "APPROVED", approverId: manager.id, decidedAt: day(-2) },
    ],
  });

  // ---- CRM ----------------------------------------------------------------------------------------------------
  const orgs = [
    { name: "Maple Leaf Public School", type: "SCHOOL", board: "CBSE", city: "Kakkanad", district: "Ernakulam", owner: "employee.demo", contact: ["Dr. Leena Mathew", "Principal"] },
    { name: "Lakeview Vidyalaya", type: "SCHOOL", board: "State", city: "Alappuzha", district: "Alappuzha", owner: "employee.demo", contact: ["Sr. Mary Joseph", "Principal"] },
    { name: "Hillcrest Central School", type: "SCHOOL", board: "CBSE", city: "Thodupuzha", district: "Idukki", owner: "sales.demo", contact: ["Mr. Sajeev Kumar", "Vice Principal"] },
    { name: "Riverside International School", type: "SCHOOL", board: "ICSE", city: "Aluva", district: "Ernakulam", owner: "sales.demo", contact: ["Ms. Divya Raj", "Academic Coordinator"] },
    { name: "Coastal Model HSS", type: "SCHOOL", board: "State", city: "Kozhikode", district: "Kozhikode", owner: "employee.demo", contact: ["Mr. Haris P", "Headmaster"] },
    { name: "Periyar College of Engineering", type: "COLLEGE", board: null, city: "Aluva", district: "Ernakulam", owner: "sales.demo", contact: ["Prof. Suresh Babu", "Head, ECE"] },
    { name: "Malabar Institute of Technology", type: "COLLEGE", board: null, city: "Kannur", district: "Kannur", owner: "employee.demo", contact: ["Dr. Ameena K", "Placement Officer"] },
  ] as const;
  const org: Record<string, { id: string; contactId: string }> = {};
  for (const o of orgs) {
    const created = await db.organization.create({
      data: {
        name: o.name,
        type: o.type,
        board: o.board,
        city: o.city,
        district: o.district,
        address: `${o.city}, ${o.district} district, Kerala`,
        email: `office.${o.name.split(" ")[0].toLowerCase()}@${DOMAIN}`,
        ownerId: U(o.owner),
        contacts: { create: { name: o.contact[0], designation: o.contact[1], email: `${o.contact[0].split(" ").at(-1)!.toLowerCase()}@${DOMAIN}`, phone: "+91 94470 00000", ownerId: U(o.owner) } },
      },
      include: { contacts: true },
    });
    org[o.name] = { id: created.id, contactId: created.contacts[0].id };
  }

  const leads = [
    ["St. Jude's English School", "SCHOOL", "Fort Kochi", "Robotics lab for classes 6-9", "REFERRAL", "NEW", "sales.demo", -1],
    ["Green Meadows School", "SCHOOL", "Thrissur", "After-school coding club", "WEBSITE", "CONTACTED", "employee.demo", -4],
    ["Sree Narayana Polytechnic", "COLLEGE", "Kollam", "IoT workshop for 2nd years", "EMAIL", "QUALIFIED", "sales.demo", -6],
    ["Bethany Girls HSS", "SCHOOL", "Kottayam", "ATL lab support", "PHONE", "CONTACTED", "employee.demo", -9],
    ["Carmel Academy", "SCHOOL", "Palakkad", "Summer camp enquiry", "SOCIAL", "UNQUALIFIED", "sales.demo", -12],
    ["Westfort College", "COLLEGE", "Thrissur", "Final-year project guidance", "EVENT", "NEW", "employee.demo", -2],
    ["Little Flower School", "SCHOOL", "Kollam", "Teacher training on Arduino", "WALK_IN", "QUALIFIED", "sales.demo", -15],
  ] as const;
  for (const [name, type, city, interest, source, status, owner, ago] of leads) {
    await db.lead.create({
      data: { name: `Office, ${name}`, organizationName: name, orgType: type, city, interest, source, status, ownerId: U(owner), email: `enquiry.${name.split(" ")[0].toLowerCase().replace(/\W/g, "")}@${DOMAIN}`, createdAt: day(ago) },
    });
  }

  const deals = [
    { title: "Robotics lab, classes 5-9", org: "Maple Leaf Public School", value: 420000, stage: "WON", students: 320, owner: "employee.demo", closed: -70 },
    { title: "Coding club, two batches", org: "Lakeview Vidyalaya", value: 180000, stage: "WON", students: 120, owner: "employee.demo", closed: -40 },
    { title: "ATL lab support 2026-27", org: "Hillcrest Central School", value: 240000, stage: "WON", students: 200, owner: "sales.demo", closed: -25 },
    { title: "Final-year IoT projects", org: "Periyar College of Engineering", value: 150000, stage: "WON", students: 30, owner: "sales.demo", closed: -20 },
    { title: "STEM week and robotics demo", org: "Riverside International School", value: 95000, stage: "PROPOSAL", students: 150, owner: "sales.demo", closed: null },
    { title: "Robotics for classes 6-8", org: "Coastal Model HSS", value: 210000, stage: "NEGOTIATION", students: 180, owner: "employee.demo", closed: null },
    { title: "Drone workshop for mechanical", org: "Malabar Institute of Technology", value: 60000, stage: "DEMO", students: 60, owner: "employee.demo", closed: null },
  ] as const;
  const deal: Record<string, { id: string; ownerId: string }> = {};
  for (const d of deals) {
    const created = await db.deal.create({
      data: {
        title: d.title,
        value: d.value,
        stage: d.stage,
        program: d.org.includes("College") || d.org.includes("Institute") ? "College projects" : "School robotics",
        students: d.students,
        organizationId: org[d.org].id,
        contactId: org[d.org].contactId,
        ownerId: U(d.owner),
        expectedClose: d.closed === null ? day(20) : day(d.closed),
        closedAt: d.closed === null ? null : day(d.closed),
      },
    });
    deal[d.title] = { id: created.id, ownerId: U(d.owner) };
  }

  // Calls, meetings and visits this month, and follow-ups coming up.
  const acts = [
    ["MEETING", "Demo of the robotics kit to the principal", "Coastal Model HSS", "Robotics for classes 6-8", "employee.demo", -6, true],
    ["VISIT", "Lab space visit", "Riverside International School", "STEM week and robotics demo", "sales.demo", -4, true],
    ["CALL", "Follow up on the proposal", "Riverside International School", "STEM week and robotics demo", "sales.demo", 1, false],
    ["MEETING", "Department meeting for the drone workshop", "Malabar Institute of Technology", "Drone workshop for mechanical", "employee.demo", 3, false],
    ["MEETING", "Price discussion with the manager", "Coastal Model HSS", "Robotics for classes 6-8", "employee.demo", -2, true],
    ["EMAIL", "Send the revised quote", "Coastal Model HSS", "Robotics for classes 6-8", "employee.demo", 0, false],
  ] as const;
  for (const [type, subject, o, d, who, when, done] of acts) {
    await db.activity.create({
      data: { type, subject, dueAt: at(day(when), "11:00"), done, assigneeId: U(who), createdById: U(who), organizationId: org[o].id, dealId: deal[d].id, createdAt: day(Math.min(when, 0) - 1) },
    });
  }

  // ---- quotes, invoices and payments ----------------------------------------------------------------------------
  const settings = await db.companySettings.findUniqueOrThrow({ where: { id: 1 } });
  const prefix = settings.invoicePrefix;
  const fy = financialYear(today);
  let invoiceSeq = 0;
  let quoteSeq = 0;
  async function invoice(o: string, d: string | null, lines: [string, number, number][], issued: number, payments: [number, number, number][]) {
    const subtotal = money(lines.reduce((s, [, q, p]) => s + q * p, 0));
    const half = money(subtotal * 0.09);
    const total = money(subtotal + half * 2);
    invoiceSeq++;
    const inv = await db.invoice.create({
      data: {
        fy,
        seq: invoiceSeq,
        number: `${prefix}/${fy}/${String(invoiceSeq).padStart(3, "0")}`,
        status: "ISSUED",
        organizationId: org[o].id,
        contactId: org[o].contactId,
        dealId: d ? deal[d].id : null,
        billToName: o,
        billToAddress: `${o}, Kerala`,
        placeOfSupply: "Kerala",
        issueDate: day(issued),
        dueDate: day(issued + 15),
        issuedAt: day(issued),
        subtotal,
        cgst: half,
        sgst: half,
        total,
        createdById: U("manager.demo"),
        lines: { create: lines.map(([description, quantity, unitPrice], i) => ({ position: i, description, sac: "999293", quantity, unitPrice, gstRate: 18, amount: money(quantity * unitPrice) })) },
      },
    });
    for (const [when, share, tdsPct] of payments) {
      const gross = money(total * share);
      const tds = money(subtotal * share * (tdsPct / 100));
      await db.invoicePayment.create({
        data: { invoiceId: inv.id, receivedOn: day(when), amount: money(gross - tds), tds, method: "BANK_TRANSFER", reference: `NEFT${String(900000 + invoiceSeq * 37 + when * -1)}`, recordedById: U("hr.demo") },
      });
    }
  }
  await invoice("Maple Leaf Public School", "Robotics lab, classes 5-9", [["Robotics lab programme, term 1 (320 students)", 320, 650]], -60, [[-45, 1, 0]]);
  await invoice("Lakeview Vidyalaya", "Coding club, two batches", [["Coding club, term 1", 2, 45000]], -35, [[-20, 0.5, 0]]);
  await invoice("Hillcrest Central School", "ATL lab support 2026-27", [["ATL lab support, first half", 1, 120000]], -20, [[-8, 1, 2]]);
  await invoice("Periyar College of Engineering", "Final-year IoT projects", [["Project guidance and kits, 30 students", 30, 2500]], -14, [[-5, 0.6, 0]]);
  await invoice("Lakeview Vidyalaya", "Coding club, two batches", [["Coding club, term 2", 2, 45000]], -3, []);
  await invoice("Maple Leaf Public School", "Robotics lab, classes 5-9", [["Robotics lab programme, term 2 (320 students)", 320, 650]], -40, [[-28, 0.5, 0]]);

  const quoteSubtotal = 178000;
  quoteSeq++;
  await db.quote.create({
    data: {
      fy,
      seq: quoteSeq,
      number: `${prefix}/Q/${fy}/${String(quoteSeq).padStart(3, "0")}`,
      status: "SENT",
      organizationId: org["Coastal Model HSS"].id,
      contactId: org["Coastal Model HSS"].contactId,
      dealId: deal["Robotics for classes 6-8"].id,
      billToName: "Coastal Model HSS",
      placeOfSupply: "Kerala",
      quoteDate: day(-5),
      validUntil: day(25),
      sentAt: day(-5),
      subtotal: quoteSubtotal,
      cgst: money(quoteSubtotal * 0.09),
      sgst: money(quoteSubtotal * 0.09),
      total: money(quoteSubtotal * 1.18),
      terms: "50% on signing, 50% at the end of term 1.",
      createdById: U("employee.demo"),
      lines: { create: [{ position: 0, description: "Robotics programme for classes 6-8, 180 students", sac: "999293", quantity: 180, unitPrice: 900, gstRate: 18, amount: 162000 }, { position: 1, description: "Kit set for the school lab", sac: "999293", quantity: 8, unitPrice: 2000, gstRate: 18, amount: 16000 }] },
    },
  });

  // ---- delivery: projects, school programmes and sessions --------------------------------------------------------
  const mapleProject = await db.project.create({
    data: {
      name: "Maple Leaf robotics lab 2026-27",
      kind: "SCHOOL_PROGRAMME",
      stage: "EXECUTE",
      startDate: day(-60),
      dueDate: day(150),
      ownerId: U("manager.demo"),
      organizationId: org["Maple Leaf Public School"].id,
      dealId: deal["Robotics lab, classes 5-9"].id,
      departmentId: dept("Training & Delivery"),
      members: { create: [{ userId: U("manager.demo"), role: "Coordinator" }, { userId: U("trainer.demo"), role: "Trainer" }, { userId: U("trainer2.demo"), role: "Trainer" }] },
      milestones: { create: [{ title: "Lab set up", dueDate: day(-45), doneAt: day(-47) }, { title: "Term 1 showcase", dueDate: day(30) }] },
    },
    include: { milestones: true },
  });
  const projectTasks = [
    ["Prepare term 2 lesson plans", "trainer.demo", "IN_PROGRESS", 60, 5, "HIGH"],
    ["Order replacement servo motors", "manager.demo", "TODO", 0, 3, "MEDIUM"],
    ["Plan the term 1 showcase", "trainer2.demo", "TODO", 0, 25, "MEDIUM"],
    ["Set up the lab benches", "trainer.demo", "DONE", 100, -48, "HIGH"],
  ] as const;
  for (const [title, who, status, progress, due, priority] of projectTasks) {
    await db.projectTask.create({
      data: { projectId: mapleProject.id, title, assigneeId: U(who), status, progress, dueDate: day(due), priority, createdById: U("manager.demo"), completedAt: status === "DONE" ? day(due) : null, milestoneId: mapleProject.milestones[status === "DONE" ? 0 : 1].id },
    });
  }
  const collegeProject = await db.project.create({
    data: {
      name: "Periyar final-year IoT projects",
      kind: "STUDENT_PROJECT",
      stage: "EXECUTE",
      startDate: day(-15),
      dueDate: day(120),
      ownerId: U("engineer.demo"),
      organizationId: org["Periyar College of Engineering"].id,
      dealId: deal["Final-year IoT projects"].id,
      members: { create: [{ userId: U("engineer.demo"), role: "Lead engineer" }, { userId: U("sales.demo"), role: "Account" }] },
      tasks: {
        create: [
          { title: "Approve 10 project abstracts", assigneeId: U("engineer.demo"), status: "IN_PROGRESS", progress: 70, dueDate: day(2), createdById: U("manager.demo") },
          { title: "Issue kits to the first 5 teams", assigneeId: U("engineer.demo"), status: "TODO", dueDate: day(8), createdById: U("manager.demo") },
        ],
      },
    },
  });
  await db.project.create({
    data: {
      name: "SOP v2 for school delivery",
      kind: "INTERNAL",
      stage: "PLAN",
      startDate: day(-10),
      dueDate: day(20),
      ownerId: U("manager.demo"),
      members: { create: [{ userId: U("manager.demo"), role: "Owner" }, { userId: U("hr.demo"), role: "Reviewer" }] },
      tasks: { create: [{ title: "Draft the session checklist", assigneeId: U("manager.demo"), status: "REVIEW", progress: 90, dueDate: day(1), createdById: U("manager.demo") }] },
    },
  });

  const programmes = [
    { name: "Robotics lab, classes 5-9", org: "Maple Leaf Public School", trainer: "trainer.demo", grades: "5-9", students: 320, weekday: [1, 3], time: "10:00", classes: ["6A", "7B", "8A"] },
    { name: "Coding club", org: "Lakeview Vidyalaya", trainer: "trainer2.demo", grades: "6-8", students: 120, weekday: [2, 4], time: "14:00", classes: ["Batch 1", "Batch 2"] },
    { name: "ATL lab sessions", org: "Hillcrest Central School", trainer: "trainer.demo", grades: "8-10", students: 200, weekday: [5], time: "11:30", classes: ["ATL group"] },
  ];
  const topics = ["Motors and gears", "Line follower robot", "Ultrasonic sensor", "Scratch loops", "Arduino blink", "Bluetooth car", "Servo arm", "IR remote"];
  for (const p of programmes) {
    const prog = await db.programme.create({
      data: {
        name: p.name,
        organizationId: org[p.org].id,
        contactId: org[p.org].contactId,
        projectId: p.org === "Maple Leaf Public School" ? mapleProject.id : null,
        academicYear: `20${fy.slice(0, 2)}-${fy.slice(3)}`,
        grades: p.grades,
        students: p.students,
        sessionsPlanned: 30,
        startDate: day(-50),
        endDate: day(160),
        status: "RUNNING",
        coordinatorId: U("manager.demo"),
        trainers: { create: { userId: U(p.trainer), classes: p.classes.join(", ") } },
      },
    });
    let n = 0;
    for (const d of workingDays(-21, 14)) {
      if (!p.weekday.includes(d.getUTCDay())) continue;
      const past = d < today;
      const absent = p.trainer === "trainer2.demo" && d >= day(-3) && d < today;
      n++;
      await db.programmeSession.create({
        data: {
          programmeId: prog.id,
          date: d,
          startTime: p.time,
          durationMins: 60,
          classGroup: p.classes[n % p.classes.length],
          topic: topics[n % topics.length],
          trainerId: U(p.trainer),
          status: past ? (absent ? "CANCELLED" : "COMPLETED") : "SCHEDULED",
          studentsPresent: past && !absent ? 32 + (n % 6) : null,
          covered: past && !absent ? `Covered ${topics[n % topics.length].toLowerCase()}; groups built and tested their models.` : null,
          notes: absent ? "Trainer on sick leave; moved to next week." : null,
          issues: past && n === 3 ? "Two servo motors failed. Replacement requested." : null,
          loggedById: past ? U(p.trainer) : null,
          loggedAt: past ? at(d, "17:00") : null,
        },
      });
    }
  }

  // ---- workshops, internships and teacher training ---------------------------------------------------------------
  let receiptSeq = 0;
  const workshops = [
    { title: "Arduino and IoT hands-on workshop", kind: "WORKSHOP", org: "Periyar College of Engineering", start: -12, days: 2, fee: 750, status: "COMPLETED", count: 18, paid: 16 },
    { title: "Robotics internship, October batch", kind: "INTERNSHIP", org: null, start: -5, days: 20, fee: 3500, status: "UPCOMING", count: 8, paid: 6 },
    { title: "Teacher training: Arduino in the classroom", kind: "TEACHER_TRAINING", org: "Lakeview Vidyalaya", start: 6, days: 1, fee: 0, status: "UPCOMING", count: 12, paid: 0 },
    { title: "Drone building bootcamp", kind: "BOOTCAMP", org: "Malabar Institute of Technology", start: 18, days: 3, fee: 1200, status: "UPCOMING", count: 5, paid: 2 },
  ] as const;
  const firstNames = ["Adithya", "Akhila", "Basil", "Devika", "Farhan", "Gopika", "Hari", "Irfan", "Jithin", "Keerthana", "Lakshmi", "Midhun", "Nandana", "Navaneeth", "Riya", "Sanjay", "Tessa", "Vaishnavi", "Yadu", "Zainab"];
  for (const w of workshops) {
    const fee = w.fee;
    const ws = await db.workshop.create({
      data: {
        title: w.title,
        kind: w.kind,
        description: `${w.title} run by Edubotics Global.`,
        audience: w.kind === "TEACHER_TRAINING" ? "SCHOOL" : "COLLEGE",
        venue: w.org ?? "Edubotics lab, Edappally",
        organizationId: w.org ? org[w.org].id : null,
        startDate: day(w.start),
        endDate: day(w.start + w.days - 1),
        hours: w.days * 6,
        capacity: 30,
        feeType: fee === 0 ? "FREE" : "PER_PERSON",
        fee,
        status: w.status,
        coordinatorId: U("manager.demo"),
        createdById: U("manager.demo"),
        certificateTitle: w.kind === "INTERNSHIP" ? "Certificate of Internship" : "Certificate of Participation",
        trainers: { create: [{ userId: U(w.kind === "BOOTCAMP" ? "engineer.demo" : "trainer.demo") }] },
      },
    });
    for (let i = 0; i < w.count; i++) {
      const name = `${firstNames[(i + w.start + 40) % firstNames.length]} ${["K", "M", "S", "P", "R"][i % 5]}`;
      const reg = await db.workshopRegistration.create({
        data: { workshopId: ws.id, name, email: `${name.split(" ")[0].toLowerCase()}${i}@${DOMAIN}`, institution: w.org ?? "Various colleges", fee, addedById: U("hr.demo"), createdAt: day(w.start - 10 + (i % 5)) },
      });
      if (i < w.paid && fee > 0) {
        receiptSeq++;
        await db.workshopPayment.create({
          data: { registrationId: reg.id, amount: fee, paidOn: day(Math.min(w.start - 3 + (i % 3), -1)), method: i % 2 ? "UPI" : "CASH", fy, seq: receiptSeq, number: `${prefix}/R/${fy}/${String(receiptSeq).padStart(4, "0")}`, gstRate: 18, placeOfSupply: "Kerala", recordedById: U("hr.demo") },
        });
      }
    }
  }

  // ---- this month's work plan -------------------------------------------------------------------------------------
  await loadOperatingCalendar(db);
  const month = await db.planMonth.upsert({
    where: { month: monthStart(today) },
    create: { month: monthStart(today), focus: "College projects and workshops", activities: "" },
    update: {},
  });
  const deadline = (n: number) => day(n);
  const planTasks = [
    ["Sales & Marketing", "Book 20 meetings with schools and colleges", "employee.demo", 12, 20, "meetings", 9, "IN_PROGRESS", "GREEN"],
    ["Sales & Marketing", "Close 2 school deals", "sales.demo", 12, 2, "deals", 1, "IN_PROGRESS", "AMBER"],
    ["Projects", "Sign up 30 college final-year projects", "engineer.demo", 10, 30, "projects", 10, "IN_PROGRESS", "RED"],
    ["Training", "Run 600 student workshop seats", "manager.demo", 12, 600, "students", 260, "IN_PROGRESS", "AMBER"],
    ["Operations", "Roll out SOP v2 checklists in every school", "manager.demo", 5, null, null, null, "IN_PROGRESS", "GREEN"],
    ["Accounts", "Collect the Lakeview term 1 balance", "hr.demo", 3, 53100, "₹", 0, "NOT_STARTED", null],
    ["HR & Admin", "Hire one robotics trainer", "hr.demo", 12, 1, "hire", 0, "IN_PROGRESS", "GREEN"],
  ] as const;
  let sort = 0;
  for (const [area, activity, owner, due, target, unit, actual, status, rag] of planTasks) {
    const t = await db.planTask.create({
      data: {
        monthId: month.id,
        area,
        activity,
        ownerId: U(owner),
        deadline: deadline(due),
        target,
        unit,
        actual,
        status,
        rag,
        ragAt: rag ? day(-1) : null,
        recovery: rag === "RED" ? "Two extra college visits a week; Nikhil and Sneha to call every final-year coordinator by Wednesday." : null,
        lastUpdateAt: status === "NOT_STARTED" ? null : day(-2),
        sort: sort++,
        createdById: U("manager.demo"),
      },
    });
    if (status !== "NOT_STARTED") {
      await db.planTaskUpdate.create({ data: { taskId: t.id, userId: U(owner), actual, status, note: "Friday update", createdAt: day(-2) } });
    }
    if (rag) await db.planTaskUpdate.create({ data: { taskId: t.id, userId: U("manager.demo"), review: true, rag, note: "Saturday review", createdAt: day(-1) } });
  }

  // ---- HR: recruitment, timesheets, expenses, notices, helpdesk, checklists ---------------------------------------
  const job = await db.jobOpening.create({
    data: { title: "Robotics Trainer", departmentId: dept("Training & Delivery"), positions: 1, salaryRange: "₹18,000 – ₹24,000 a month", description: "Teach robotics and coding in partner schools across Ernakulam.", hiringManagerId: U("manager.demo"), createdById: U("hr.demo"), applyBy: day(20) },
  });
  const candidates = [
    ["Abhijith Suresh", "INTERVIEW", "B.Tech ECE, 1 year teaching"],
    ["Merin George", "SCREENING", "M.Sc Electronics"],
    ["Rohan Das", "APPLIED", "Diploma, maker club volunteer"],
  ] as const;
  for (const [name, stage, role] of candidates) {
    const c = await db.candidate.create({ data: { jobId: job.id, name, email: `${name.split(" ")[0].toLowerCase()}@${DOMAIN}`, city: "Kochi", currentRole: role, stage, source: "Referral", createdById: U("hr.demo") } });
    if (stage === "INTERVIEW") {
      await db.interview.create({ data: { candidateId: c.id, round: "Teaching demo", scheduledAt: at(day(2), "11:00"), location: "Edappally office", interviewerId: U("manager.demo"), scheduledById: U("hr.demo") } });
    }
  }

  const lastMonday = day(-((today.getUTCDay() + 6) % 7) - 7);
  await db.timesheet.create({
    data: {
      employeeId: employees["trainer.demo"].id,
      weekStart: lastMonday,
      status: "SUBMITTED",
      submittedAt: day(-1),
      entries: {
        create: [0, 1, 2, 3, 4, 5].map((i) => ({ date: new Date(lastMonday.getTime() + i * DAY), projectId: mapleProject.id, hours: i === 5 ? 4 : 7, note: i === 5 ? "Lesson plans" : "School sessions and lab upkeep" })),
      },
    },
  });

  await db.expenseClaim.createMany({
    data: [
      { employeeId: employees["trainer.demo"].id, date: day(-6), category: "TRAVEL", description: "Bike to Maple Leaf and back, 3 days", amount: 216, distanceKm: 54, vehicle: "TWO_WHEELER", projectId: mapleProject.id, status: "SUBMITTED" },
      { employeeId: employees["engineer.demo"].id, date: day(-9), category: "KITS_MATERIALS", description: "Jumper wires and breadboards for the college teams", amount: 1840, projectId: collegeProject.id, status: "APPROVED", decidedById: U("manager.demo"), decidedAt: day(-7) },
      { employeeId: employees["employee.demo"].id, date: day(-4), category: "FOOD", description: "Lunch during the Kozhikode school visit", amount: 320, status: "SUBMITTED" },
    ],
  });

  await db.notice.create({ data: { kind: "ANNOUNCEMENT", title: "SOP v2 starts this month", body: "From this month every school session follows the SOP v2 checklist. Trainers: tick the 'Before the class' list on your phone before each session.", pinned: true, authorId: U("admin.demo"), showUntil: day(25) } });
  await db.notice.create({ data: { kind: "POLICY", title: "Travel claims policy", body: "Claim travel within 7 days with the distance and the school visited. Two-wheeler ₹4 a km, car ₹9 a km.", category: "Finance", requiresAck: true, ackDueDate: day(7), authorId: U("hr.demo") } });

  await db.helpdeskTicket.create({ data: { title: "Laptop for the new internship batch", description: "Need two laptops with Arduino IDE installed for the internship lab.", category: "IT", priority: "HIGH", requesterId: U("trainer.demo"), assigneeId: U("hr.demo"), status: "IN_PROGRESS" } });
  await db.helpdeskTicket.create({ data: { title: "Visiting card reprint", description: "New designation on my visiting cards, please.", category: "Admin", requesterId: U("sales.demo") } });

  await db.checklistTemplate.create({
    data: {
      title: "Before the class",
      description: "Every school session, on the trainer's phone.",
      frequency: "SESSION",
      audience: "PEOPLE",
      startsOn: day(-7),
      createdById: U("manager.demo"),
      items: { create: ["Kits counted and charged", "Lesson plan open", "Attendance sheet ready", "Photo of the class setup"].map((label, i) => ({ label, position: i, needsPhoto: i === 3 })) },
    },
  });
  await db.checklistTemplate.create({
    data: {
      title: "Friday plan update",
      description: "Update your work plan tasks before 5 PM.",
      frequency: "WEEKLY",
      weekday: 5,
      dueTime: "17:00",
      audience: "EVERYONE",
      startsOn: day(-1), // from this week on, so the demo doesn't open with a wall of missed Fridays
      createdById: U("manager.demo"),
      items: { create: [{ label: "Updated every plan task I own", position: 0 }] },
    },
  });

  const stock = [
    ["EB-KIT-ARD-01", "Arduino classroom kit", "Robotics kit", "kit", 24, 6, 2450],
    ["EB-SEN-US-01", "Ultrasonic sensor HC-SR04", "Electronic component", "pcs", 40, 10, 95],
    ["EB-MOT-SRV-01", "Servo motor SG90", "Electronic component", "pcs", 8, 12, 120],
    ["EB-CON-JMP-01", "Jumper wire pack", "Consumable", "pack", 15, 10, 60],
  ] as const;
  for (const [sku, name, category, unit, onHand, reorderLevel, unitCost] of stock) {
    await db.stockItem.create({ data: { sku, name, category, unit, onHand, reorderLevel, unitCost, returnable: category !== "Consumable", location: "Edappally store", movements: { create: { type: "RECEIVE", quantity: onHand, note: "Opening stock", byId: U("manager.demo") } } } });
  }

  await db.notification.createMany({
    data: [
      { userId: U("admin.demo"), kind: "project.post", title: "Arjun posted an update on Maple Leaf robotics lab 2026-27", href: "/projects" },
      { userId: U("manager.demo"), kind: "plan.review", title: "Saturday review done: 1 task is Red", href: "/plan" },
      { userId: U("trainer.demo"), kind: "task.assigned", title: "New task: Prepare term 2 lesson plans", href: "/work" },
    ],
  });

  printLogins(password, "Demo data added.");
}

function printLogins(password: string, heading: string) {
  console.log(`\n${heading}\nSign in at the usual address with any of these. They all share one password:\n`);
  for (const p of PEOPLE) console.log(`  ${`${p.login}@${DOMAIN}`.padEnd(30)} ${p.role.padEnd(9)} ${p.first} ${p.last}, ${p.title}`);
  console.log(`\n  Password: ${password}\n\nThis is a demo database. Don't enter real people or money here.`);
}

// One transaction, so a failure part-way leaves the database as it was.
prisma
  .$transaction((tx) => main(tx), { timeout: 300000, maxWait: 20000 })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
