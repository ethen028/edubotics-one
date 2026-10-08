"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { canManage } from "@/lib/team";
import { parseDateOnly } from "@/lib/leave";
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, TASK_CATEGORIES, checklistRows, sniffMime } from "@/lib/hr-constants";
import type { FormState } from "@/components/action-form";
import { logActivity } from "@/lib/activity";

function refresh(employeeId: string) {
  revalidatePath(`/hr/employees/${employeeId}`);
  revalidatePath("/hr/onboarding");
  revalidatePath("/");
}

async function requireManager(employeeId: string) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  if (!(await canManage(user, employeeId))) throw new Error("Not allowed");
  return user;
}

// ─── Tasks ─────────────────────────────────────────────────────────────────

/** Adds the standard joining checklist, skipping tasks the employee already has. */
export async function applyChecklist(employeeId: string) {
  await requireManager(employeeId);
  const employee = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { onboardingTasks: true } });
  const existing = new Set(employee.onboardingTasks.map((t) => t.title));
  await db.onboardingTask.createMany({ data: checklistRows(employeeId, employee.dateOfJoining, existing) });
  refresh(employeeId);
}

const taskSchema = z.object({
  title: z.string().trim().min(2, "Enter a task"),
  category: z.enum(TASK_CATEGORIES),
  dueDate: z
    .string()
    .trim()
    .transform((v) => (v ? parseDateOnly(v) : null)),
});

export async function addTask(employeeId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireManager(employeeId);
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.onboardingTask.create({ data: { employeeId, ...parsed.data } });
  refresh(employeeId);
  return { ok: "Task added." };
}

export async function setTaskStatus(taskId: string, formData: FormData) {
  const user = await requireUser();
  const task = await db.onboardingTask.findUniqueOrThrow({ where: { id: taskId } });
  const status = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "NOT_APPLICABLE"]).parse(formData.get("status"));
  // Employees may tick off their own tasks; managers and admins handle the rest.
  const own = user.employee?.id === task.employeeId && status !== "NOT_APPLICABLE";
  if (!own && !(await canManage(user, task.employeeId))) throw new Error("Not allowed");
  await db.onboardingTask.update({ where: { id: taskId }, data: { status } });
  refresh(task.employeeId);
}

export async function deleteTask(taskId: string) {
  const task = await db.onboardingTask.findUniqueOrThrow({ where: { id: taskId } });
  await requireManager(task.employeeId);
  await db.onboardingTask.delete({ where: { id: taskId } });
  refresh(task.employeeId);
}

// ─── Documents ─────────────────────────────────────────────────────────────

/** The employee or an admin uploads a document. Managers can't see ID or bank documents. */
export async function uploadDocument(employeeId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isAdmin(user) && user.employee?.id !== employeeId) return { error: "You can only upload your own documents." };
  const type = z.enum(DOCUMENT_TYPES).safeParse(formData.get("type"));
  if (!type.success) return { error: "Choose a document type." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  if (file.size > MAX_DOCUMENT_BYTES) return { error: "Files can be up to 5 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffMime(bytes);
  if (!mimeType) return { error: "Upload a PDF, JPG, PNG or WebP file." };
  await db.employeeDocument.create({
    data: {
      employeeId,
      type: type.data,
      fileName: file.name.slice(0, 200) || "document",
      mimeType,
      size: file.size,
      data: bytes,
      // An admin uploading on someone's behalf has already checked it.
      status: isAdmin(user) && user.employee?.id !== employeeId ? "VERIFIED" : "PENDING",
      uploadedById: user.id,
      ...(isAdmin(user) && user.employee?.id !== employeeId ? { reviewedById: user.id, reviewedAt: new Date() } : {}),
    },
  });
  refresh(employeeId);
  return { ok: "Uploaded." };
}

export async function reviewDocument(documentId: string, formData: FormData) {
  const user = await requireUser(["ADMIN"]);
  const doc = await db.employeeDocument.findUniqueOrThrow({ where: { id: documentId }, select: { employeeId: true } });
  if (doc.employeeId === user.employee?.id) throw new Error("Someone else needs to verify your documents");
  const status = z.enum(["VERIFIED", "REJECTED", "UNDER_REVIEW"]).parse(formData.get("status"));
  const note = String(formData.get("note") ?? "").trim() || null;
  await db.employeeDocument.update({
    where: { id: documentId },
    data: { status, reviewNote: note, reviewedById: user.id, reviewedAt: new Date() },
  });
  refresh(doc.employeeId);
}

export async function deleteDocument(documentId: string) {
  const user = await requireUser();
  const doc = await db.employeeDocument.findUniqueOrThrow({
    where: { id: documentId },
    select: { employeeId: true, status: true, fileName: true, employee: { select: { firstName: true, lastName: true } } },
  });
  const ownUnverified = user.employee?.id === doc.employeeId && doc.status !== "VERIFIED";
  if (!isAdmin(user) && !ownUnverified) throw new Error("Not allowed");
  await db.employeeDocument.delete({ where: { id: documentId } });
  await logActivity(user, "DELETED", "document.deleted", `Deleted document ${doc.fileName} from ${doc.employee.firstName} ${doc.employee.lastName}'s profile`);
  refresh(doc.employeeId);
}
