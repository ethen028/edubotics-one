"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PlanMetricKind } from "@prisma/client";
import { db } from "@/lib/db";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { loadOperatingCalendar } from "@/lib/plan-load";
import { monthLabel, monthParam, parseMonth } from "@/lib/plan-rules";
import type { FormState } from "@/components/action-form";

function refresh() {
  revalidatePath("/plan");
  revalidatePath("/plan/year");
  revalidatePath("/calendar");
  revalidatePath("/", "layout");
}

const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters`);
const optionalText = (max: number) =>
  text(max)
    .optional()
    .transform((v) => v || null);
const optionalNumber = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const t = v?.replace(/[,₹\s]/g, "") ?? "";
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Numbers only, like 600 or 86500" });
      return z.NEVER;
    }
    return n;
  });
const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null));

async function monthFor(value: FormDataEntryValue | null) {
  const month = parseMonth(typeof value === "string" ? value : null);
  if (!month) throw new Error("Pick a month");
  return (
    (await db.planMonth.findUnique({ where: { month } })) ??
    db.planMonth.create({ data: { month, focus: "Not set yet", activities: "" } })
  );
}

const taskSchema = z.object({
  area: text(60).min(2, "Pick an area"),
  activity: text(300).min(3, "Say what the activity is"),
  ownerId: z
    .string()
    .optional()
    .transform((v) => v || null),
  deadline: optionalDate,
  target: optionalNumber,
  unit: optionalText(30),
  notes: optionalText(1000),
});

export async function addPlanTask(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isManagerOrAdmin(user)) return { error: "Only managers and admins plan the month." };
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const month = await monthFor(formData.get("month"));
  const count = await db.planTask.count({ where: { monthId: month.id } });
  const task = await db.planTask.create({ data: { ...parsed.data, monthId: month.id, createdById: user.id, sort: count } });
  await notify([task.ownerId], user.id, {
    kind: "plan.assigned",
    title: `New task in the ${monthLabel(month.month)} work plan`,
    body: task.activity,
    href: `/plan?month=${monthParam(month.month)}#task-${task.id}`,
  });
  refresh();
  return { ok: "Task added to the work plan." };
}

export async function editPlanTask(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isManagerOrAdmin(user)) return { error: "Only managers and admins change the plan." };
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const before = await db.planTask.findUnique({ where: { id }, include: { month: true } });
  if (!before) return { error: "That task is no longer in the plan." };
  await db.planTask.update({ where: { id }, data: parsed.data });
  if (parsed.data.ownerId && parsed.data.ownerId !== before.ownerId) {
    await notify([parsed.data.ownerId], user.id, {
      kind: "plan.assigned",
      title: `You now own a task in the ${monthLabel(before.month.month)} work plan`,
      body: parsed.data.activity,
      href: `/plan?month=${monthParam(before.month.month)}#task-${id}`,
    });
  }
  refresh();
  return { ok: "Task saved." };
}

export async function deletePlanTask(id: string) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user)) return;
  await db.planTask.delete({ where: { id } }).catch(() => null);
  refresh();
}

const updateSchema = z.object({
  actual: optionalNumber,
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE", "BLOCKED"]),
  note: optionalText(1000),
});

/** The owner's Friday update (a manager can also update for them). */
export async function updatePlanTask(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const task = await db.planTask.findUnique({ where: { id }, include: { month: true } });
  if (!task) return { error: "That task is no longer in the plan." };
  if (task.ownerId !== user.id && !isManagerOrAdmin(user)) return { error: "Only the task's owner or a manager can update it." };
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { actual, status, note } = parsed.data;
  await db.$transaction([
    db.planTask.update({ where: { id }, data: { actual, status, lastUpdateAt: new Date() } }),
    db.planTaskUpdate.create({ data: { taskId: id, userId: user.id, actual, status, note } }),
  ]);
  refresh();
  return { ok: "Update saved. Thank you." };
}

const reviewSchema = z.object({
  rag: z.enum(["GREEN", "AMBER", "RED"], { message: "Pick Green, Amber or Red" }),
  note: optionalText(1000),
  recovery: optionalText(2000),
});

/** Saturday review: the colour for the week, and a recovery plan when it is Red. */
export async function reviewPlanTask(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isManagerOrAdmin(user)) return { error: "Only managers and admins mark the weekly review." };
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const task = await db.planTask.findUnique({ where: { id }, include: { month: true } });
  if (!task) return { error: "That task is no longer in the plan." };
  const { rag, note, recovery } = parsed.data;
  await db.$transaction([
    db.planTask.update({ where: { id }, data: { rag, ragAt: new Date(), ...(rag === "RED" ? { recovery: recovery ?? task.recovery } : {}) } }),
    db.planTaskUpdate.create({ data: { taskId: id, userId: user.id, review: true, rag, note } }),
  ]);
  await notify([task.ownerId], user.id, {
    kind: "plan.review",
    title: `${rag === "GREEN" ? "Green" : rag === "AMBER" ? "Amber" : "Red"} at this week's review: ${task.activity}`,
    body: rag === "RED" ? "A written recovery plan is due within 48 hours." : note,
    href: `/plan?month=${monthParam(task.month.month)}#task-${id}`,
  });
  refresh();
  return { ok: "Review saved." };
}

const monthSchema = z.object({
  focus: text(200).min(3, "Say what the month is about"),
  activities: text(3000),
  targets: optionalText(1000),
  leads: optionalText(200),
  planningMeeting: optionalDate,
});

export async function saveMonth(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isManagerOrAdmin(user)) return { error: "Only managers and admins change the annual plan." };
  const parsed = monthSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const month = parseMonth(String(formData.get("month") ?? ""));
  if (!month) return { error: "Pick a month" };
  const { planningMeeting, ...rest } = parsed.data;
  const data = { ...rest, planningMeeting: planningMeeting ? new Date(planningMeeting.getTime() + 4.5 * 3600000) : null };
  await db.planMonth.upsert({ where: { month }, create: { month, ...data }, update: data });
  refresh();
  return { ok: `${monthLabel(month)} saved.` };
}

export async function saveMonthReview(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isManagerOrAdmin(user)) return { error: "Only managers and admins write the month-end review." };
  const month = await monthFor(formData.get("month"));
  const review = String(formData.get("review") ?? "").trim().slice(0, 3000);
  await db.planMonth.update({ where: { id: month.id }, data: { review: review || null, reviewedAt: review ? new Date() : null } });
  refresh();
  return { ok: "Month-end review saved." };
}

const METRIC_KINDS = [
  "LEADS",
  "MEETINGS",
  "CONVERSIONS",
  "WORKSHOP_STUDENTS",
  "INTERNSHIP_STUDENTS",
  "COLLEGE_PROJECTS",
  "SCHOOL_PROPOSALS",
  "INVOICED",
  "RECEIVED",
  "CUSTOM",
] as const satisfies readonly PlanMetricKind[];

const metricSchema = z.object({
  kind: z.enum(METRIC_KINDS),
  label: text(80).min(2, "Name the target"),
  target: optionalNumber.refine((v) => v !== null, "Enter the target number"),
});

export async function addMetric(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isManagerOrAdmin(user)) return { error: "Only managers and admins set targets." };
  const parsed = metricSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const month = await monthFor(formData.get("month"));
  const count = await db.planMetric.count({ where: { monthId: month.id } });
  await db.planMetric.create({ data: { monthId: month.id, kind: parsed.data.kind, label: parsed.data.label, target: parsed.data.target!, sort: count } });
  refresh();
  return { ok: "Target added." };
}

export async function setMetricActual(id: string, formData: FormData) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user)) return;
  const parsed = optionalNumber.safeParse(formData.get("actual") ?? "");
  if (!parsed.success) return;
  await db.planMetric.update({ where: { id }, data: { manualActual: parsed.data } }).catch(() => null);
  refresh();
}

export async function deleteMetric(id: string) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user)) return;
  await db.planMetric.delete({ where: { id } }).catch(() => null);
  refresh();
}

export async function loadCalendar(): Promise<FormState> {
  const user = await requireUser();
  if (!isManagerOrAdmin(user)) return { error: "Only managers and admins load the annual plan." };
  const added = await loadOperatingCalendar(db);
  refresh();
  return { ok: added ? `Loaded ${added} months of the operating calendar.` : "The calendar is already loaded." };
}

/** Copies last month's unfinished tasks into this month, so the plan carries over. */
export async function carryOver(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isManagerOrAdmin(user)) return { error: "Only managers and admins plan the month." };
  const month = await monthFor(formData.get("month"));
  const prev = new Date(Date.UTC(month.month.getUTCFullYear(), month.month.getUTCMonth() - 1, 1));
  const open = await db.planTask.findMany({ where: { month: { month: prev }, status: { not: "DONE" } }, orderBy: { sort: "asc" } });
  if (open.length === 0) return { error: `Nothing left open in ${monthLabel(prev)}.` };
  const count = await db.planTask.count({ where: { monthId: month.id } });
  await db.planTask.createMany({
    data: open.map((t, i) => ({
      monthId: month.id,
      area: t.area,
      activity: t.activity,
      ownerId: t.ownerId,
      target: t.target,
      unit: t.unit,
      actual: t.actual,
      status: t.status === "BLOCKED" ? "BLOCKED" : "IN_PROGRESS",
      notes: `Carried over from ${monthLabel(prev)}${t.notes ? `. ${t.notes}` : ""}`.slice(0, 1000),
      createdById: user.id,
      sort: count + i,
    })),
  });
  refresh();
  return { ok: `${open.length} unfinished task${open.length === 1 ? "" : "s"} carried over.` };
}
