"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { parseDateOnly } from "@/lib/leave";
import { PROJECT_STAGES, canApproveProject, canEditProject, canUpdateTask, projectScope } from "@/lib/projects";
import { readFiles } from "@/lib/project-files";
import { nextTaskState, recordTaskUpdate } from "@/lib/task-updates";
import type { FormState } from "@/components/action-form";
import { logActivity } from "@/lib/activity";

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

function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  return `${issue.path.join(".") || "Form"}: ${issue.message}`;
}

function refresh(projectId?: string) {
  revalidatePath("/projects", "layout");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/work");
  revalidatePath("/approvals");
  revalidatePath("/");
}

async function editableProject(user: CurrentUser, id: string) {
  const project = await db.project.findUnique({ where: { id } });
  if (!project) throw new Error("Project not found");
  if (!canEditProject(user, project)) throw new Error("Only the project owner or an admin can change this project");
  return project;
}

// ─── Projects ──────────────────────────────────────────────────────────────

const projectSchema = z.object({
  name: z.string().trim().min(1, "required"),
  kind: z.enum(["SCHOOL_PROGRAMME", "COLLEGE_WORKSHOP", "STUDENT_PROJECT", "TEACHER_TRAINING", "CLIENT_PROJECT", "INTERNAL"]),
  description: optional,
  ownerId: z.string().min(1, "required"),
  departmentId: optional,
  organizationId: optional,
  dealId: optional,
  startDate: optionalDate,
  dueDate: optionalDate,
});

export async function createProject(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN", "MANAGER"]);
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const data = parsed.data;
  if (data.startDate && data.dueDate && data.dueDate < data.startDate) return { error: "Due date is before the start date." };

  const project = await db.project.create({
    data: {
      ...data,
      // A project with an owner, a brief and dates has done "Create"; next is building the team.
      stage: "ASSIGN",
      members: { create: { userId: data.ownerId, role: "Project owner" } },
    },
  });
  refresh();
  redirect(`/projects/${project.id}`);
}

export async function updateProject(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  await editableProject(user, id);
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (parsed.data.startDate && parsed.data.dueDate && parsed.data.dueDate < parsed.data.startDate)
    return { error: "Due date is before the start date." };
  await db.$transaction([
    db.project.update({ where: { id }, data: parsed.data }),
    db.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId: parsed.data.ownerId } },
      create: { projectId: id, userId: parsed.data.ownerId, role: "Project owner" },
      update: {},
    }),
  ]);
  refresh(id);
  return { ok: "Saved." };
}

export async function deleteProject(id: string) {
  const admin = await requireUser(["ADMIN"]);
  const project = await db.project.delete({ where: { id } });
  await logActivity(admin, "DELETED", "project.deleted", `Deleted project ${project.name}`);
  refresh();
  redirect("/projects");
}

export async function toggleHold(id: string) {
  const user = await requireUser();
  const project = await editableProject(user, id);
  await db.project.update({ where: { id }, data: { onHold: !project.onHold } });
  refresh(id);
}

/** Move one step along the flow. Approval is a gate: only an approver moves a project past it. */
export async function moveStage(id: string, formData: FormData) {
  const user = await requireUser();
  const project = await editableProject(user, id);
  const direction = z.enum(["next", "back"]).parse(formData.get("direction"));
  const i = PROJECT_STAGES.indexOf(project.stage);
  const target = PROJECT_STAGES[direction === "next" ? i + 1 : i - 1];
  if (!target) return;
  if (project.stage === "APPROVAL" && direction === "next") throw new Error("Waiting for approval");
  if (target === "APPROVAL" && direction === "back") throw new Error("Can't move back into approval");

  await db.project.update({
    where: { id },
    data: {
      stage: target,
      completedAt: target === "COMPLETE" ? new Date() : null,
      // Asking for approval clears the previous decision.
      ...(target === "APPROVAL" ? { approvalNote: null, decidedAt: null, decidedById: null } : {}),
    },
  });
  refresh(id);
}

export async function decideProject(id: string, formData: FormData) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.stage !== "APPROVAL") return;
  if (!(await canApproveProject(user, project))) throw new Error("Not allowed");
  const decision = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim() || null;
  await db.project.update({
    where: { id },
    data: {
      stage: decision === "APPROVED" ? "HANDOVER" : "REVIEW",
      approvalNote: note,
      decidedById: user.id,
      decidedAt: new Date(),
    },
  });
  refresh(id);
}

// ─── Team ──────────────────────────────────────────────────────────────────

export async function addMember(projectId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  await editableProject(user, projectId);
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "").trim() || null;
  if (!userId) return { error: "Pick a person." };
  await db.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, role },
    update: { role },
  });
  refresh(projectId);
  return { ok: "Added." };
}

export async function removeMember(memberId: string) {
  const user = await requireUser();
  const member = await db.projectMember.findUnique({ where: { id: memberId }, include: { project: true } });
  if (!member) return;
  await editableProject(user, member.projectId);
  if (member.userId === member.project.ownerId) throw new Error("Change the owner before removing them");
  await db.projectMember.delete({ where: { id: memberId } });
  refresh(member.projectId);
}

// ─── Milestones ────────────────────────────────────────────────────────────

export async function addMilestone(projectId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  await editableProject(user, projectId);
  const parsed = z
    .object({ title: z.string().trim().min(1, "required"), dueDate: optionalDate })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  await db.milestone.create({ data: { projectId, ...parsed.data } });
  refresh(projectId);
  return { ok: "Milestone added." };
}

export async function toggleMilestone(id: string) {
  const user = await requireUser();
  const m = await db.milestone.findUnique({ where: { id } });
  if (!m) return;
  await editableProject(user, m.projectId);
  await db.milestone.update({ where: { id }, data: { doneAt: m.doneAt ? null : new Date() } });
  refresh(m.projectId);
}

export async function deleteMilestone(id: string) {
  const user = await requireUser();
  const m = await db.milestone.findUnique({ where: { id } });
  if (!m) return;
  await editableProject(user, m.projectId);
  await db.milestone.delete({ where: { id } });
  refresh(m.projectId);
}

// ─── Tasks ─────────────────────────────────────────────────────────────────

const taskSchema = z.object({
  title: z.string().trim().min(1, "required"),
  description: optional,
  assigneeId: optional,
  milestoneId: optional,
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  dueDate: optionalDate,
});

export async function addTask(projectId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  await editableProject(user, projectId);
  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const data = parsed.data;
  await db.$transaction(async (tx) => {
    await tx.projectTask.create({ data: { ...data, projectId, createdById: user.id } });
    // Whoever gets a task is on the team.
    if (data.assigneeId) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId, userId: data.assigneeId } },
        create: { projectId, userId: data.assigneeId },
        update: {},
      });
    }
  });
  refresh(projectId);
  return { ok: "Task added." };
}

/** The assignee, the project owner or an admin can move a task along. */
export async function setTaskStatus(id: string, formData: FormData) {
  const user = await requireUser();
  const task = await db.projectTask.findUnique({ where: { id }, include: { project: true } });
  if (!task) return;
  if (task.assigneeId !== user.id && !canEditProject(user, task.project)) throw new Error("Not allowed");
  const status = z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]).parse(formData.get("status"));
  await db.projectTask.update({
    where: { id },
    data: {
      status,
      completedAt: status === "DONE" ? (task.completedAt ?? new Date()) : null,
      ...(status === "DONE" ? { progress: 100 } : {}),
    },
  });
  refresh(task.projectId);
}

export async function deleteTask(id: string) {
  const user = await requireUser();
  const task = await db.projectTask.findUnique({ where: { id }, include: { project: true } });
  if (!task) return;
  if (!canEditProject(user, task.project)) throw new Error("Not allowed");
  await db.projectTask.delete({ where: { id } });
  refresh(task.projectId);
}


// ─── Progress updates and files (from Task Flow) ───────────────────────────

const updateSchema = z.object({
  note: optional,
  progress: z.coerce.number().int().min(0).max(100).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]).optional().or(z.literal("").transform(() => undefined)),
});

/**
 * Report progress on a task: a note, the new percentage, files, or any mix. Reaching 100% marks the task done
 * and starting it moves it to In progress. Posting clears an open update request.
 */
export async function postTaskUpdate(taskId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const task = await db.projectTask.findUnique({ where: { id: taskId }, include: { project: true } });
  if (!task) return { error: "Task not found." };
  if (!canUpdateTask(user, task, task.project)) return { error: "Only the assignee or the project owner can update this task." };
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const read = await readFiles(formData);
  if ("error" in read) return { error: read.error };

  const input = { note: parsed.data.note ?? null, progress: parsed.data.progress, status: parsed.data.status, files: read.files };
  const next = nextTaskState(task, input);
  if (!input.note && !next.progressChanged && !next.statusChanged && read.files.length === 0)
    return { error: "Write a note, change the progress or attach a file." };

  await db.$transaction((tx) => recordTaskUpdate(tx, task, user.id, input));
  refresh(task.projectId);
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
  return { ok: "Update posted." };
}

/** Anyone on the project posts a general update or shares files. */
export async function postProjectUpdate(projectId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await db.project.findFirst({ where: { id: projectId, ...projectScope(user) } });
  if (!project) return { error: "Project not found." };
  const note = String(formData.get("note") ?? "").trim() || null;
  const read = await readFiles(formData);
  if ("error" in read) return { error: read.error };
  if (!note && read.files.length === 0) return { error: "Write a note or attach a file." };
  await db.$transaction(async (tx) => {
    const update = await tx.projectUpdate.create({ data: { projectId, authorId: user.id, note } });
    for (const f of read.files) {
      await tx.projectFile.create({ data: { ...f, projectId, updateId: update.id, uploadedById: user.id } });
    }
  });
  refresh(projectId);
  return { ok: "Posted." };
}

/** The owner or an admin asks the assignee for an update. It shows on their My work and Home until they post one. */
export async function requestTaskUpdate(taskId: string, formData: FormData) {
  const user = await requireUser();
  const task = await db.projectTask.findUnique({ where: { id: taskId }, include: { project: true } });
  if (!task) return;
  if (!canEditProject(user, task.project)) throw new Error("Only the project owner or an admin can ask for an update");
  if (!task.assigneeId || task.status === "DONE" || task.assigneeId === user.id) return;
  const note = String(formData.get("note") ?? "").trim() || null;
  await db.$transaction([
    db.projectTask.update({ where: { id: taskId }, data: { updateRequestedAt: new Date() } }),
    db.projectUpdate.create({ data: { projectId: task.projectId, taskId, authorId: user.id, note, isRequest: true } }),
  ]);
  refresh(task.projectId);
  revalidatePath(`/projects/${task.projectId}/tasks/${taskId}`);
}

export async function deleteProjectFile(id: string) {
  const user = await requireUser();
  const file = await db.projectFile.findUnique({ where: { id }, include: { project: true } });
  if (!file) return;
  if (file.uploadedById !== user.id && !canEditProject(user, file.project)) throw new Error("Not allowed");
  await db.projectFile.delete({ where: { id } });
  refresh(file.projectId);
  if (file.taskId) revalidatePath(`/projects/${file.projectId}/tasks/${file.taskId}`);
}
