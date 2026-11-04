import "server-only";
import type { Project, ProjectTask } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "./db";
import type { CurrentUser } from "./auth";
import { parseDateOnly } from "./leave";
import { mondayOf } from "./week";
import { todayIST } from "./time";
import { formatDate } from "./format";
import { canUpdateTask, projectScope } from "./projects";
import type { IncomingFile } from "./project-files";
import { recordTaskUpdate } from "./task-updates";
import { overlapping, workedMinutes } from "./daily-log";
import type { Outcome } from "./leave-requests";

/**
 * Logging time into the week's timesheet. The web Timesheet page (src/app/(app)/timesheets/actions.ts) and the
 * phone app (src/app/api/mobile/timesheet) both call these, so the day checks live in one place.
 */

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

export type EntryInput = z.infer<typeof entrySchema>;
export const WEEK_LOCKED = "That week is already submitted. Ask your manager to send it back to change it.";

/** Validates the fields (form or phone) and works out the hours (from start and end, minus lunch, or typed in). */
export function readEntry(fields: Record<string, unknown>): { error: string } | { data: EntryInput; hours: number } {
  const parsed = entrySchema.safeParse(fields);
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
export async function checkDay(
  tx: Tx,
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
export async function readTarget(user: CurrentUser, target: string) {
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
 * Logs a piece of the day's work (Task Flow's daily worksheet) into the week's timesheet. Against one of your tasks it
 * can also move the task's progress and attach files, which then show on the task for the project owner.
 */
export async function logTime(
  user: CurrentUser,
  fields: Record<string, unknown>,
  files: IncomingFile[] = [],
): Promise<Outcome & { projectId?: string | null }> {
  if (!user.employee) return { error: "Timesheets need an employee record linked to your login. Ask an admin." };
  const checked = readEntry(fields);
  if ("error" in checked) return { error: checked.error };
  const { hours } = checked;
  const { date, target, startTime, endTime, title, note, workStatus, progress, remarks } = checked.data;

  const resolved = await readTarget(user, target);
  if ("error" in resolved) return { error: resolved.error as string };
  const { projectId, task } = resolved;
  if (!projectId && !title && !note) return { error: "Pick a project or say what the time was for." };
  if (files.length > 0 && !projectId) return { error: "Pick a project or task to attach files to." };
  const canReport = task !== null && canUpdateTask(user, task, task.project);
  const progressChange = canReport && progress !== undefined && progress !== task!.progress ? progress : undefined;

  const weekStart = mondayOf(date);
  const sheet = await db.timesheet.upsert({
    where: { employeeId_weekStart: { employeeId: user.employee.id, weekStart } },
    create: { employeeId: user.employee.id, weekStart },
    update: {},
  });
  if (sheet.status === "SUBMITTED" || sheet.status === "APPROVED") return { error: WEEK_LOCKED };

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
    if (canReport && (progressChange !== undefined || files.length > 0)) {
      await recordTaskUpdate(tx, task!, user.id, { note: summary, progress: progressChange, files });
    } else if (files.length > 0) {
      const update = await tx.projectUpdate.create({ data: { projectId: projectId!, taskId: task?.id ?? null, authorId: user.id, note: summary } });
      for (const f of files) {
        await tx.projectFile.create({ data: { ...f, projectId: projectId!, taskId: task?.id ?? null, updateId: update.id, uploadedById: user.id } });
      }
    }
    return null;
  });
  if (clash) return { error: clash };
  return {
    ok: progressChange !== undefined ? `Logged ${hours} h and updated the task to ${progressChange}%.` : `Logged ${hours} h.`,
    projectId,
  };
}

/** Removes one of your own entries while its week is still open. */
export async function removeOwnEntry(user: CurrentUser, id: string): Promise<Outcome> {
  const entry = await db.timeEntry.findUnique({ where: { id }, include: { timesheet: true } });
  if (!entry || !user.employee || entry.timesheet.employeeId !== user.employee.id) return { error: "That entry isn't yours." };
  if (entry.timesheet.status === "SUBMITTED" || entry.timesheet.status === "APPROVED") return { error: WEEK_LOCKED };
  await db.timeEntry.delete({ where: { id } });
  return { ok: "Entry removed." };
}

/** Sends your week to your manager. */
export async function submitOwnWeek(user: CurrentUser, id: string): Promise<Outcome> {
  const sheet = await db.timesheet.findUnique({ where: { id }, include: { _count: { select: { entries: true } } } });
  if (!sheet || !user.employee || sheet.employeeId !== user.employee.id) return { error: "That timesheet isn't yours." };
  if (sheet.status === "SUBMITTED" || sheet.status === "APPROVED") return { error: "That week is already submitted." };
  if (sheet._count.entries === 0) return { error: "Log some hours before submitting." };
  const changed = await db.timesheet.updateMany({
    where: { id, status: { notIn: ["SUBMITTED", "APPROVED"] } },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  if (!changed.count) return { error: "That week is already submitted." };
  return { ok: "Week sent to your manager." };
}
