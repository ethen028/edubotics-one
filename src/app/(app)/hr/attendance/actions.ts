"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManageHrEmployee } from "@/lib/team";
import { istDate, istTimeOn } from "@/lib/attendance";
import { dateOnlyInput, timeInput } from "@/lib/date-input";
import type { FormState } from "@/components/action-form";

function refresh() {
  revalidatePath("/hr");
  revalidatePath("/hr/attendance", "layout");
  revalidatePath("/approvals");
  revalidatePath("/");
}

async function requireEmployee() {
  const user = await requireUser();
  if (!user.employee) throw new Error("Your login isn't linked to an employee record");
  return { user, employee: user.employee };
}

export async function checkIn() {
  const { employee } = await requireEmployee();
  const now = new Date();
  const today = istDate(now);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employee.id} FOR UPDATE`;
    const open = await tx.attendanceSession.findFirst({ where: { employeeId: employee.id, workDate: today, checkOut: null } });
    if (!open) await tx.attendanceSession.create({ data: { employeeId: employee.id, workDate: today, checkIn: now } });
  });
  refresh();
}

export async function checkOut() {
  const { employee } = await requireEmployee();
  const now = new Date();
  await db.$transaction(async tx => {
  await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employee.id} FOR UPDATE`;
  const open = await tx.attendanceSession.findFirst({
    where: { employeeId: employee.id, workDate: istDate(now), checkOut: null },
    orderBy: { checkIn: "desc" },
  });
  if (open) await tx.attendanceSession.update({ where: { id: open.id }, data: { checkOut: now } });
  });
  refresh();
}

/** Employee asks HR to fill in a missed punch-out. */
export async function requestCorrection(sessionId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { employee } = await requireEmployee();
  const session = await db.attendanceSession.findUnique({ where: { id: sessionId } });
  if (!session || session.employeeId !== employee.id || session.checkOut) return { error: "That punch can't be corrected." };
  const time = String(formData.get("time") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!timeInput.safeParse(time).success) return { error: "Enter the time you left." };
  if (reason.length < 3) return { error: "Add a short reason." };
  const requestedCheckOut = istTimeOn(session.workDate, time);
  if (requestedCheckOut <= session.checkIn) return { error: "The punch-out time must be after your check-in." };
  if (requestedCheckOut > new Date()) return { error: "The punch-out time cannot be in the future." };
  const result = await db.$transaction(async tx => {
  await tx.$queryRaw`SELECT "id" FROM "AttendanceSession" WHERE "id" = ${sessionId} FOR UPDATE`;
  const current = await tx.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } });
  if (current.checkOut) return { error: "That punch has already been corrected." };
  const pending = await tx.attendanceCorrection.findFirst({ where: { sessionId, status: "PENDING" } });
  if (pending) return { error: "You already have a pending request for this day." };
  await tx.attendanceCorrection.create({ data: { employeeId: employee.id, sessionId, requestedCheckOut, reason } });
  return { ok: "Request sent to HR." };
  });
  refresh();
  return result;
}

export async function decideCorrection(id: string, formData: FormData) {
  const user = await requireUser(["ADMIN", "HR", "MANAGER"]);
  const decision = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("decision"));
  const req = await db.attendanceCorrection.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return;
  if (!(await canManageHrEmployee(user, req.employeeId)) || req.employeeId === user.employee?.id) throw new Error("Not allowed");
  await db.$transaction(async tx => {
    const changed = await tx.attendanceCorrection.updateMany({ where: { id, status: "PENDING" }, data: { status: decision, decidedById: user.id, decidedAt: new Date() } });
    if (!changed.count) return;
    if (decision === "APPROVED") {
      const corrected = await tx.attendanceSession.updateMany({ where: { id: req.sessionId, checkOut: null }, data: { checkOut: req.requestedCheckOut } });
      if (!corrected.count) throw new Error("The attendance session changed. Reload before deciding.");
    }
  });
  refresh();
}

const markSchema = z.object({
  employeeId: z.string().min(1),
  date: dateOnlyInput,
  status: z.enum(["PRESENT", "INCOMPLETE", "OVERTIME", "ABSENT", "LEAVE", "MISPUNCH", "HOLIDAY", "WEEKLY_OFF", "AUTO"]),
  note: z.string().trim().optional(),
});

/** HR sets (or clears, with AUTO) the final status for one employee-day. */
export async function markDay(formData: FormData) {
  const user = await requireUser(["ADMIN", "HR", "MANAGER"]);
  const { employeeId, date, status, note } = markSchema.parse(Object.fromEntries(formData));
  if ((user.role === "HR" && user.employee?.id === employeeId) || !(await canManageHrEmployee(user, employeeId))) throw new Error("Not allowed");
  const where = { employeeId_workDate: { employeeId, workDate: date } };
  if (status === "AUTO") {
    await db.attendanceMark.deleteMany({ where: { employeeId, workDate: date } });
  } else {
    await db.attendanceMark.upsert({
      where,
      update: { status, note: note || null, markedById: user.id },
      create: { employeeId, workDate: date, status, note: note || null, markedById: user.id },
    });
  }
  refresh();
}

/** HR adds a missed session by hand (e.g. a field visit with no punch). */
export async function addSession(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "HR", "MANAGER"]);
  const parsed = z
    .object({
      employeeId: z.string().min(1),
      date: dateOnlyInput,
      in: timeInput,
      out: timeInput,
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pick an employee, date, check-in and check-out time." };
  const { employeeId, date } = parsed.data;
  if ((user.role === "HR" && user.employee?.id === employeeId) || !(await canManageHrEmployee(user, employeeId))) return { error: "You can only add attendance for your team." };
  const checkIn = istTimeOn(date, parsed.data.in);
  const checkOut = istTimeOn(date, parsed.data.out);
  if (checkOut <= checkIn) return { error: "Check-out must be after check-in." };
  if (checkOut > new Date()) return { error: "Attendance cannot be recorded in the future." };
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE`;
    const overlap = await tx.attendanceSession.findFirst({ where: { employeeId, workDate: date, checkIn: { lt: checkOut }, OR: [{ checkOut: null }, { checkOut: { gt: checkIn } }] } });
    if (overlap) return { error: "This overlaps an existing attendance session." };
    await tx.attendanceSession.create({ data: { employeeId, workDate: date, checkIn, checkOut } });
    return { ok: "Session added." };
  });
  refresh();
  return result;
}
