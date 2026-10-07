import "server-only";
import type { Prisma, ProjectStage } from "@prisma/client";
import { db } from "./db";
import { isAdmin, type CurrentUser } from "./auth";

export const PROJECT_STAGES = [
  "CREATE",
  "ASSIGN",
  "PLAN",
  "EXECUTE",
  "REVIEW",
  "APPROVAL",
  "HANDOVER",
  "COMPLETE",
] as const satisfies readonly ProjectStage[];

export const OPEN_PROJECT_STAGES = PROJECT_STAGES.filter((s) => s !== "COMPLETE");

/**
 * Which projects a user can see, following the Floot prototype's access scopes:
 * admins (management) see ALL; managers see their TEAM's (projects they own or
 * are on, plus any their direct reports are on); employees see ASSIGNED ones.
 */
export function projectScope(user: CurrentUser): Prisma.ProjectWhereInput {
  if (isAdmin(user)) return {};
  const mine: Prisma.ProjectWhereInput[] = [
    { ownerId: user.id },
    { members: { some: { userId: user.id } } },
    { tasks: { some: { assigneeId: user.id } } },
  ];
  if (user.role === "MANAGER" && user.employee) {
    mine.push({ members: { some: { user: { employee: { managerId: user.employee.id } } } } });
  }
  return { OR: mine };
}

export function scopeLabel(user: CurrentUser) {
  if (isAdmin(user)) return "All projects";
  if (user.role === "MANAGER") return "Your projects and your team's";
  return "Projects you are on";
}

/** Owner or admin: edit the project, its team, milestones and tasks, and move stages. */
export function canEditProject(user: CurrentUser, project: { ownerId: string }) {
  return isAdmin(user) || project.ownerId === user.id;
}

/** Who approves a project in the Approval stage: any admin, or the owner's reporting manager. */
export async function canApproveProject(user: CurrentUser, project: { ownerId: string }) {
  if (project.ownerId === user.id) return false;
  if (isAdmin(user)) return true;
  if (user.role !== "MANAGER" || !user.employee) return false;
  const owner = await db.employee.findUnique({ where: { userId: project.ownerId }, select: { managerId: true } });
  return owner?.managerId === user.employee.id;
}

/** Average of the tasks' own progress (a done task counts as 100%), as in Task Flow. */
export function progress(tasks: { status: string; progress: number }[]) {
  if (tasks.length === 0) return 0;
  return Math.round(tasks.reduce((s, t) => s + (t.status === "DONE" ? 100 : t.progress), 0) / tasks.length);
}

/** The assignee, the project owner or an admin can report progress on a task. */
export function canUpdateTask(user: CurrentUser, task: { assigneeId: string | null }, project: { ownerId: string }) {
  return task.assigneeId === user.id || canEditProject(user, project);
}

/** Task status for the overview chart and lists: an open task past its due date shows as overdue. */
export type TaskHealth = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE" | "OVERDUE";
export function taskHealth(task: { status: string; dueDate: Date | null }, today: Date): TaskHealth {
  if (task.status !== "DONE" && task.dueDate && task.dueDate < today) return "OVERDUE";
  return task.status as TaskHealth;
}

export const stageInfo: Record<ProjectStage, { title: string; hint: string }> = {
  CREATE: { title: "Define the project clearly", hint: "Objective, institution, dates and owner." },
  ASSIGN: { title: "Put the right team in place", hint: "Add the people working on it and their roles." },
  PLAN: { title: "Build a delivery plan", hint: "Add milestones and tasks with due dates." },
  EXECUTE: { title: "Turn the plan into work", hint: "Track tasks and blockers until the work is done." },
  REVIEW: { title: "Check the work", hint: "Review deliverables and documentation before approval." },
  APPROVAL: { title: "Get the decision recorded", hint: "An admin or the owner's manager approves or sends it back." },
  HANDOVER: { title: "Package everything for delivery", hint: "Final files, kits, certificates and knowledge transfer." },
  COMPLETE: { title: "Closed with a clean record", hint: "Delivered and archived." },
};

export const kindLabel: Record<string, string> = {
  SCHOOL_PROGRAMME: "School programme",
  COLLEGE_WORKSHOP: "College workshop",
  STUDENT_PROJECT: "Final-year project",
  TEACHER_TRAINING: "Teacher training",
  CLIENT_PROJECT: "Client project",
  INTERNAL: "Internal",
};
