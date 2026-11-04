"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { mondayOf } from "@/lib/week";
import { toDateInput } from "@/lib/format";
import { readFiles } from "@/lib/project-files";
import { WEEK_LOCKED, checkDay, logTime, readEntry, readTarget, removeOwnEntry, submitOwnWeek } from "@/lib/timesheet-entries";
import type { FormState } from "@/components/action-form";
import { flash } from "@/lib/flash";
import { decideTimesheetRequest } from "@/lib/decisions";

function refresh() {
  revalidatePath("/timesheets", "layout");
  revalidatePath("/approvals");
  revalidatePath("/");
}

function refreshProject(projectId: string | null | undefined) {
  if (projectId) revalidatePath(`/projects/${projectId}`, "layout");
}

/** Logs a piece of the day's work, with files if attached. Rules: src/lib/timesheet-entries.ts. */
export async function addEntry(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const read = await readFiles(formData);
  if ("error" in read) return { error: read.error };
  const result = await logTime(user, Object.fromEntries(formData), read.files);
  if (result.error) return { error: result.error };
  refresh();
  refreshProject(result.projectId);
  return { ok: result.ok };
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
    return { error: WEEK_LOCKED };

  const checked = readEntry(Object.fromEntries(formData));
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
  const result = await removeOwnEntry(user, id);
  if (result.error === WEEK_LOCKED) throw new Error("Week is locked");
  if (result.ok) refresh();
}

export async function submitWeek(id: string) {
  const user = await requireUser();
  const result = await submitOwnWeek(user, id);
  if (result.error?.startsWith("Log some hours")) throw new Error("Log some hours before submitting");
  if (result.ok) refresh();
}

/** The employee's manager or an admin approves a week, or sends it back with a note. */
export async function decideTimesheet(id: string, formData: FormData) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const decision = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const result = await decideTimesheetRequest(user, id, decision, note);
  if (result.error && !result.gone) throw new Error(result.error);
  refresh();
}
