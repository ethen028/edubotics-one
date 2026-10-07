"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAdmin, requireUser, type CurrentUser } from "@/lib/auth";
import { canManage } from "@/lib/team";
import { parseDateOnly } from "@/lib/leave";
import { getSettings } from "@/lib/settings";
import { todayIST } from "@/lib/time";
import { exitFor, openExitOf } from "@/lib/exits";
import { EXIT_REASONS, EXIT_TASK_CATEGORIES, EXIT_TASK_TEMPLATE } from "@/lib/exit-math";
import { OPEN_PROJECT_STAGES } from "@/lib/projects";
import type { FormState } from "@/components/action-form";

const date = z.string().trim().min(1, "Pick a date.").transform(parseDateOnly);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

function refresh(exitId: string, employeeId: string) {
  revalidatePath("/hr/exits");
  revalidatePath(`/hr/exits/${exitId}`);
  revalidatePath(`/hr/employees/${employeeId}`);
  revalidatePath("/hr/employees");
  revalidatePath("/approvals");
  revalidatePath("/", "layout");
}

/** Opens an exit for someone who may run it (admin or the person's manager), else throws. */
async function runnable(user: CurrentUser, id: string) {
  const found = await exitFor(user, id);
  if (!found || !found.canRun || found.isSelf) throw new Error("Not allowed");
  return found.exit;
}

/** Standard leaving checklist rows for a new exit. */
const taskRows = (exitId: string) => EXIT_TASK_TEMPLATE.map((t, i) => ({ exitId, title: t.title, category: t.category, sort: i }));

/** Ticks a standard checklist task the app can tell is done, if it is still on the list and open. */
function tickTask(exitId: string, title: (typeof EXIT_TASK_TEMPLATE)[number]["title"], userId: string) {
  return db.exitTask.updateMany({ where: { exitId, title, doneAt: null }, data: { doneAt: new Date(), doneById: userId } });
}

/** Accepting or starting an exit: the employee goes on notice with the agreed last day as their date of exit. */
async function putOnNotice(exitId: string, employeeId: string, lastWorkingDay: Date, userId: string) {
  await db.$transaction([
    db.employeeExit.update({
      where: { id: exitId },
      data: { stage: "ON_NOTICE", lastWorkingDay, acceptedById: userId, acceptedAt: new Date() },
    }),
    db.employee.update({ where: { id: employeeId }, data: { status: "ON_NOTICE", dateOfExit: lastWorkingDay } }),
    db.exitTask.createMany({ data: taskRows(exitId) }),
  ]);
}

// ─── Starting ──────────────────────────────────────────────────────────────

/** The person resigns from their own profile. Their manager (or an admin) accepts it. */
export async function submitResignation(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const employee = user.employee;
  if (!employee) return { error: "Your login isn't linked to an employee record. Ask HR." };
  if (employee.status === "EXITED") return { error: "Your employment has already ended." };
  if (await openExitOf(employee.id)) return { error: "You have already resigned. Open it from your profile." };
  const parsed = z
    .object({ proposedLastDay: date, reason: text(2000) })
    .safeParse({ proposedLastDay: formData.get("proposedLastDay"), reason: formData.get("reason") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const today = todayIST();
  if (parsed.data.proposedLastDay < today) return { error: "Your last working day can't be in the past." };
  const { noticePeriodDays } = await getSettings();
  const exit = await db.employeeExit.create({
    data: {
      employeeId: employee.id,
      kind: "RESIGNATION",
      noticeGivenOn: today,
      noticeDays: noticePeriodDays,
      proposedLastDay: parsed.data.proposedLastDay,
      reason: parsed.data.reason,
      startedById: user.id,
    },
  });
  refresh(exit.id, employee.id);
  redirect(`/hr/exits/${exit.id}`);
}

/** An admin records a resignation given on paper, or the company ending someone's employment. It starts accepted. */
export async function startExit(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const parsed = z
    .object({
      employeeId: z.string().min(1, "Choose the person."),
      kind: z.enum(["RESIGNATION", "TERMINATION", "END_OF_CONTRACT", "RETIREMENT", "OTHER"]),
      noticeGivenOn: date,
      lastWorkingDay: date,
      reason: text(2000),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.lastWorkingDay < d.noticeGivenOn) return { error: "The last working day is before the notice date." };
  const employee = await db.employee.findUnique({ where: { id: d.employeeId } });
  if (!employee || employee.status === "EXITED") return { error: "That person has already left." };
  if (employee.id === user.employee?.id) return { error: "Ask another admin to record your own exit." };
  if (await openExitOf(employee.id)) return { error: "This person already has an exit in progress." };
  if (d.lastWorkingDay < employee.dateOfJoining) return { error: "The last working day is before they joined." };
  const { noticePeriodDays } = await getSettings();
  const exit = await db.employeeExit.create({
    data: {
      employeeId: employee.id,
      kind: d.kind,
      noticeGivenOn: d.noticeGivenOn,
      noticeDays: noticePeriodDays,
      proposedLastDay: d.lastWorkingDay,
      reason: d.reason,
      startedById: user.id,
    },
  });
  await putOnNotice(exit.id, employee.id, d.lastWorkingDay, user.id);
  refresh(exit.id, employee.id);
  redirect(`/hr/exits/${exit.id}`);
}

// ─── Accepting, changing, withdrawing, leaving ─────────────────────────────

/** Accept a resignation with the agreed last working day. Used from Approvals and the exit page. */
export async function acceptResignation(id: string, formData: FormData) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const exit = await runnable(user, id);
  if (exit.stage !== "REQUESTED") throw new Error("This resignation was already dealt with");
  const lastWorkingDay = date.parse(formData.get("lastWorkingDay"));
  if (lastWorkingDay < exit.noticeGivenOn) throw new Error("The last working day is before the resignation");
  await putOnNotice(exit.id, exit.employeeId, lastWorkingDay, user.id);
  refresh(exit.id, exit.employeeId);
}

/** Admins can move the last working day while the person is on notice. */
export async function changeLastDay(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const exit = await runnable(user, id);
  if (exit.stage !== "ON_NOTICE") return { error: "The last day can only change while they are serving notice." };
  const parsed = date.safeParse(formData.get("lastWorkingDay"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data < exit.noticeGivenOn) return { error: "The last working day is before the notice date." };
  await db.$transaction([
    db.employeeExit.update({ where: { id }, data: { lastWorkingDay: parsed.data } }),
    db.employee.update({ where: { id: exit.employeeId }, data: { dateOfExit: parsed.data } }),
  ]);
  refresh(exit.id, exit.employeeId);
  return { ok: "Last working day changed. Recalculate that month's payroll if it was already drafted." };
}

/** The person takes back their resignation before it is accepted; admins can call off any exit before the person leaves. */
export async function withdrawExit(id: string) {
  const user = await requireUser();
  const found = await exitFor(user, id);
  if (!found) throw new Error("Not found");
  const { exit, admin, isSelf } = found;
  const allowed = (isSelf && exit.stage === "REQUESTED") || (admin && !isSelf && (exit.stage === "REQUESTED" || exit.stage === "ON_NOTICE"));
  if (!allowed) throw new Error("Not allowed");
  await db.$transaction([
    db.employeeExit.update({ where: { id }, data: { stage: "WITHDRAWN", withdrawnAt: new Date(), settlementAgreedAt: null } }),
    db.employee.update({
      where: { id: exit.employeeId },
      data: exit.stage === "ON_NOTICE" ? { status: "ACTIVE", dateOfExit: null } : {},
    }),
  ]);
  refresh(exit.id, exit.employeeId);
}

/** On or after the last day: the employee record is exited and their login switched off. */
export async function markLeft(id: string): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const exit = await runnable(user, id);
  if (exit.stage !== "ON_NOTICE" || !exit.lastWorkingDay) return { error: "Only someone serving notice can be marked as left." };
  if (exit.lastWorkingDay > todayIST()) return { error: "They can be marked as left on or after their last working day." };
  await db.$transaction([
    db.employeeExit.update({ where: { id }, data: { stage: "LEFT", leftAt: new Date() } }),
    db.employee.update({ where: { id: exit.employeeId }, data: { status: "EXITED", dateOfExit: exit.lastWorkingDay } }),
    ...(exit.employee.userId ? [db.user.update({ where: { id: exit.employee.userId }, data: { active: false } })] : []),
  ]);
  refresh(exit.id, exit.employeeId);
  return { ok: "Marked as left. Their login is switched off." };
}

export async function setRehire(id: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const exit = await runnable(user, id);
  const v = String(formData.get("rehireEligible") ?? "");
  await db.employeeExit.update({ where: { id }, data: { rehireEligible: v === "yes" ? true : v === "no" ? false : null } });
  refresh(exit.id, exit.employeeId);
}

// ─── Checklist ─────────────────────────────────────────────────────────────

export async function toggleExitTask(taskId: string) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const task = await db.exitTask.findUniqueOrThrow({ where: { id: taskId } });
  const exit = await runnable(user, task.exitId);
  if (exit.stage === "WITHDRAWN") throw new Error("This exit was withdrawn");
  await db.exitTask.update({
    where: { id: taskId },
    data: task.doneAt ? { doneAt: null, doneById: null } : { doneAt: new Date(), doneById: user.id },
  });
  refresh(exit.id, exit.employeeId);
}

export async function addExitTask(exitId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const exit = await runnable(user, exitId);
  const parsed = z
    .object({ title: z.string().trim().min(2, "Write the task.").max(200), category: z.enum(EXIT_TASK_CATEGORIES) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.exitTask.create({ data: { exitId, ...parsed.data, sort: 100 } });
  refresh(exit.id, exit.employeeId);
  return { ok: "Added." };
}

export async function deleteExitTask(taskId: string) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const task = await db.exitTask.findUniqueOrThrow({ where: { id: taskId } });
  const exit = await runnable(user, task.exitId);
  await db.exitTask.delete({ where: { id: taskId } });
  refresh(exit.id, exit.employeeId);
}

// ─── Assets ────────────────────────────────────────────────────────────────

/** Asset handed back (in stock again) or not returned (written off; add its cost to recoveries if it is to be charged). */
export async function settleAsset(exitId: string, assetId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const exit = await runnable(user, exitId);
  const outcome = z.enum(["RETURNED", "MISSING"]).parse(formData.get("outcome"));
  const asset = await db.asset.findUniqueOrThrow({ where: { id: assetId } });
  if (asset.employeeId !== exit.employeeId) throw new Error("Not this person's asset");
  const name = `${exit.employee.firstName} ${exit.employee.lastName}`.trim();
  await db.asset.update({
    where: { id: assetId },
    data:
      outcome === "RETURNED"
        ? { status: "AVAILABLE", employeeId: null, assignedAt: null }
        : {
            status: "RETIRED",
            employeeId: null,
            assignedAt: null,
            notes: [asset.notes, `Not returned by ${name} on leaving.`].filter(Boolean).join("\n"),
          },
  });
  if ((await db.asset.count({ where: { employeeId: exit.employeeId, status: "ASSIGNED" } })) === 0)
    await tickTask(exitId, "Return laptop, phone, kits and ID card", user.id);
  revalidatePath("/hr/assets");
  refresh(exit.id, exit.employeeId);
}

// ─── Handover ──────────────────────────────────────────────────────────────

/**
 * Moves the leaving person's open work to someone else in one go: tasks, projects, CRM records,
 * follow-ups, helpdesk requests, upcoming sessions, programmes, workshops, reviews and direct reports.
 */
export async function handOver(exitId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const exit = await runnable(user, exitId);
  if (exit.stage === "WITHDRAWN") return { error: "This exit was withdrawn." };
  const toId = String(formData.get("toUserId") ?? "");
  const to = await db.user.findUnique({ where: { id: toId }, include: { employee: { select: { id: true } } } });
  if (!to || !to.active) return { error: "Choose who takes the work over." };
  const from = exit.employee.userId;
  if (from && to.id === from) return { error: "Choose someone other than the person leaving." };
  if (!isAdmin(user) && !(to.employee && (await canManage(user, to.employee.id))) && to.id !== user.id)
    return { error: "Managers can hand work to themselves or their own team." };
  const today = todayIST();
  const ops = [];
  if (from) {
    ops.push(
      db.projectTask.updateMany({ where: { assigneeId: from, status: { not: "DONE" }, project: { stage: { not: "COMPLETE" } } }, data: { assigneeId: to.id } }),
      db.project.updateMany({ where: { ownerId: from, stage: { in: [...OPEN_PROJECT_STAGES] } }, data: { ownerId: to.id } }),
      db.lead.updateMany({ where: { ownerId: from, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } }, data: { ownerId: to.id } }),
      db.deal.updateMany({ where: { ownerId: from, stage: { in: ["PROSPECT", "DEMO", "PROPOSAL", "NEGOTIATION"] } }, data: { ownerId: to.id } }),
      db.organization.updateMany({ where: { ownerId: from }, data: { ownerId: to.id } }),
      db.contact.updateMany({ where: { ownerId: from }, data: { ownerId: to.id } }),
      db.activity.updateMany({ where: { assigneeId: from, done: false }, data: { assigneeId: to.id } }),
      db.helpdeskTicket.updateMany({ where: { assigneeId: from, status: { in: ["OPEN", "IN_PROGRESS"] } }, data: { assigneeId: to.id } }),
      db.programmeSession.updateMany({ where: { trainerId: from, status: "SCHEDULED", date: { gte: today } }, data: { trainerId: to.id } }),
      db.programme.updateMany({ where: { coordinatorId: from, status: { not: "COMPLETED" } }, data: { coordinatorId: to.id } }),
      db.workshop.updateMany({ where: { coordinatorId: from, status: "UPCOMING" }, data: { coordinatorId: to.id } }),
      db.performanceReview.updateMany({
        where: { reviewerId: from, managerSubmittedAt: null, cycle: { stage: { not: "CLOSED" } } },
        data: { reviewerId: to.id },
      }),
    );
  }
  // Direct reports move only to someone with an employee record (a manager is an employee).
  if (to.employee)
    ops.push(db.employee.updateMany({ where: { managerId: exit.employeeId, status: { not: "EXITED" }, id: { not: to.employee.id } }, data: { managerId: to.employee.id } }));
  const results = await db.$transaction(ops);
  const moved = results.reduce((s, r) => s + r.count, 0);
  await tickTask(exitId, "Hand over school programmes and upcoming sessions", user.id);
  revalidatePath("/", "layout");
  refresh(exit.id, exit.employeeId);
  return moved ? { ok: `${moved} item${moved === 1 ? "" : "s"} handed over to ${to.name}.` } : { ok: "Nothing was left to hand over." };
}

// ─── Exit interview ────────────────────────────────────────────────────────

export async function saveInterview(exitId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const found = await exitFor(user, exitId);
  if (!found || !(found.isSelf || found.admin)) return { error: "Only the person leaving or an admin can fill this in." };
  if (found.exit.stage === "WITHDRAWN") return { error: "This exit was withdrawn." };
  const parsed = z
    .object({
      interviewReason: z.enum(EXIT_REASONS, { message: "Pick the main reason." }),
      interviewRating: z.coerce.number().int().min(1).max(5).optional(),
      interviewRecommend: z.enum(["yes", "no"]).optional(),
      interviewLiked: text(3000),
      interviewImprove: text(3000),
    })
    .safeParse({
      interviewReason: formData.get("interviewReason") ?? undefined,
      interviewRating: formData.get("interviewRating") || undefined,
      interviewRecommend: formData.get("interviewRecommend") || undefined,
      interviewLiked: formData.get("interviewLiked") ?? "",
      interviewImprove: formData.get("interviewImprove") ?? "",
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  await db.employeeExit.update({
    where: { id: exitId },
    data: {
      interviewReason: d.interviewReason,
      interviewRating: d.interviewRating ?? null,
      interviewRecommend: d.interviewRecommend ? d.interviewRecommend === "yes" : null,
      interviewLiked: d.interviewLiked,
      interviewImprove: d.interviewImprove,
      interviewAt: new Date(),
    },
  });
  await tickTask(exitId, "Exit interview", user.id);
  refresh(exitId, found.exit.employeeId);
  return { ok: "Thank you. Saved." };
}

// ─── Final settlement ──────────────────────────────────────────────────────

const days = z.coerce.number().min(0, "Days can't be negative.").max(365).multipleOf(0.5, "Days go in half days.");
const money = z.coerce.number().min(0, "Amounts can't be negative.").max(10_000_000);

/** Save the settlement; "agree" also puts it on the payslip for the month of the last working day. */
export async function saveSettlement(exitId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const exit = await runnable(user, exitId);
  if (exit.stage === "WITHDRAWN" || exit.stage === "REQUESTED") return { error: "Accept the resignation first." };
  const parsed = z
    .object({
      encashDays: days,
      noticePayDays: days,
      recoveryDays: days,
      gratuity: money,
      recoveries: money,
      recoveriesNote: text(300),
      settlementNote: text(1000),
    })
    .safeParse({
      encashDays: formData.get("encashDays") || 0,
      noticePayDays: formData.get("noticePayDays") || 0,
      recoveryDays: formData.get("recoveryDays") || 0,
      gratuity: formData.get("gratuity") || 0,
      recoveries: formData.get("recoveries") || 0,
      recoveriesNote: formData.get("recoveriesNote") ?? "",
      settlementNote: formData.get("settlementNote") ?? "",
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.recoveries > 0 && !parsed.data.recoveriesNote) return { error: "Say what the recovery is for, e.g. laptop not returned." };
  const agree = formData.get("intent") === "agree";
  await db.employeeExit.update({
    where: { id: exitId },
    data: { ...parsed.data, ...(agree ? { settlementAgreedAt: new Date() } : {}) },
  });
  revalidatePath("/payroll", "layout");
  refresh(exit.id, exit.employeeId);
  return {
    ok: agree
      ? "Settlement agreed. It goes on the payslip for the month of the last working day."
      : exit.settlementAgreedAt
        ? "Saved. Recalculate that month's payroll if it was already drafted."
        : "Saved as a draft.",
  };
}

/** Take the settlement off the payroll again to change it. */
export async function reopenSettlement(exitId: string) {
  const user = await requireUser(["ADMIN"]);
  const exit = await runnable(user, exitId);
  if (exit.lastWorkingDay) {
    const run = await db.payrollRun.findUnique({ where: { month: exit.lastWorkingDay.toISOString().slice(0, 7) }, select: { status: true } });
    if (run?.status === "PAID") throw new Error("That month's payroll is already paid");
  }
  await db.employeeExit.update({ where: { id: exitId }, data: { settlementAgreedAt: null } });
  revalidatePath("/payroll", "layout");
  refresh(exit.id, exit.employeeId);
}
