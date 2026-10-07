import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { canEditProject, canUpdateTask, projectScope } from "@/lib/projects";
import { postTaskUpdate, requestTaskUpdate } from "../../../actions";
import { ProgressSlider } from "../../../progress-slider";
import {
  FileList,
  PriorityBadge,
  ProgressBar,
  TaskStatusBadge,
  UpdateFeed,
  UpdateRequestedBadge,
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
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Priority</dt>
                <dd className="mt-1">
                  <PriorityBadge priority={task.priority} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Due date</dt>
                <dd className="mt-1 font-medium">{formatDate(task.dueDate)}</dd>
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
          <section className="card">
            <h2 className="mb-3 font-semibold">Files ({task.files.length})</h2>
            <FileList files={task.files} canDelete={(f) => canEdit || f.uploadedById === user.id} />
          </section>
        </div>
      </div>
    </>
  );
}
