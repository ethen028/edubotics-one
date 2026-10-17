import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { canEditProject, canUpdateTask, projectScope } from "@/lib/projects";
import {
  addChecklistItem,
  addTask,
  clearBlocked,
  deleteChecklistItem,
  postTaskUpdate,
  requestTaskUpdate,
  setBlocked,
  toggleChecklistItem,
  updateTask,
} from "../../../actions";
import { ProgressSlider } from "../../../progress-slider";
import { TaskForm } from "../../../task-form";
import { projectFormOptions } from "../../../data";
import {
  BlockedBadge,
  ChecklistCount,
  FileList,
  PriorityBadge,
  ProgressBar,
  TaskStatusBadge,
  UpdateFeed,
  UpdateRequestedBadge,
  WaitingBadge,
  updateInclude,
} from "../../../ui";

export const metadata = { title: "Task" };

/** One task, Task Flow style: details, progress, files and the report history, with the update form for the assignee. */
export default async function TaskPage({ params }: PageProps<"/projects/[id]/tasks/[taskId]">) {
  const user = await requireUser();
  const { id, taskId } = await params;
  const task = await db.projectTask.findFirst({
    where: { id: taskId, projectId: id, project: projectScope(user) },
    include: {
      project: { select: { id: true, name: true, ownerId: true, owner: { select: { name: true } } } },
      assignee: { select: { id: true, name: true } },
      milestone: { select: { title: true } },
      createdBy: { select: { name: true } },
      parent: { select: { id: true, title: true } },
      dependsOn: { select: { id: true, title: true, status: true, assignee: { select: { name: true } } } },
      dependents: { select: { id: true, title: true, status: true } },
      subtasks: {
        include: { assignee: { select: { name: true } } },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      },
      checklist: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      files: { include: { uploadedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      updates: { include: updateInclude, orderBy: { createdAt: "desc" } },
    },
  });
  if (!task) notFound();

  const today = todayIST();
  const canEdit = canEditProject(user, task.project);
  const canUpdate = canUpdateTask(user, task, task.project);
  const pct = task.status === "DONE" ? 100 : task.progress;
  const canRequest = canEdit && task.assignee && task.assignee.id !== user.id && task.status !== "DONE";
  const [logged, options, projectTasks, milestones] = await Promise.all([
    db.timeEntry.aggregate({ where: { taskId: task.id }, _sum: { hours: true } }),
    canEdit ? projectFormOptions() : null,
    canEdit
      ? db.projectTask.findMany({
          where: { projectId: id },
          select: { id: true, title: true, parentId: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
    canEdit ? db.milestone.findMany({ where: { projectId: id }, select: { id: true, title: true } }) : [],
  ]);
  const hoursLogged = Number(logged._sum.hours ?? 0);
  const estimate = task.estimatedHours ? Number(task.estimatedHours) : null;
  const waiting = task.dependsOn && task.dependsOn.status !== "DONE" ? task.dependsOn : null;
  const ticked = task.checklist.filter((c) => c.doneAt).length;

  return (
    <>
      <PageHeader
        title={task.title}
        subtitle={
          <>
            <Link href={`/projects/${task.project.id}`} className="link">
              {task.project.name}
            </Link>
            {task.milestone && ` · ${task.milestone.title}`}
            {task.parent && (
              <>
                {" · part of "}
                <Link href={`/projects/${task.project.id}/tasks/${task.parent.id}`} className="link">
                  {task.parent.title}
                </Link>
              </>
            )}
          </>
        }
        actions={
          <Link href={`/projects/${task.project.id}`} className="btn-secondary">
            Back to project
          </Link>
        }
      />

      {task.updateRequestedAt && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          An update was requested on {formatDateTime(task.updateRequestedAt)}.
          {task.assignee?.id === user.id && " Post one below to clear it."}
        </div>
      )}
      {task.blockedAt && task.status !== "DONE" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <span>
            <b>Blocked</b> since {formatDateTime(task.blockedAt)}: {task.blockedReason}
          </span>
          {canUpdate && (
            <form action={clearBlocked.bind(null, task.id)}>
              <button className="btn-secondary btn-sm">No longer blocked</button>
            </form>
          )}
        </div>
      )}
      {waiting && task.status !== "DONE" && (
        <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          Waiting on{" "}
          <Link href={`/projects/${task.project.id}/tasks/${waiting.id}`} className="font-medium underline">
            {waiting.title}
          </Link>{" "}
          ({waiting.status === "TODO" ? "to do" : waiting.status.replace("_", " ").toLowerCase()}
          {waiting.assignee && `, ${waiting.assignee.name}`}). {task.assignee?.name ?? "The assignee"} hears in their Inbox
          when it&apos;s done.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section className="card">
            <p className="text-sm whitespace-pre-line text-slate-700">{task.description || "No description."}</p>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">Status</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  <TaskStatusBadge status={task.status} dueDate={task.dueDate} today={today} />
                  {task.updateRequestedAt && <UpdateRequestedBadge />}
                  {task.blockedAt && task.status !== "DONE" && <BlockedBadge reason={task.blockedReason} />}
                  {waiting && task.status !== "DONE" && <WaitingBadge on={waiting.title} />}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Priority</dt>
                <dd className="mt-1">
                  <PriorityBadge priority={task.priority} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Dates</dt>
                <dd className="mt-1 font-medium">
                  {task.startDate ? `${formatDate(task.startDate)} → ` : "Due "}
                  {formatDate(task.dueDate)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Hours logged</dt>
                <dd className={`mt-1 font-medium ${estimate && hoursLogged > estimate ? "text-red-600" : ""}`}>
                  {hoursLogged} h{estimate ? ` of ${estimate} h estimated` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Assigned to</dt>
                <dd className="mt-1 font-medium">{task.assignee?.name ?? "Unassigned"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Project owner</dt>
                <dd className="mt-1 font-medium">{task.project.owner.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Created by</dt>
                <dd className="mt-1 font-medium">{task.createdBy.name}</dd>
              </div>
            </dl>
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>Progress</span>
                <span className="font-semibold text-slate-800">{pct}% complete</span>
              </div>
              <ProgressBar value={pct} className="h-2.5" />
            </div>
          </section>

          {(task.checklist.length > 0 || canUpdate) && (
            <section className="card">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold">Checklist</h2>
                <ChecklistCount done={ticked} total={task.checklist.length} />
              </div>
              {task.checklist.length === 0 ? (
                <p className="text-sm text-slate-500">Break the task into steps to tick off.</p>
              ) : (
                <ul className="space-y-1">
                  {task.checklist.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                      {canUpdate ? (
                        <form action={toggleChecklistItem.bind(null, c.id)} className="min-w-0 flex-1">
                          <button className="flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left hover:bg-slate-50">
                            <span
                              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${c.doneAt ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"}`}
                            >
                              {c.doneAt ? "✓" : ""}
                            </span>
                            <span className={c.doneAt ? "text-slate-400 line-through" : ""}>{c.title}</span>
                          </button>
                        </form>
                      ) : (
                        <span className={`px-1 py-1 ${c.doneAt ? "text-slate-400 line-through" : ""}`}>
                          {c.doneAt ? "☑" : "☐"} {c.title}
                        </span>
                      )}
                      {canUpdate && (
                        <form action={deleteChecklistItem.bind(null, c.id)}>
                          <button className="text-xs text-slate-400 hover:text-red-600" title="Remove step">
                            ✕
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canUpdate && (
                <ActionForm action={addChecklistItem.bind(null, task.id)} className="mt-3 flex flex-wrap items-start gap-2">
                  <textarea
                    name="title"
                    rows={1}
                    className="input min-w-0 flex-1"
                    placeholder="Add a step (or paste a list)"
                  />
                  <SubmitButton className="btn-secondary btn-sm">Add</SubmitButton>
                </ActionForm>
              )}
            </section>
          )}

          {(task.subtasks.length > 0 || (canEdit && !task.parent)) && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Subtasks ({task.subtasks.length})</h2>
              {task.subtasks.length === 0 ? (
                <p className="text-sm text-slate-500">No subtasks.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {task.subtasks.map((st) => {
                    const sp = st.status === "DONE" ? 100 : st.progress;
                    return (
                      <li key={st.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/projects/${task.project.id}/tasks/${st.id}`}
                            className={st.status === "DONE" ? "text-slate-400 line-through hover:underline" : "font-medium hover:underline"}
                          >
                            {st.title}
                          </Link>
                          <div className="text-xs text-slate-500">
                            {st.assignee?.name ?? "Unassigned"}
                            {st.dueDate && ` · due ${formatDate(st.dueDate)}`}
                          </div>
                        </div>
                        {st.blockedAt && st.status !== "DONE" && <BlockedBadge reason={st.blockedReason} />}
                        <div className="flex w-24 items-center gap-1.5">
                          <ProgressBar value={sp} className="flex-1" />
                          <span className="w-8 text-right text-xs text-slate-500 tabular-nums">{sp}%</span>
                        </div>
                        <TaskStatusBadge status={st.status} dueDate={st.dueDate} today={today} />
                      </li>
                    );
                  })}
                </ul>
              )}
              {canEdit && !task.parent && options && (
                <details className="mt-3 border-t border-slate-100 pt-3">
                  <summary className="cursor-pointer text-sm font-medium text-brand-700">Add a subtask</summary>
                  <div className="mt-3">
                    <TaskForm
                      action={addTask.bind(null, task.project.id)}
                      users={options.users}
                      milestones={milestones}
                      tasks={projectTasks}
                      parentId={task.id}
                      compact
                    />
                  </div>
                </details>
              )}
            </section>
          )}

          {canUpdate && (
            <section className="card">
              <h2 className="mb-3 font-semibold">{task.assignee?.id === user.id ? "Update your progress" : "Post an update"}</h2>
              <ActionForm action={postTaskUpdate.bind(null, task.id)} className="space-y-4 [&>label]:block">
                <Field label="Progress">
                  <ProgressSlider defaultValue={pct} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Status">
                    <select name="status" defaultValue="" className="input">
                      <option value="">Set automatically from progress</option>
                      <option value="TODO">To do</option>
                      <option value="IN_PROGRESS">In progress</option>
                      <option value="REVIEW">Ready for review</option>
                      <option value="DONE">Done</option>
                    </select>
                  </Field>
                  <Field label="Files (up to 5, 10 MB each)">
                    <input type="file" name="files" multiple className="input py-1.5 text-xs" />
                  </Field>
                </div>
                <Field label="Report">
                  <textarea name="note" rows={3} className="input" placeholder="What did you get done? Any blockers?" />
                </Field>
                <SubmitButton>Save update</SubmitButton>
              </ActionForm>
            </section>
          )}

          <section className="card">
            <h2 className="mb-3 font-semibold">Reports and updates</h2>
            <UpdateFeed updates={task.updates} projectId={task.project.id} />
          </section>
        </div>

        <div className="space-y-6">
          {canRequest && (
            <section className="card">
              <h2 className="mb-1 font-semibold">Ask for an update</h2>
              <p className="mb-3 text-xs text-slate-500">
                {task.assignee!.name} sees the request on their Home and My work until they post an update.
              </p>
              <form action={requestTaskUpdate.bind(null, task.id)} className="space-y-2">
                <input name="note" className="input" placeholder="Optional note, e.g. need photos by Friday" />
                <button className="btn-secondary btn-sm">{task.updateRequestedAt ? "Ask again" : "Request update"}</button>
              </form>
            </section>
          )}
          {canUpdate && !task.blockedAt && task.status !== "DONE" && (
            <section className="card">
              <h2 className="mb-1 font-semibold">Stuck?</h2>
              <p className="mb-3 text-xs text-slate-500">
                Mark it blocked and say why. {canEdit ? "It shows on Daily pulse" : `${task.project.owner.name} gets it in their Inbox`}{" "}
                until it&apos;s cleared.
              </p>
              <ActionForm action={setBlocked.bind(null, task.id)} className="space-y-2">
                <input name="reason" required className="input" placeholder="e.g. Waiting for the school to share the lab timetable" />
                <SubmitButton className="btn-secondary btn-sm">Mark as blocked</SubmitButton>
              </ActionForm>
            </section>
          )}
          {task.dependents.length > 0 && (
            <section className="card">
              <h2 className="mb-2 font-semibold">Waiting on this task</h2>
              <ul className="space-y-1 text-sm">
                {task.dependents.map((d) => (
                  <li key={d.id}>
                    <Link href={`/projects/${task.project.id}/tasks/${d.id}`} className="link">
                      {d.title}
                    </Link>
                    {d.status === "DONE" && <span className="text-xs text-slate-500"> · done</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="card">
            <h2 className="mb-3 font-semibold">Files ({task.files.length})</h2>
            <FileList files={task.files} canDelete={(f) => canEdit || f.uploadedById === user.id} />
          </section>
        </div>
      </div>

      {canEdit && options && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">Edit task</summary>
          <div className="card mt-3 max-w-3xl">
            <TaskForm
              action={updateTask.bind(null, task.id)}
              task={task}
              users={options.users}
              milestones={milestones}
              tasks={projectTasks}
            />
          </div>
        </details>
      )}
    </>
  );
}
