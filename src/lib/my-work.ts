import "server-only";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { canEditProject } from "./projects";
import { afterStatusChange } from "./task-updates";
import { notify } from "./notifications";
import { daysFromNow, todayIST } from "./time";
import type { Outcome } from "./leave-requests";

/**
 * My work: the tasks assigned to you, grouped by when they are due, and changing a task's status. The web page
 * (src/app/(app)/work) and the phone app (src/app/api/mobile/work) both use these.
 */

const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export async function myWork(user: CurrentUser) {
  const today = todayIST();
  const weekAhead = new Date(today.getTime() + 7 * 86400000);

  const [open, recentlyDone] = await Promise.all([
    db.projectTask.findMany({
      where: { assigneeId: user.id, status: { not: "DONE" }, project: { stage: { not: "COMPLETE" } } },
      include: {
        project: { select: { id: true, name: true, onHold: true } },
        dependsOn: { select: { title: true, status: true } },
        checklist: { select: { doneAt: true } },
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    db.projectTask.findMany({
      where: { assigneeId: user.id, status: "DONE", completedAt: { gte: daysFromNow(-7) } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { completedAt: "desc" },
    }),
  ]);
  open.sort((a, b) => {
    const da = a.dueDate?.getTime() ?? Infinity;
    const dbb = b.dueDate?.getTime() ?? Infinity;
    return da - dbb || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });

  const groups = [
    { title: "Update requested", tasks: open.filter((t) => t.updateRequestedAt) },
    ...[
      { title: "Overdue", tasks: open.filter((t) => t.dueDate && t.dueDate < today) },
      { title: "Due today", tasks: open.filter((t) => t.dueDate && t.dueDate.getTime() === today.getTime()) },
      { title: "This week", tasks: open.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= weekAhead) },
      { title: "Later or no date", tasks: open.filter((t) => !t.dueDate || t.dueDate > weekAhead) },
      // A task with an open request is listed once, under "Update requested".
    ].map((g) => ({ ...g, tasks: g.tasks.filter((t) => !t.updateRequestedAt) })),
  ];
  return { open, recentlyDone, groups };
}

/** Moves a task to another status: its assignee or someone who can edit the project. */
export async function setTaskStatusFor(user: CurrentUser, id: string, status: TaskStatus): Promise<Outcome & { projectId?: string }> {
  const task = await db.projectTask.findUnique({ where: { id }, include: { project: true } });
  if (!task) return { error: "That task no longer exists." };
  if (task.assigneeId !== user.id && !canEditProject(user, task.project)) return { error: "You can't change this task." };
  if (status === task.status) return { ok: "No change.", projectId: task.projectId };
  await db.$transaction(async (tx) => {
    await tx.projectTask.update({
      where: { id },
      data: {
        status,
        completedAt: status === "DONE" ? (task.completedAt ?? new Date()) : null,
        ...(status === "DONE" ? { progress: 100, blockedReason: null, blockedAt: null } : {}),
      },
    });
    if (status === "REVIEW")
      await notify([task.project.ownerId], user.id, {
        kind: "task.review",
        title: `${task.title} is ready for review`,
        href: `/projects/${task.projectId}/tasks/${id}`,
      }, tx);
    await afterStatusChange(tx, task, status, user.id);
  });
  return { ok: status === "DONE" ? "Task done." : "Task updated.", projectId: task.projectId };
}
