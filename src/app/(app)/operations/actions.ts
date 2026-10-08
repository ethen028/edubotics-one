"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { parseDateOnly } from "@/lib/leave";
import { dateKey } from "@/lib/attendance";
import { formatDate } from "@/lib/format";
import { canLogSession, canManageProgramme, findClashes } from "@/lib/operations";
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
const optionalCount = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().int().min(0).max(100000).nullable())
  .optional();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use a time like 10:30");
const duration = z.coerce.number().int().min(10, "at least 10 minutes").max(480, "at most 8 hours");

function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  return `${issue.path.join(".") || "Form"}: ${issue.message}`;
}

function refresh(programmeId?: string) {
  revalidatePath("/operations", "layout");
  if (programmeId) revalidatePath(`/operations/programmes/${programmeId}`);
  revalidatePath("/");
}

async function managedProgramme(user: CurrentUser, id: string) {
  const programme = await db.programme.findUnique({ where: { id } });
  if (!programme) throw new Error("Programme not found");
  if (!canManageProgramme(user, programme)) throw new Error("Only an admin, a manager or the programme coordinator can change this");
  return programme;
}

/** Whoever teaches at a school is on its trainer list. */
async function ensureTrainer(programmeId: string, userId: string | null | undefined) {
  if (!userId) return;
  await db.programmeTrainer.upsert({
    where: { programmeId_userId: { programmeId, userId } },
    create: { programmeId, userId },
    update: {},
  });
}

// ─── Programmes ────────────────────────────────────────────────────────────

const programmeSchema = z.object({
  name: z.string().trim().min(1, "required"),
  organizationId: z.string().min(1, "pick a school"),
  contactId: optional,
  projectId: optional,
  academicYear: optional,
  grades: optional,
  students: optionalCount,
  sessionsPlanned: optionalCount,
  startDate: optionalDate,
  endDate: optionalDate,
  status: z.enum(["PLANNED", "RUNNING", "PAUSED", "COMPLETED"]),
  coordinatorId: z.string().min(1, "required"),
  notes: optional,
});

export async function createProgramme(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN", "MANAGER"]);
  const parsed = programmeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const data = parsed.data;
  if (data.startDate && data.endDate && data.endDate < data.startDate) return { error: "End date is before the start date." };
  const programme = await db.programme.create({ data });
  refresh();
  redirect(`/operations/programmes/${programme.id}`);
}

export async function updateProgramme(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  await managedProgramme(user, id);
  const parsed = programmeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (parsed.data.startDate && parsed.data.endDate && parsed.data.endDate < parsed.data.startDate)
    return { error: "End date is before the start date." };
  await db.programme.update({ where: { id }, data: parsed.data });
  refresh(id);
  return { ok: "Saved." };
}

export async function setProgrammeStatus(id: string, formData: FormData) {
  const user = await requireUser();
  await managedProgramme(user, id);
  const status = z.enum(["PLANNED", "RUNNING", "PAUSED", "COMPLETED"]).parse(formData.get("status"));
  await db.programme.update({ where: { id }, data: { status } });
  refresh(id);
}

export async function deleteProgramme(id: string) {
  await requireUser(["ADMIN"]);
  await db.programme.delete({ where: { id } });
  refresh();
  redirect("/operations/programmes");
}

// ─── Trainers ──────────────────────────────────────────────────────────────

export async function addTrainer(programmeId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  await managedProgramme(user, programmeId);
  const userId = String(formData.get("userId") ?? "");
  const classes = String(formData.get("classes") ?? "").trim() || null;
  if (!userId) return { error: "Pick a trainer." };
  await db.programmeTrainer.upsert({
    where: { programmeId_userId: { programmeId, userId } },
    create: { programmeId, userId, classes },
    update: { classes },
  });
  refresh(programmeId);
  return { ok: "Trainer assigned." };
}

export async function removeTrainer(id: string) {
  const user = await requireUser();
  const trainer = await db.programmeTrainer.findUnique({ where: { id } });
  if (!trainer) return;
  await managedProgramme(user, trainer.programmeId);
  await db.programmeTrainer.delete({ where: { id } });
  refresh(trainer.programmeId);
}

// ─── Sessions ──────────────────────────────────────────────────────────────

const MAX_BATCH = 300;

const slotSchema = z.object({
  startTime: time,
  durationMins: duration,
  classGroup: optional,
  topic: optional,
  trainerId: optional,
});

/** Add one session, or a weekly timetable between two dates that skips holidays. */
export async function addSessions(programmeId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const programme = await managedProgramme(user, programmeId);
  const slot = slotSchema.safeParse(Object.fromEntries(formData));
  if (!slot.success) return { error: firstError(slot.error) };

  let dates: Date[];
  const skipped: string[] = [];
  if (formData.get("repeat") === "weekly") {
    const fromValue = String(formData.get("from") ?? "");
    const toValue = String(formData.get("to") ?? "");
    if (!fromValue || !toValue) return { error: "Pick the first and last dates." };
    const from = parseDateOnly(fromValue);
    const to = parseDateOnly(toValue);
    if (to < from) return { error: "The end date is before the start date." };
    const weekdays = formData.getAll("weekday").map(Number);
    if (weekdays.length === 0) return { error: "Tick at least one day of the week." };
    const holidays = await db.holiday.findMany({ where: { date: { gte: from, lte: to }, optional: false } });
    const holidayName = new Map(holidays.map((h) => [dateKey(h.date), h.name]));
    dates = [];
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400000)) {
      if (!weekdays.includes(d.getUTCDay())) continue;
      const holiday = holidayName.get(dateKey(d));
      if (holiday) skipped.push(`${holiday} (${formatDate(d)})`);
      else dates.push(d);
    }
    if (dates.length === 0) return { error: "No school days fall in that range." };
    if (dates.length > MAX_BATCH) return { error: `That makes ${dates.length} sessions; add at most ${MAX_BATCH} at a time.` };
  } else {
    const date = String(formData.get("date") ?? "");
    if (!date) return { error: "date: required" };
    dates = [parseDateOnly(date)];
  }

  await db.$transaction([
    db.programmeSession.createMany({ data: dates.map((date) => ({ programmeId, date, ...slot.data })) }),
    ...(programme.status === "PLANNED" ? [db.programme.update({ where: { id: programmeId }, data: { status: "RUNNING" } })] : []),
  ]);
  await ensureTrainer(programmeId, slot.data.trainerId);

  // Tell the coordinator straight away if the trainer is double-booked.
  let clashNote = "";
  if (slot.data.trainerId) {
    const theirs = await db.programmeSession.findMany({
      where: { trainerId: slot.data.trainerId, date: { gte: dates[0], lte: dates[dates.length - 1] } },
    });
    const clashes = findClashes(theirs);
    const clashing = theirs.filter((s) => clashes.has(s.id) && s.programmeId === programmeId && dates.some((d) => d.getTime() === s.date.getTime()));
    if (clashing.length) clashNote = ` ${clashing.length} clash with the trainer's other sessions; see the schedule.`;
  }
  refresh(programmeId);
  const added = dates.length === 1 ? "Session added." : `${dates.length} sessions added.`;
  return { ok: `${added}${skipped.length ? ` Skipped holidays: ${skipped.join(", ")}.` : ""}${clashNote}` };
}

const rescheduleSchema = slotSchema.extend({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "required")
    .transform(parseDateOnly),
});

export async function updateSession(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const session = await db.programmeSession.findUnique({ where: { id } });
  if (!session) return { error: "Session not found." };
  await managedProgramme(user, session.programmeId);
  const parsed = rescheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  await db.programmeSession.update({ where: { id }, data: parsed.data });
  await ensureTrainer(session.programmeId, parsed.data.trainerId);
  refresh(session.programmeId);
  return { ok: "Session updated." };
}

const logSchema = z
  .object({
    status: z.enum(["COMPLETED", "CANCELLED", "MISSED"], "pick what happened"),
    studentsPresent: optionalCount,
    covered: optional,
    notes: optional,
    issues: optional,
  })
  .superRefine((v, ctx) => {
    if (v.status === "COMPLETED" && !v.covered) ctx.addIssue({ code: "custom", path: ["covered"], message: "say what was taught" });
    if ((v.status === "CANCELLED" || v.status === "MISSED") && !v.notes)
      ctx.addIssue({ code: "custom", path: ["notes"], message: "give the reason" });
  });

/** The trainer's record of what happened in the class. */
export async function logSession(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const session = await db.programmeSession.findUnique({ where: { id }, include: { programme: true } });
  if (!session) return { error: "Session not found." };
  if (!canLogSession(user, session)) return { error: "Only the session's trainer or the programme coordinator can log it." };
  const parsed = logSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  await db.programmeSession.update({ where: { id }, data: { ...parsed.data, loggedById: user.id, loggedAt: new Date() } });
  refresh(session.programmeId);
  return { ok: "Session logged." };
}

/** Undo a log, e.g. a session marked held by mistake. */
export async function reopenSession(id: string) {
  const user = await requireUser();
  const session = await db.programmeSession.findUnique({ where: { id }, include: { programme: true } });
  if (!session) return;
  if (!canLogSession(user, session)) throw new Error("Not allowed");
  await db.programmeSession.update({
    where: { id },
    data: { status: "SCHEDULED", studentsPresent: null, covered: null, notes: null, issues: null, loggedById: null, loggedAt: null },
  });
  refresh(session.programmeId);
}

export async function deleteSession(id: string) {
  const user = await requireUser();
  const session = await db.programmeSession.findUnique({ where: { id } });
  if (!session) return;
  await managedProgramme(user, session.programmeId);
  await db.programmeSession.delete({ where: { id } });
  refresh(session.programmeId);
  redirect(`/operations/programmes/${session.programmeId}`);
}
