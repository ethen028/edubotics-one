"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma, Project, ProjectTask } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseDateOnly } from "@/lib/leave";
import { canManage } from "@/lib/team";
import { mondayOf } from "@/lib/week";
import { todayIST } from "@/lib/time";
import { toDateInput } from "@/lib/format";
import { canUpdateTask, projectScope } from "@/lib/projects";
import { readFiles } from "@/lib/project-files";
import { recordTaskUpdate } from "@/lib/task-updates";
import { overlapping, workedMinutes } from "@/lib/daily-log";
import { notify } from "@/lib/notifications";
import { formatDate } from "@/lib/format";
import type { FormState } from "@/components/action-form";
import { flash } from "@/lib/flash";

function refresh() {
  revalidatePath("/timesheets", "layout");
  revalidatePath("/approvals");
  revalidatePath("/");
}

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));
const clock = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "use HH:MM");

const entrySchema = z.object({
  date: z.string().trim().min(1, "required").transform(parseDateOnly),
  // "task:<id>", "project:<id>" or "" for general work.
  target: z.string().trim().optional().default(""),
  hours: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null)),
  startTime: clock,
  endTime: clock,
  title: optionalText,
  note: optionalText,
  workStatus: z.enum(["COMPLETED", "IN_PROGRESS", "PENDING", "BLOCKED"]).optional().or(z.literal("").transform(() => undefined)),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  remarks: optionalText,
});

type EntryInput = z.infer<typeof entrySchema>;

/** Validates the form and works out the hours (from start and end, minus lunch, or typed in). */
function readEntry(formData: FormData): { error: string } | { data: EntryInput; hours: number } {
  const parsed = entrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `${issue.path.join(".") || "Form"}: ${issue.message}` };
  }
  const { date, startTime, endTime } = parsed.data;
  if (date > todayIST()) return { error: "You can't log work for a future day." };

  let hours = parsed.data.hours;
  if (startTime || endTime) {
    if (!startTime || !endTime) return { error: "Give both a start and an end time, or just the hours." };
    const minutes = workedMinutes(startTime, endTime);
    if (minutes === null) return { error: "The end time must be after the start time." };
    hours = Math.round((minutes / 60) * 4) / 4; // nearest 15 minutes
  }
  if (hours === null || Number.isNaN(hours)) return { error: "Give the start and end time, or the hours." };
  if (hours < 0.25) return { error: "hours: at least 15 minutes" };
  if (hours > 16) return { error: "hours: at most 16 hours" };
  return { data: parsed.data, hours };
}

/**
 * Task Flow v5's worksheet checks, done on the server: no more than 24 hours on a day, and clock times that don't overlap
 * another entry on the same day. Runs inside the transaction that saves the entry, holding a lock on the timesheet so
 * two browser tabs can't both slip in the same slot.
 */
async function checkDay(
  tx: Prisma.TransactionClient,
  timesheetId: string,
  date: Date,
  hours: number,
  startTime: string | null,
  endTime: string | null,
  exceptId?: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`timesheet:${timesheetId}`}))`;
  const sameDay = await tx.timeEntry.findMany({
    where: { timesheetId, date, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { hours: true, startTime: true, endTime: true, title: true, note: true },
  });
  if (sameDay.reduce((s, e) => s + Number(e.hours), 0) + hours > 24) return "That would be more than 24 hours on one day.";
  if (startTime && endTime) {
    const hit = sameDay.find((e) => e.startTime && e.endTime && overlapping(startTime, endTime, e.startTime, e.endTime));
    if (hit)
      return `That overlaps ${hit.startTime}–${hit.endTime}${hit.title || hit.note ? ` (${hit.title || hit.note})` : ""}, already logged on ${formatDate(date)}.`;
  }
  return null;
}

/** Resolves "task:<id>" / "project:<id>" to a task and project the user is on. */
async function readTarget(user: Awaited<ReturnType<typeof requireUser>>, target: string) {
  let projectId: string | null = null;
  let task: (ProjectTask & { project: Project }) | null = null;
  if (target.startsWith("task:")) {
    task = await db.projectTask.findUnique({ where: { id: target.slice(5) }, include: { project: true } });
    if (!task) return { error: "That task no longer exists." } as const;
    projectId = task.projectId;
  } else if (target.startsWith("project:")) {
    projectId = target.slice(8);
  }
  if (projectId && !(await db.project.findFirst({ where: { id: projectId, ...projectScope(user) }, select: { id: true } })))
    return { error: "You aren't on that project." } as const;
  return { projectId, task };
}

/**
 * Logs a piece of the day's work (Task Flow's daily worksheet) into the week's timesheet. Hours come from the start and
 * end times, minus the lunch break, or are typed in. Against one of your tasks it can also move the task's progress and
 * attach files, which then show on the task for the project owner.
 */
export async function addEntry(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.employee) return { error: "Timesheets need an employee record linked to your login. Ask an admin." };
  const checked = readEntry(formData);
  if ("error" in checked) return { error: checked.error };
  const { hours } = checked;
  const { date, target, startTime, endTime, title, note, workStatus, progress, remarks } = checked.data;

  const resolved = await readTarget(user, target);
  if ("error" in resolved) return { error: resolved.error };
  const { projectId, task } = resolved;
  if (!projectId && !title && !note) return { error: "Pick a project or say what the time was for." };

  const read = await readFiles(formData);
  if ("error" in read) return { error: read.error };
  if (read.files.length > 0 && !projectId) return { error: "Pick a project or task to attach files to." };
  const canReport = task !== null && canUpdateTask(user, task, task.project);
  const progressChange = canReport && progress !== undefined && progress !== task!.progress ? progress : undefined;

  const weekStart = mondayOf(date);
  const sheet = await db.timesheet.upsert({
    where: { employeeId_weekStart: { employeeId: user.employee.id, weekStart } },
    create: { employeeId: user.employee.id, weekStart },
    update: {},
  });
  if (sheet.status === "SUBMITTED" || sheet.status === "APPROVED")
    return { error: "That week is already submitted. Ask your manager to send it back to change it." };

  const summary = [title, note].filter(Boolean).join(": ") || null;
  const clash = await db.$transaction(async (tx) => {
    const problem = await checkDay(tx, sheet.id, date, hours, startTime, endTime);
    if (problem) return problem;
    await tx.timeEntry.create({
      data: {
        timesheetId: sheet.id,
        date,
        projectId,
        taskId: task?.id ?? null,
        hours,
        note,
        title,
        startTime,
        endTime,
        workStatus: workStatus ?? null,
        remarks,
      },
    });
    // Progress and files go onto the task (or project) too, so the owner sees them where they look.
    if (canReport && (progressChange !== undefined || read.files.length > 0)) {
      await recordTaskUpdate(tx, task!, user.id, { note: summary, progress: progressChange, files: read.files });
    } else if (read.files.length > 0) {
      const update = await tx.projectUpdate.create({ data: { projectId: projectId!, taskId: task?.id ?? null, authorId: user.id, note: summary } });
      for (const f of read.files) {
        await tx.projectFile.create({ data: { ...f, projectId: projectId!, taskId: task?.id ?? null, updateId: update.id, uploadedById: user.id } });
      }
    }
    return null;
  });
  if (clash) return { error: clash };
  refresh();
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: progressChange !== undefined ? `Logged ${hours} h and updated the task to ${progressChange}%.` : `Logged ${hours} h.` };
}

/**
 * Corrects one of your own entries while its week is still open (WorkPulse's "edit work entry"). The day stays in the
 * same week; each change is counted so a manager can see the entry was changed after it was first logged.
 */
export async function updateEntry(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const entry = await db.timeEntry.findUnique({ where: { id }, include: { timesheet: true } });
  if (!entry || !user.employee || entry.timesheet.employeeId !== user.employee.id) return { error: "That entry isn't yours." };
  if (entry.timesheet.status === "SUBMITTED" || entry.timesheet.status === "APPROVED")
    return { error: "That week is already submitted. Ask your manager to send it back to change it." };

  const checked = readEntry(formData);
  if ("error" in checked) return { error: checked.error };
  const { hours } = checked;
  const { date, target, startTime, endTime, title, note, workStatus, remarks } = checked.data;
  if (mondayOf(date).getTime() !== entry.timesheet.weekStart.getTime())
    return { error: "Pick a day in the same week. To move it to another week, remove it and log it there." };

  const resolved = await readTarget(user, target);
  if ("error" in resolved) return { error: resolved.error };
  const { projectId, task } = resolved;
  if (!projectId && !title && !note) return { error: "Pick a project or say what the time was for." };

  const clash = await db.$transaction(async (tx) => {
    const problem = await checkDay(tx, entry.timesheetId, date, hours, startTime, endTime, id);
    if (problem) return problem;
    await tx.timeEntry.update({
    where: { id },
    data: {
      date,
      projectId,
      taskId: task?.id ?? null,
      hours,
      note,
      title,
      startTime,
      endTime,
      workStatus: workStatus ?? null,
      remarks,
      editCount: { increment: 1 },
      editedAt: new Date(),
    },
    });
    return null;
  });
  if (clash) return { error: clash };
  refresh();
  await flash("Time entry saved.");
  redirect(`/timesheets?week=${toDateInput(entry.timesheet.weekStart)}`);
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
  const employee = await db.employee.findUnique({ where: { id: sheet.employeeId }, select: { userId: true } });
  await notify([employee?.userId], user.id, {
    kind: "timesheet.decided",
    title: `${user.name} ${decision === "APPROVED" ? "approved" : "sent back"} your timesheet for the week of ${formatDate(sheet.weekStart)}`,
    body: note,
    href: `/timesheets?week=${toDateInput(sheet.weekStart)}`,
  });
  refresh();
}
