"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseDateOnly } from "@/lib/leave";
import { canManage } from "@/lib/team";
import { mondayOf } from "@/lib/week";
import type { FormState } from "@/components/action-form";

function refresh() {
  revalidatePath("/timesheets", "layout");
  revalidatePath("/approvals");
  revalidatePath("/");
}

const entrySchema = z.object({
  date: z.string().trim().min(1, "required").transform(parseDateOnly),
  projectId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
  taskId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  hours: z.coerce.number().min(0.25, "at least 15 minutes").max(16, "at most 16 hours"),
  note: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
});

export async function addEntry(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.employee) return { error: "Timesheets need an employee record linked to your login. Ask an admin." };
  const parsed = entrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `${issue.path.join(".") || "Form"}: ${issue.message}` };
  }
  const { date, taskId, hours, note } = parsed.data;
  let { projectId } = parsed.data;
  if (taskId) {
    // Picking a task is enough; its project comes with it.
    const task = await db.projectTask.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!task || (projectId && task.projectId !== projectId)) return { error: "That task isn't part of the chosen project." };
    projectId = task.projectId;
  }
  if (!projectId && !note) return { error: "Pick a project or say what the time was for." };

  const weekStart = mondayOf(date);
  const sheet = await db.timesheet.upsert({
    where: { employeeId_weekStart: { employeeId: user.employee.id, weekStart } },
    create: { employeeId: user.employee.id, weekStart },
    update: {},
  });
  if (sheet.status === "SUBMITTED" || sheet.status === "APPROVED")
    return { error: "That week is already submitted. Ask your manager to send it back to change it." };

  const dayTotal = await db.timeEntry.aggregate({ where: { timesheetId: sheet.id, date }, _sum: { hours: true } });
  if (Number(dayTotal._sum.hours ?? 0) + hours > 24) return { error: "That would be more than 24 hours on one day." };

  await db.timeEntry.create({ data: { timesheetId: sheet.id, date, projectId, taskId, hours, note } });
  refresh();
  return { ok: "Logged." };
}

export async function deleteEntry(id: string) {
  const user = await requireUser();
  const entry = await db.timeEntry.findUnique({ where: { id }, include: { timesheet: true } });
  if (!entry || entry.timesheet.employeeId !== user.employee?.id) return;
  if (entry.timesheet.status === "SUBMITTED" || entry.timesheet.status === "APPROVED") throw new Error("Week is locked");
  await db.timeEntry.delete({ where: { id } });
  refresh();
}

export async function submitWeek(id: string) {
  const user = await requireUser();
  const sheet = await db.timesheet.findUnique({ where: { id }, include: { _count: { select: { entries: true } } } });
  if (!sheet || sheet.employeeId !== user.employee?.id) return;
  if (sheet.status === "SUBMITTED" || sheet.status === "APPROVED") return;
  if (sheet._count.entries === 0) throw new Error("Log some hours before submitting");
  await db.timesheet.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  refresh();
}

/** The employee's manager or an admin approves a week, or sends it back with a note. */
export async function decideTimesheet(id: string, formData: FormData) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const sheet = await db.timesheet.findUnique({ where: { id } });
  if (!sheet || sheet.status !== "SUBMITTED") return;
  if (sheet.employeeId === user.employee?.id || !(await canManage(user, sheet.employeeId))) throw new Error("Not allowed");
  const decision = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim() || null;
  await db.timesheet.update({
    where: { id },
    data: { status: decision, decisionNote: note, decidedById: user.id, decidedAt: new Date() },
  });
  refresh();
}
