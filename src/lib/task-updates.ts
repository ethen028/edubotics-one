import "server-only";
import type { Prisma, ProjectTask, WorkStatus } from "@prisma/client";
import type { IncomingFile } from "./project-files";

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
    },
  });
  return next;
}
