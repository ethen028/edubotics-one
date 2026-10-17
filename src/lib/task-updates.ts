import "server-only";
import type { Prisma, ProjectTask, WorkStatus } from "@prisma/client";
import type { IncomingFile } from "./project-files";
import { notify } from "./notifications";

/**
 * Works out a task's new progress and status the way Task Flow did: reaching 100% marks it done, starting it moves it
 * to In progress, and picking Done sets 100%. `status` undefined means "follow the percentage".
 */
export function nextTaskState(task: Pick<ProjectTask, "progress" | "status">, input: { progress?: number; status?: WorkStatus }) {
  let progress = input.progress ?? task.progress;
  let status = input.status ?? task.status;
  if (input.status === "DONE" && task.status !== "DONE") progress = 100;
  else if (input.status === undefined) {
    if (progress === 100) status = "DONE";
    else if (status === "DONE") status = "IN_PROGRESS";
    else if (progress > 0 && status === "TODO") status = "IN_PROGRESS";
  }
  return { progress, status, progressChanged: progress !== task.progress, statusChanged: status !== task.status };
}

/** Records a progress report on a task (with files) and applies the new progress and status. Run inside a transaction. */
export async function recordTaskUpdate(
  tx: Prisma.TransactionClient,
  task: ProjectTask,
  authorId: string,
  input: { note: string | null; progress?: number; status?: WorkStatus; files: IncomingFile[] },
) {
  const next = nextTaskState(task, input);
  const update = await tx.projectUpdate.create({
    data: {
      projectId: task.projectId,
      taskId: task.id,
      authorId,
      note: input.note,
      progressFrom: next.progressChanged ? task.progress : null,
      progressTo: next.progressChanged ? next.progress : null,
      statusTo: next.statusChanged ? next.status : null,
    },
  });
  for (const f of input.files) {
    await tx.projectFile.create({
      data: { ...f, projectId: task.projectId, taskId: task.id, updateId: update.id, uploadedById: authorId },
    });
  }
  await tx.projectTask.update({
    where: { id: task.id },
    data: {
      progress: next.progress,
      status: next.status,
      completedAt: next.status === "DONE" ? (task.completedAt ?? new Date()) : null,
      // The assignee answering clears an open request; the owner's own notes don't.
      ...(task.assigneeId === authorId ? { updateRequestedAt: null } : {}),
      ...(next.status === "DONE" ? { blockedReason: null, blockedAt: null } : {}),
    },
  });
  const project = await tx.project.findUniqueOrThrow({ where: { id: task.projectId }, select: { ownerId: true } });
  const href = `/projects/${task.projectId}/tasks/${task.id}`;
  await notify([project.ownerId], authorId, {
    kind: next.statusChanged && next.status === "REVIEW" ? "task.review" : "task.updated",
    title:
      next.statusChanged && next.status === "REVIEW"
        ? `${task.title} is ready for review`
        : next.progressChanged
          ? `${task.title}: ${task.progress}% → ${next.progress}%`
          : `New update on ${task.title}`,
    body: input.note,
    href,
  }, tx);
  if (next.statusChanged) await afterStatusChange(tx, task, next.status, authorId);
  return next;
}

/** When a task is finished, the people waiting on it hear they can start (Task Flow v5's dependencies). */
export async function afterStatusChange(tx: Prisma.TransactionClient, task: Pick<ProjectTask, "id" | "title" | "projectId">, status: WorkStatus, actorId: string) {
  if (status !== "DONE") return;
  const waiting = await tx.projectTask.findMany({
    where: { dependsOnId: task.id, status: { not: "DONE" }, assigneeId: { not: null } },
    select: { id: true, title: true, assigneeId: true },
  });
  for (const w of waiting) {
    await notify([w.assigneeId], actorId, {
      kind: "task.unblocked",
      title: `You can start ${w.title}`,
      body: `${task.title} is done.`,
      href: `/projects/${task.projectId}/tasks/${w.id}`,
    }, tx);
  }
}
