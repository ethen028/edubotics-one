"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, isAdmin, requireUser } from "@/lib/auth";
import { countLeaveDays, parseDateOnly } from "@/lib/leave";
import { getLeaveBalances } from "@/lib/leave-balance";
import { getSettings } from "@/lib/settings";
import { checklistRows } from "@/lib/hr-constants";
import type { FormState } from "@/components/action-form";

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : parseDateOnly(v)))
  .nullable()
  .optional();

function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  return `${issue.path.join(".") || "Form"}: ${issue.message}`;
}

function uniqueError(e: unknown): string | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    const target = (e.meta?.target as string[] | undefined)?.join(", ") ?? "field";
    return `That ${target} is already in use.`;
  }
  return null;
}

// ─── Employees ─────────────────────────────────────────────────────────────

const employeeSchema = z.object({
  code: z.string().trim().min(1, "required"),
  firstName: z.string().trim().min(1, "required"),
  lastName: z.string().trim().min(1, "required"),
  workEmail: z.string().trim().toLowerCase().email(),
  personalEmail: optional,
  phone: optional,
  designation: z.string().trim().min(1, "required"),
  departmentId: optional,
  managerId: optional,
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]),
  status: z.enum(["ONBOARDING", "ACTIVE", "ON_NOTICE", "EXITED"]),
  dateOfJoining: z.string().trim().min(1, "required").transform(parseDateOnly),
  dateOfExit: optionalDate,
  dateOfBirth: optionalDate,
  gender: optional,
  bloodGroup: optional,
  address: optional,
  city: optional,
  state: optional,
  emergencyName: optional,
  emergencyPhone: optional,
});

export async function createEmployee(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const parsed = employeeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };

  const createLogin = formData.get("createLogin") === "on";
  const password = String(formData.get("password") ?? "");
  const role = z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]).catch("EMPLOYEE").parse(formData.get("role"));
  if (createLogin && password.length < 8) return { error: "Temporary password must be at least 8 characters." };

  let id: string;
  try {
    const data = parsed.data;
    const passwordHash = createLogin ? await hashPassword(password) : null;
    const employee = await db.$transaction(async (tx) => {
      const user = passwordHash
        ? await tx.user.create({
            data: { email: data.workEmail, name: `${data.firstName} ${data.lastName}`, passwordHash, role },
          })
        : null;
      const created = await tx.employee.create({ data: { ...data, userId: user?.id } });
      // New joiners start with the standard onboarding checklist.
      if (created.status === "ONBOARDING") {
        await tx.onboardingTask.createMany({ data: checklistRows(created.id, created.dateOfJoining) });
      }
      return created;
    });
    id = employee.id;
  } catch (e) {
    return { error: uniqueError(e) ?? "Could not save the employee." };
  }
  revalidatePath("/hr/employees");
  redirect(`/hr/employees/${id}`);
}

export async function updateEmployee(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const parsed = employeeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (parsed.data.managerId === id) return { error: "An employee cannot be their own manager." };
  try {
    const employee = await db.employee.update({ where: { id }, data: parsed.data });
    if (employee.userId) {
      await db.user.update({
        where: { id: employee.userId },
        data: {
          name: `${employee.firstName} ${employee.lastName}`,
          // Exiting an employee also blocks their sign-in.
          ...(employee.status === "EXITED" ? { active: false } : {}),
        },
      });
    }
  } catch (e) {
    return { error: uniqueError(e) ?? "Could not save the employee." };
  }
  revalidatePath("/hr/employees");
  revalidatePath(`/hr/employees/${id}`);
  return { ok: "Saved." };
}

// ─── Departments ───────────────────────────────────────────────────────────

export async function createDepartment(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a department name." };
  try {
    await db.department.create({ data: { name } });
  } catch (e) {
    return { error: uniqueError(e) ?? "Could not add the department." };
  }
  revalidatePath("/hr/departments");
  return { ok: `Added ${name}.` };
}

export async function deleteDepartment(id: string) {
  await requireUser(["ADMIN"]);
  await db.employee.updateMany({ where: { departmentId: id }, data: { departmentId: null } });
  await db.department.delete({ where: { id } });
  revalidatePath("/hr/departments");
}

// ─── Leave types ───────────────────────────────────────────────────────────

const leaveTypeSchema = z.object({
  code: z.string().trim().toUpperCase().min(1, "required").max(6),
  name: z.string().trim().min(1, "required"),
  annualQuota: z.coerce.number().min(0).max(365),
  paid: z.literal("on").optional(),
});

export async function createLeaveType(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const parsed = leaveTypeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  try {
    await db.leaveType.create({ data: { ...parsed.data, paid: parsed.data.paid === "on" } });
  } catch (e) {
    return { error: uniqueError(e) ?? "Could not add the leave type." };
  }
  revalidatePath("/hr/leave-types");
  return { ok: "Leave type added." };
}

export async function updateLeaveType(id: string, formData: FormData) {
  await requireUser(["ADMIN"]);
  const annualQuota = z.coerce.number().min(0).max(365).parse(formData.get("annualQuota"));
  await db.leaveType.update({
    where: { id },
    data: { annualQuota, active: formData.get("active") === "on", paid: formData.get("paid") === "on" },
  });
  revalidatePath("/hr/leave-types");
}

// ─── Holidays ──────────────────────────────────────────────────────────────

export async function createHoliday(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const name = String(formData.get("name") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  if (!name || !date) return { error: "Enter a date and a name." };
  try {
    await db.holiday.create({ data: { name, date: parseDateOnly(date), optional: formData.get("optional") === "on" } });
  } catch (e) {
    return { error: uniqueError(e) ? "There is already a holiday on that date." : "Could not add the holiday." };
  }
  revalidatePath("/hr/holidays");
  return { ok: `Added ${name}.` };
}

export async function confirmHoliday(id: string) {
  await requireUser(["ADMIN"]);
  await db.holiday.update({ where: { id }, data: { tentative: false } });
  revalidatePath("/hr/holidays");
}

export async function deleteHoliday(id: string) {
  await requireUser(["ADMIN"]);
  await db.holiday.delete({ where: { id } });
  revalidatePath("/hr/holidays");
}

// ─── Leave requests ────────────────────────────────────────────────────────

const leaveSchema = z.object({
  leaveTypeId: z.string().min(1, "required"),
  startDate: z.string().min(1, "required").transform(parseDateOnly),
  endDate: z.string().min(1, "required").transform(parseDateOnly),
  halfDay: z.literal("on").optional(),
  reason: z.string().trim().min(3, "please add a short reason"),
});

export async function applyLeave(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const employee = user.employee;
  if (!employee) return { error: "Your login isn't linked to an employee record yet. Ask HR to link it." };

  const parsed = leaveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { leaveTypeId, startDate, endDate, reason } = parsed.data;
  const halfDay = parsed.data.halfDay === "on";

  if (endDate < startDate) return { error: "End date is before start date." };
  if (halfDay && endDate.getTime() !== startDate.getTime()) return { error: "Half day is only for single-day leave." };

  const holidays = await db.holiday.findMany({
    where: { date: { gte: startDate, lte: endDate }, optional: false },
    select: { date: true },
  });
  const { weeklyOffDays } = await getSettings();
  const days = countLeaveDays(startDate, endDate, holidays.map((h) => h.date), halfDay, weeklyOffDays);
  if (days === 0) return { error: "Those dates are all weekly offs or holidays, so no leave is needed." };

  const overlap = await db.leaveRequest.findFirst({
    where: {
      employeeId: employee.id,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
  if (overlap) return { error: "You already have leave booked that overlaps these dates." };

  const balance = (await getLeaveBalances(employee.id, startDate.getUTCFullYear())).find(
    (b) => b.leaveTypeId === leaveTypeId,
  );
  if (!balance) return { error: "Choose a valid leave type." };
  if (balance.remaining !== null && days > balance.remaining) {
    return { error: `Not enough ${balance.name} left: ${balance.remaining} day(s) available, ${days} requested.` };
  }

  await db.leaveRequest.create({
    data: {
      employeeId: employee.id,
      leaveTypeId,
      startDate,
      endDate,
      halfDay,
      days,
      reason,
      approverId: employee.managerId,
    },
  });
  revalidatePath("/hr/leave");
  revalidatePath("/hr/approvals");
  return { ok: `Leave request sent for ${days} day(s).` };
}

export async function cancelLeave(id: string) {
  const user = await requireUser();
  const req = await db.leaveRequest.findUnique({ where: { id } });
  if (!req || req.employeeId !== user.employee?.id) throw new Error("Not found");
  if (req.status !== "PENDING" && !(req.status === "APPROVED" && req.startDate > new Date())) {
    throw new Error("Only pending or future leave can be cancelled");
  }
  await db.leaveRequest.update({ where: { id }, data: { status: "CANCELLED" } });
  revalidatePath("/hr/leave");
  revalidatePath("/hr/approvals");
}

export async function decideLeave(id: string, formData: FormData) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const decision = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim() || null;

  const req = await db.leaveRequest.findUnique({ where: { id }, include: { employee: true } });
  if (!req || req.status !== "PENDING") throw new Error("Request is no longer pending");
  const isTheirManager = user.employee && req.employee.managerId === user.employee.id;
  if (!isAdmin(user) && !isTheirManager) throw new Error("Not allowed");
  if (req.employeeId === user.employee?.id) throw new Error("You can't approve your own leave");

  await db.leaveRequest.update({
    where: { id },
    data: { status: decision, decisionNote: note, decidedAt: new Date(), approverId: user.employee?.id ?? req.approverId },
  });
  revalidatePath("/hr/approvals");
  revalidatePath("/hr/leave");
  revalidatePath("/approvals");
  revalidatePath("/");
}
