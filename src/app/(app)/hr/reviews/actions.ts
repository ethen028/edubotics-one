"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { defaultReviewer, reviewFor } from "@/lib/reviews";
import type { FormState } from "@/components/action-form";

function refresh(reviewId?: string, cycleId?: string, employeeId?: string) {
  revalidatePath("/hr/reviews");
  revalidatePath("/");
  if (reviewId) revalidatePath(`/hr/reviews/${reviewId}`);
  if (cycleId) revalidatePath(`/hr/reviews/cycles/${cycleId}`);
  if (employeeId) revalidatePath(`/hr/employees/${employeeId}`);
}

const text = z
  .string()
  .trim()
  .max(4000, "Keep it under 4000 characters")
  .transform((v) => v || null);
const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v ? new Date(v) : null));

// ─── Cycles (admins) ──────────────────────────────────────────────────────

const cycleSchema = z
  .object({
    name: z.string().trim().min(3, "Give the cycle a name"),
    kind: z.enum(["ANNUAL", "HALF_YEARLY"]),
    periodStart: z.string().min(1, "Pick the start of the period").transform((v) => new Date(v)),
    periodEnd: z.string().min(1, "Pick the end of the period").transform((v) => new Date(v)),
    goalsDue: optionalDate,
    selfDue: optionalDate,
    managerDue: optionalDate,
  })
  .refine((c) => c.periodEnd > c.periodStart, "The period must end after it starts")
  .refine((c) => !c.selfDue || !c.managerDue || c.managerDue >= c.selfDue, "Manager reviews can't be due before self reviews");

function readCycle(formData: FormData) {
  const parsed = cycleSchema.safeParse(Object.fromEntries(formData));
  return parsed.success ? { data: parsed.data } : { error: parsed.error.issues[0].message };
}

function duplicateName(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function createCycle(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const form = readCycle(formData);
  if ("error" in form) return { error: form.error };
  const employeeIds = [...new Set(formData.getAll("employeeIds").map(String).filter(Boolean))];
  if (employeeIds.length === 0) return { error: "Tick at least one person to review." };
  const reviewers = await Promise.all(employeeIds.map(defaultReviewer));
  let id: string;
  try {
    const cycle = await db.reviewCycle.create({
      data: {
        ...form.data,
        createdById: user.id,
        reviews: { create: employeeIds.map((employeeId, i) => ({ employeeId, reviewerId: reviewers[i] })) },
      },
    });
    id = cycle.id;
  } catch (e) {
    if (duplicateName(e)) return { error: "A review cycle with that name already exists." };
    throw e;
  }
  refresh();
  redirect(`/hr/reviews/cycles/${id}`);
}

export async function updateCycle(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const form = readCycle(formData);
  if ("error" in form) return { error: form.error };
  try {
    await db.reviewCycle.update({ where: { id }, data: form.data });
  } catch (e) {
    if (duplicateName(e)) return { error: "A review cycle with that name already exists." };
    throw e;
  }
  refresh(undefined, id);
  return { ok: "Saved." };
}

export async function setCycleStage(id: string, formData: FormData) {
  await requireUser(["ADMIN"]);
  const stage = z.enum(["GOAL_SETTING", "REVIEW", "CLOSED"]).parse(formData.get("stage"));
  await db.reviewCycle.update({ where: { id }, data: { stage, closedAt: stage === "CLOSED" ? new Date() : null } });
  refresh(undefined, id);
}

export async function addToCycle(cycleId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const employeeIds = [...new Set(formData.getAll("employeeIds").map(String).filter(Boolean))];
  if (employeeIds.length === 0) return { error: "Tick at least one person." };
  const reviewers = await Promise.all(employeeIds.map(defaultReviewer));
  await db.performanceReview.createMany({
    data: employeeIds.map((employeeId, i) => ({ cycleId, employeeId, reviewerId: reviewers[i] })),
    skipDuplicates: true,
  });
  refresh(undefined, cycleId);
  return { ok: `Added ${employeeIds.length === 1 ? "1 person" : `${employeeIds.length} people`}.` };
}

/** Takes someone out of a cycle, only while nothing has been reviewed yet. */
export async function removeFromCycle(reviewId: string) {
  await requireUser(["ADMIN"]);
  const r = await db.performanceReview.findUniqueOrThrow({ where: { id: reviewId } });
  if (r.selfSubmittedAt || r.managerSubmittedAt) throw new Error("This review has started; it can't be removed.");
  await db.performanceReview.delete({ where: { id: reviewId } });
  refresh(undefined, r.cycleId, r.employeeId);
}

export async function setReviewer(reviewId: string, formData: FormData) {
  await requireUser(["ADMIN"]);
  const value = String(formData.get("reviewerId") ?? "");
  const r = await db.performanceReview.findUniqueOrThrow({ where: { id: reviewId }, include: { employee: { select: { userId: true } } } });
  if (r.managerSubmittedAt) throw new Error("The manager review is already done.");
  if (value && value === r.employee.userId) throw new Error("Nobody can review themselves.");
  await db.performanceReview.update({ where: { id: reviewId }, data: { reviewerId: value || null } });
  refresh(reviewId, r.cycleId);
}

// ─── One review ───────────────────────────────────────────────────────────

async function load(user: CurrentUser, reviewId: string) {
  const access = await reviewFor(user, reviewId);
  if (!access) throw new Error("Not allowed");
  return access;
}

/** Goals can change until the reviewer agrees them, by the person or their reviewer. */
export async function saveGoals(reviewId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { review, isSelf, reviewer } = await load(user, reviewId);
  if (!isSelf && !reviewer) return { error: "Only the person or their reviewer can change goals." };
  if (review.goalsAgreedAt || review.cycle.stage === "CLOSED") return { error: "The goals are already agreed." };

  const rows: { id?: string; title: string; measure: string | null; weight: number | null }[] = [];
  const remove: string[] = [];
  const keys = [...review.goals.map((g) => g.id), ...[0, 1, 2].map((n) => `new${n}`)];
  for (const key of keys) {
    const title = String(formData.get(`title_${key}`) ?? "").trim();
    const measure = String(formData.get(`measure_${key}`) ?? "").trim() || null;
    const weightRaw = String(formData.get(`weight_${key}`) ?? "").trim();
    const existing = !key.startsWith("new");
    if (existing && (formData.get(`remove_${key}`) || !title)) {
      remove.push(key);
      continue;
    }
    if (!title) continue;
    if (title.length > 300) return { error: "Keep each goal under 300 characters; put detail in 'How it's measured'." };
    const weight = weightRaw ? Number(weightRaw) : null;
    if (weight != null && (!Number.isInteger(weight) || weight < 1 || weight > 100)) return { error: "Weights are whole percentages from 1 to 100." };
    rows.push({ id: existing ? key : undefined, title, measure, weight });
  }
  if (rows.length > 12) return { error: "Keep it to 12 goals or fewer." };

  await db.$transaction([
    db.reviewGoal.deleteMany({ where: { reviewId, id: { in: remove } } }),
    ...rows.map((g, sort) =>
      g.id
        ? db.reviewGoal.update({ where: { id: g.id }, data: { title: g.title, measure: g.measure, weight: g.weight, sort } })
        : db.reviewGoal.create({ data: { reviewId, title: g.title, measure: g.measure, weight: g.weight, sort } }),
    ),
  ]);
  refresh(reviewId);
  return { ok: "Goals saved." };
}

/** Starts the goal list from the person's previous review. */
export async function copyLastGoals(reviewId: string) {
  const user = await requireUser();
  const { review, isSelf, reviewer } = await load(user, reviewId);
  if ((!isSelf && !reviewer) || review.goalsAgreedAt || review.goals.length) throw new Error("Not allowed");
  const last = await db.performanceReview.findFirst({
    where: { employeeId: review.employeeId, id: { not: reviewId }, goals: { some: {} } },
    orderBy: { cycle: { periodEnd: "desc" } },
    include: { goals: { orderBy: { sort: "asc" } } },
  });
  if (!last) return;
  await db.reviewGoal.createMany({
    data: last.goals.map((g, sort) => ({ reviewId, title: g.title, measure: g.measure, weight: g.weight, sort })),
  });
  refresh(reviewId);
}

export async function agreeGoals(reviewId: string): Promise<FormState> {
  const user = await requireUser();
  const { review, reviewer } = await load(user, reviewId);
  if (!reviewer) return { error: "Only the reviewer can agree the goals." };
  if (review.cycle.stage === "CLOSED") return { error: "This cycle is closed." };
  if (review.goals.length === 0) return { error: "Add at least one goal first." };
  const weights = review.goals.map((g) => g.weight);
  if (weights.some((w) => w != null)) {
    if (weights.some((w) => w == null)) return { error: "Give every goal a weight, or clear them all to weigh goals equally." };
    const total = weights.reduce((s: number, w) => s + w!, 0);
    if (total !== 100) return { error: `Weights add up to ${total}%; they need to add up to 100%.` };
  }
  await db.performanceReview.update({ where: { id: reviewId }, data: { goalsAgreedAt: new Date() } });
  refresh(reviewId, review.cycleId);
  return { ok: "Goals agreed." };
}

export async function reopenGoals(reviewId: string) {
  const user = await requireUser();
  const { review, reviewer } = await load(user, reviewId);
  if (!reviewer || review.selfSubmittedAt || review.managerSubmittedAt || review.cycle.stage === "CLOSED") throw new Error("Not allowed");
  await db.performanceReview.update({ where: { id: reviewId }, data: { goalsAgreedAt: null } });
  refresh(reviewId, review.cycleId);
}

function rating(formData: FormData, name: string) {
  const v = Number(formData.get(name));
  return Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
}

export async function saveSelfReview(reviewId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { review, isSelf } = await load(user, reviewId);
  if (!isSelf) return { error: "Only the person being reviewed fills in the self review." };
  if (review.cycle.stage !== "REVIEW") return { error: "Self reviews aren't open." };
  if (!review.goalsAgreedAt) return { error: "Your goals need to be agreed first." };
  if (review.selfSubmittedAt || review.managerSubmittedAt) return { error: "Your self review is already in." };
  const submit = formData.get("intent") === "submit";
  const goals = review.goals.map((g) => ({
    id: g.id,
    selfRating: rating(formData, `rating_${g.id}`),
    selfComment: text.safeParse(String(formData.get(`comment_${g.id}`) ?? "")).data ?? null,
  }));
  const overall = z.object({ selfAchievements: text, selfImprove: text }).safeParse({
    selfAchievements: String(formData.get("selfAchievements") ?? ""),
    selfImprove: String(formData.get("selfImprove") ?? ""),
  });
  if (!overall.success) return { error: overall.error.issues[0].message };
  if (submit && goals.some((g) => g.selfRating == null)) return { error: "Rate every goal before sending, or save as a draft." };
  await db.$transaction([
    ...goals.map((g) => db.reviewGoal.update({ where: { id: g.id }, data: { selfRating: g.selfRating, selfComment: g.selfComment } })),
    db.performanceReview.update({
      where: { id: reviewId },
      data: { ...overall.data, selfSubmittedAt: submit ? new Date() : null },
    }),
  ]);
  refresh(reviewId, review.cycleId);
  return { ok: submit ? "Sent to your reviewer." : "Draft saved. Only you can see it until you send it." };
}

export async function saveManagerReview(reviewId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { review, reviewer } = await load(user, reviewId);
  if (!reviewer) return { error: "Only the reviewer can do this." };
  if (review.cycle.stage !== "REVIEW") return { error: "Reviews aren't open." };
  if (!review.goalsAgreedAt) return { error: "Agree the goals first." };
  if (review.managerSubmittedAt) return { error: "This review has already been shared." };
  const submit = formData.get("intent") === "submit";
  const goals = review.goals.map((g) => ({
    id: g.id,
    managerRating: rating(formData, `rating_${g.id}`),
    managerComment: text.safeParse(String(formData.get(`comment_${g.id}`) ?? "")).data ?? null,
  }));
  const overall = z.object({ managerStrengths: text, managerImprove: text, managerComment: text }).safeParse({
    managerStrengths: String(formData.get("managerStrengths") ?? ""),
    managerImprove: String(formData.get("managerImprove") ?? ""),
    managerComment: String(formData.get("managerComment") ?? ""),
  });
  if (!overall.success) return { error: overall.error.issues[0].message };
  const managerRating = rating(formData, "managerRating");
  if (submit && goals.some((g) => g.managerRating == null)) return { error: "Rate every goal before sharing, or save as a draft." };
  if (submit && managerRating == null) return { error: "Pick the overall rating before sharing." };
  const now = new Date();
  await db.$transaction([
    ...goals.map((g) => db.reviewGoal.update({ where: { id: g.id }, data: { managerRating: g.managerRating, managerComment: g.managerComment } })),
    db.performanceReview.update({
      where: { id: reviewId },
      data: {
        ...overall.data,
        managerRating,
        ...(submit ? { managerSubmittedAt: now, managerSubmittedById: user.id } : {}),
      },
    }),
  ]);
  refresh(reviewId, review.cycleId, review.employeeId);
  return {
    ok: submit
      ? `Shared with ${review.employee.firstName}. They'll see it and sign it off.`
      : `Draft saved. ${review.employee.firstName} can't see it until you share it.`,
  };
}

/** Admins can pull a shared review back for changes until the person has signed it off. */
export async function reopenManagerReview(reviewId: string) {
  const user = await requireUser(["ADMIN"]);
  const { review } = await load(user, reviewId);
  if (!review.managerSubmittedAt || review.acknowledgedAt || review.cycle.stage === "CLOSED") throw new Error("Not allowed");
  await db.performanceReview.update({ where: { id: reviewId }, data: { managerSubmittedAt: null, managerSubmittedById: null } });
  refresh(reviewId, review.cycleId, review.employeeId);
}

export async function acknowledgeReview(reviewId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { review, isSelf } = await load(user, reviewId);
  if (!isSelf) return { error: "Only the person reviewed signs it off." };
  if (!review.managerSubmittedAt || review.acknowledgedAt) return { error: "There's nothing to sign off." };
  const comment = text.safeParse(String(formData.get("employeeComment") ?? ""));
  if (!comment.success) return { error: comment.error.issues[0].message };
  await db.performanceReview.update({ where: { id: reviewId }, data: { employeeComment: comment.data, acknowledgedAt: new Date() } });
  refresh(reviewId, review.cycleId, review.employeeId);
  return { ok: "Signed off. Thank you." };
}
