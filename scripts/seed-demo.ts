/**
 * Idempotent demo records for presentations. This command is intentionally restricted to a
 * local PostgreSQL database whose name ends in `_test`; it can never populate a production DB.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

if (existsSync(".env")) loadEnvFile(".env");
const database = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["127.0.0.1", "localhost"].includes(database.hostname), "Demo data is restricted to a local database.");
assert.ok(database.pathname.endsWith("_test"), "Demo data is restricted to a database ending in _test.");

const db = new PrismaClient();

async function main() {
  await db.user.findFirstOrThrow({ where: { role: "ADMIN", active: true, closedAt: null }, orderBy: { createdAt: "asc" } });
  const departmentNames = ["Management", "Training & Delivery", "Sales & Partnerships", "Operations", "R&D / Technical"];
  const departments = Object.fromEntries(await Promise.all(departmentNames.map(async (name) => {
    const department = await db.department.upsert({ where: { name }, update: {}, create: { name } });
    return [name, department] as const;
  }))) as Record<string, { id: string; name: string }>;
  const operations = departments["Operations"];
  const training = departments["Training & Delivery"];

  const manager = await db.employee.upsert({
    where: { code: "DEMO-001" },
    update: { firstName: "Aarav", lastName: "Demo", designation: "Operations Lead", departmentId: operations.id, status: "ACTIVE" },
    create: {
      code: "DEMO-001", firstName: "Aarav", lastName: "Demo", workEmail: "aarav.demo@example.invalid",
      phone: "+91 90000 00001", designation: "Operations Lead", departmentId: operations.id, status: "ACTIVE",
      dateOfJoining: new Date("2026-10-01"), city: "Kochi", state: "Kerala", address: "Demo address — replace after presentation",
    },
  });
  const employeeSeeds = [
    { code: "DEMO-002", firstName: "Meera", lastName: "Demo", workEmail: "meera.demo@example.invalid", designation: "Robotics Trainer", departmentId: training.id },
    { code: "DEMO-003", firstName: "Nikhil", lastName: "Demo", workEmail: "nikhil.demo@example.invalid", designation: "Inventory Coordinator", departmentId: operations.id },
    { code: "DEMO-004", firstName: "Ananya", lastName: "Demo", workEmail: "ananya.demo@example.invalid", designation: "Business Administrator", departmentId: departments.Management.id },
    { code: "DEMO-005", firstName: "Kavya", lastName: "Demo", workEmail: "kavya.demo@example.invalid", designation: "People & Culture Manager", departmentId: departments.Management.id },
    { code: "DEMO-006", firstName: "Ishaan", lastName: "Demo", workEmail: "ishaan.demo@example.invalid", designation: "Partnership Executive", departmentId: departments["Sales & Partnerships"].id },
    { code: "DEMO-007", firstName: "Diya", lastName: "Demo", workEmail: "diya.demo@example.invalid", designation: "Robotics Engineer", departmentId: departments["R&D / Technical"].id },
  ];
  for (const employee of employeeSeeds) {
    await db.employee.upsert({
      where: { code: employee.code },
      update: { ...employee, managerId: manager.id, status: "ACTIVE" },
      create: { ...employee, managerId: manager.id, status: "ACTIVE", dateOfJoining: new Date("2026-10-06"), city: "Kochi", state: "Kerala" },
    });
  }

  const tempPassword = `Demo-${randomBytes(9).toString("base64url")}1!`;
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const profiles = [
    { email: "demo.admin@example.invalid", name: "Ananya Demo (Admin)", role: "ADMIN" as const, employeeCode: "DEMO-004" },
    { email: "demo.manager@example.invalid", name: "Aarav Demo (Manager)", role: "MANAGER" as const, employeeCode: "DEMO-001" },
    { email: "demo.hr@example.invalid", name: "Kavya Demo (HR)", role: "HR" as const, employeeCode: "DEMO-005" },
    { email: "demo.employee@example.invalid", name: "Meera Demo (Employee)", role: "EMPLOYEE" as const, employeeCode: "DEMO-002" },
  ];
  const demoUsers: Record<string, { id: string }> = {};
  for (const profile of profiles) {
    const user = await db.user.upsert({
      where: { email: profile.email },
      update: { name: profile.name, role: profile.role, passwordHash, active: true, closedAt: null, mustChangePassword: true, emailVerifiedAt: new Date() },
      create: { email: profile.email, name: profile.name, role: profile.role, passwordHash, active: true, mustChangePassword: true, emailVerifiedAt: new Date() },
    });
    const employee = await db.employee.findUniqueOrThrow({ where: { code: profile.employeeCode } });
    await db.employee.update({ where: { id: employee.id }, data: { userId: user.id } });
    demoUsers[profile.role === "MANAGER" ? "manager" : profile.email.includes("employee") ? "employee" : profile.email.includes("hr") ? "hr" : "admin"] = user;
  }
  const demoAdmin = demoUsers.admin;
  const demoManager = demoUsers.manager;
  const demoEmployee = demoUsers.employee;

  const stock = [
    { sku: "DEMO-KIT-01", name: "Demo Arduino classroom kit", category: "Robotics kit", unit: "kit", location: "Demo shelf A", returnable: true, onHand: 18, reorderLevel: 5, unitCost: 2450, notes: "Demo record — replace with verified opening stock" },
    { sku: "DEMO-SENSOR-01", name: "Demo ultrasonic sensor", category: "Electronic component", unit: "pcs", location: "Demo bin B2", returnable: true, onHand: 36, reorderLevel: 10, unitCost: 180, notes: "Demo record — replace with verified opening stock" },
    { sku: "DEMO-CABLE-01", name: "Demo jumper-wire pack", category: "Consumable", unit: "pack", location: "Demo bin C1", returnable: false, onHand: 9, reorderLevel: 12, unitCost: 95, notes: "Demo low-stock example — replace after presentation" },
  ];
  for (const item of stock) {
    const existing = await db.stockItem.findUnique({ where: { sku: item.sku } });
    if (existing) {
      await db.stockItem.update({ where: { id: existing.id }, data: { name: item.name, category: item.category, unit: item.unit, location: item.location, returnable: item.returnable, reorderLevel: item.reorderLevel, unitCost: item.unitCost, notes: item.notes, active: true } });
      continue;
    }
    await db.stockItem.create({
      data: {
        ...item,
        movements: { create: { type: "RECEIVE", quantity: item.onHand, note: "Opening balance for demo", byId: demoAdmin.id } },
      },
    });
  }

  const demoJob = await db.jobOpening.findFirst({ where: { title: "Demo Robotics Trainer" } });
  if (!demoJob) {
    await db.jobOpening.create({
      data: {
        title: "Demo Robotics Trainer", departmentId: training.id, employmentType: "FULL_TIME", location: "Kochi",
        positions: 2, description: "Demo vacancy used to present the recruitment workflow. Replace with an approved job description before publishing.",
        status: "OPEN", hiringManagerId: demoManager.id, createdById: demoUsers.hr.id, onCareersPage: false,
      },
    });
  }

  const organization = await db.organization.findFirst({ where: { name: "Demo Horizon Public School" } }) ?? await db.organization.create({
    data: { name: "Demo Horizon Public School", type: "SCHOOL", board: "CBSE", email: "office@horizon.example.invalid", phone: "+91 90000 00100", city: "Kochi", district: "Ernakulam", address: "Demo campus address", ownerId: demoManager.id, notes: "Demo CRM record" },
  });
  const contact = await db.contact.findFirst({ where: { name: "Dr. Priya Demo", organizationId: organization.id } }) ?? await db.contact.create({
    data: { name: "Dr. Priya Demo", designation: "Principal", email: "priya@horizon.example.invalid", phone: "+91 90000 00101", organizationId: organization.id, ownerId: demoManager.id, notes: "Demo contact" },
  });
  const lead = await db.lead.findFirst({ where: { email: "admissions@demoacademy.example.invalid" } }) ?? await db.lead.create({
    data: { name: "Rahul Demo", organizationName: "Demo Academy", orgType: "SCHOOL", email: "admissions@demoacademy.example.invalid", phone: "+91 90000 00102", city: "Thrissur", interest: "STEM lab programme", source: "WEBSITE", status: "QUALIFIED", ownerId: demoManager.id, notes: "Demo lead" },
  });
  const deal = await db.deal.findFirst({ where: { title: "Demo STEM Lab Programme" } }) ?? await db.deal.create({
    data: { title: "Demo STEM Lab Programme", value: 295000, stage: "PROPOSAL", program: "Robotics & Coding", students: 180, expectedClose: new Date("2026-11-15"), organizationId: organization.id, contactId: contact.id, ownerId: demoManager.id, notes: "Demo opportunity" },
  });
  if (!(await db.activity.findFirst({ where: { subject: "Demo proposal follow-up", dealId: deal.id } }))) await db.activity.create({ data: { type: "CALL", subject: "Demo proposal follow-up", body: "Confirm timetable and kit quantities.", dueAt: new Date("2026-10-20T05:30:00Z"), assigneeId: demoManager.id, createdById: demoManager.id, dealId: deal.id } });

  const project = await db.project.findFirst({ where: { name: "Demo Horizon Robotics Rollout" } }) ?? await db.project.create({
    data: {
      name: "Demo Horizon Robotics Rollout", kind: "SCHOOL_PROGRAMME", description: "Representative delivery project for the demo.", stage: "EXECUTE", startDate: new Date("2026-10-01"), dueDate: new Date("2027-03-31"), ownerId: demoManager.id, departmentId: operations.id, organizationId: organization.id, dealId: deal.id,
      members: { create: [{ userId: demoManager.id, role: "Coordinator" }, { userId: demoEmployee.id, role: "Trainer" }] },
      milestones: { create: { title: "First term delivery", dueDate: new Date("2026-12-20") } },
      tasks: { create: { title: "Prepare first robotics session", status: "IN_PROGRESS", priority: "HIGH", progress: 40, dueDate: new Date("2026-10-22"), assigneeId: demoEmployee.id, createdById: demoManager.id } },
    },
  });
  if (!(await db.programme.findFirst({ where: { name: "Demo Robotics & Coding 2026-27", organizationId: organization.id } }))) await db.programme.create({ data: { name: "Demo Robotics & Coding 2026-27", organizationId: organization.id, contactId: contact.id, projectId: project.id, academicYear: "2026-27", grades: "Grades 5 to 8", students: 180, sessionsPlanned: 48, startDate: new Date("2026-10-01"), endDate: new Date("2027-03-31"), status: "RUNNING", coordinatorId: demoManager.id, notes: "Demo programme", trainers: { create: { userId: demoEmployee.id, classes: "Grades 5 to 8" } }, sessions: { create: { date: new Date("2026-10-20"), startTime: "10:30", durationMins: 60, classGroup: "Grade 6 A", topic: "Introduction to sensors", trainerId: demoEmployee.id, status: "SCHEDULED" } } } });

  if (!(await db.quote.findFirst({ where: { notes: "DEMO-QUOTE" } }))) await db.quote.create({ data: { organizationId: organization.id, contactId: contact.id, dealId: deal.id, billToName: organization.name, billToAddress: organization.address, placeOfSupply: "Kerala", quoteDate: new Date("2026-10-17"), validUntil: new Date("2026-11-16"), subtotal: 250000, cgst: 22500, sgst: 22500, total: 295000, terms: "Demo: 50% advance, balance by milestone", notes: "DEMO-QUOTE", createdById: demoAdmin.id, lines: { create: { position: 1, description: "Robotics & Coding programme", sac: "999293", quantity: 1, unitPrice: 250000, gstRate: 18, amount: 250000 } } } });
  if (!(await db.invoice.findFirst({ where: { notes: "DEMO-INVOICE" } }))) await db.invoice.create({ data: { organizationId: organization.id, contactId: contact.id, dealId: deal.id, projectId: project.id, billToName: organization.name, billToAddress: organization.address, placeOfSupply: "Kerala", issueDate: new Date("2026-10-17"), dueDate: new Date("2026-11-01"), subtotal: 50000, cgst: 4500, sgst: 4500, total: 59000, notes: "DEMO-INVOICE", createdById: demoAdmin.id, lines: { create: { position: 1, description: "Programme mobilisation milestone", sac: "999293", quantity: 1, unitPrice: 50000, gstRate: 18, amount: 50000 } } } });

  const vendor = await db.vendor.upsert({ where: { name: "Demo Robotics Supplies" }, update: {}, create: { name: "Demo Robotics Supplies", contactName: "Neha Demo", email: "sales@demorobotics.example.invalid", phone: "+91 90000 00200", address: "Demo supplier address", state: "Kerala", paymentDays: 30, notes: "Demo vendor" } });
  const kit = await db.stockItem.findUniqueOrThrow({ where: { sku: "DEMO-KIT-01" } });
  if (!(await db.purchaseOrder.findFirst({ where: { purpose: "Demo replenishment order" } }))) await db.purchaseOrder.create({ data: { vendorId: vendor.id, requesterId: demoEmployee.id, projectId: project.id, purpose: "Demo replenishment order", expectedBy: new Date("2026-10-28"), subtotal: 24500, tax: 4410, total: 28910, status: "PENDING", lines: { create: { itemId: kit.id, description: "Arduino classroom kit", quantity: 10, unit: "kit", unitPrice: 2450, gstRate: 18 } } } });

  if (!(await db.notice.findFirst({ where: { title: "Demo: October operations briefing" } }))) await db.notice.create({ data: { kind: "ANNOUNCEMENT", title: "Demo: October operations briefing", body: "This is sample content for the presentation. Review the delivery calendar and confirm kit requests before each session.", pinned: true, showUntil: new Date("2026-10-31"), authorId: demoUsers.hr.id } });
  if (!(await db.helpdeskTicket.findFirst({ where: { title: "Demo: classroom laptop setup" } }))) await db.helpdeskTicket.create({ data: { title: "Demo: classroom laptop setup", description: "Install the approved robotics IDE before the next session.", category: "Equipment", priority: "MEDIUM", status: "IN_PROGRESS", requesterId: demoEmployee.id, assigneeId: demoAdmin.id } });
  if (!(await db.workshop.findFirst({ where: { title: "Demo Arduino and IoT Workshop" } }))) await db.workshop.create({ data: { title: "Demo Arduino and IoT Workshop", description: "Hands-on sample workshop for the presentation.", audience: "COLLEGE", mode: "IN_PERSON", venue: "Demo Innovation Lab, Kochi", organizationId: organization.id, startDate: new Date("2026-11-07"), endDate: new Date("2026-11-07"), hours: 6, capacity: 40, feeType: "PER_PERSON", fee: 1500, status: "UPCOMING", coordinatorId: demoManager.id, createdById: demoManager.id, notes: "Demo workshop", trainers: { create: { userId: demoEmployee.id } }, registrations: { create: { name: "Riya Demo", email: "riya.demo@example.invalid", institution: "Demo Engineering College", detail: "ECE, third year", fee: 1500, addedById: demoManager.id } } } });

  const meera = await db.employee.findUniqueOrThrow({ where: { code: "DEMO-002" } });
  await db.asset.upsert({ where: { code: "DEMO-LAP-01" }, update: { employeeId: meera.id, status: "ASSIGNED" }, create: { code: "DEMO-LAP-01", name: "Demo trainer laptop", category: "Laptop", serialNo: "DEMO-SERIAL-001", purchaseDate: new Date("2026-09-15"), status: "ASSIGNED", employeeId: meera.id, assignedAt: new Date("2026-10-06"), notes: "Demo asset" } });
  for (const code of ["DEMO-001", "DEMO-002", "DEMO-004", "DEMO-005"]) {
    const employee = await db.employee.findUniqueOrThrow({ where: { code } });
    await db.salaryStructure.upsert({ where: { employeeId_effectiveFrom: { employeeId: employee.id, effectiveFrom: new Date("2026-10-01") } }, update: {}, create: { employeeId: employee.id, effectiveFrom: new Date("2026-10-01"), basic: code === "DEMO-002" ? 22000 : 35000, hra: code === "DEMO-002" ? 8800 : 14000, specialAllowance: code === "DEMO-002" ? 4200 : 6000, note: "Demo salary structure" } });
  }
  if (!(await db.expenseClaim.findFirst({ where: { employeeId: meera.id, description: "Demo travel to Horizon Public School" } }))) await db.expenseClaim.create({ data: { employeeId: meera.id, date: new Date("2026-10-15"), category: "TRAVEL", description: "Demo travel to Horizon Public School", amount: 320, distanceKm: 20, vehicle: "TWO_WHEELER", projectId: project.id, organizationId: organization.id, status: "SUBMITTED" } });

  const [employees, items, jobs, organizations, projects, notices] = await Promise.all([
    db.employee.count({ where: { code: { startsWith: "DEMO-" } } }),
    db.stockItem.count({ where: { sku: { startsWith: "DEMO-" } } }),
    db.jobOpening.count({ where: { title: { startsWith: "Demo " } } }),
    db.organization.count({ where: { name: { startsWith: "Demo " } } }),
    db.project.count({ where: { name: { startsWith: "Demo " } } }),
    db.notice.count({ where: { title: { startsWith: "Demo:" } } }),
  ]);
  console.log(`Demo data ready: ${employees} employees, ${profiles.length} login profiles, ${items} inventory items, ${jobs} recruitment job, ${organizations} organization, ${projects} project, ${notices} notice.`);
  console.log(`Temporary password for all demo profiles: ${tempPassword}`);
  console.log(`Profiles: ${profiles.map((profile) => `${profile.email} (${profile.name})`).join(", ")}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
