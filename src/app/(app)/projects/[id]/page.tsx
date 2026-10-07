import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, isManagerOrAdmin, requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, PageHeader } from "@/components/ui";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { payableOf } from "@/lib/expenses";
import { todayIST } from "@/lib/time";
import {
  PROJECT_STAGES,
  canApproveProject,
  canEditProject,
  kindLabel,
  progress,
  projectScope,
  stageInfo,
} from "@/lib/projects";
import {
  addMember,
  addMilestone,
  addTask,
  decideProject,
  deleteMilestone,
  deleteProject,
  deleteTask,
  moveStage,
  postProjectUpdate,
  removeMember,
  setTaskStatus,
  toggleHold,
  toggleMilestone,
  updateProject,
} from "../actions";
import { outstanding, requestNo } from "@/lib/inventory";
import { RequestBadge } from "../../inventory/ui";
import { ProjectForm } from "../forms";
import { projectFormOptions } from "../data";
import {
  FileList,
  PriorityBadge,
  ProgressBar,
  StageBadge,
  StageRail,
  TaskStatusBadge,
  UpdateFeed,
  UpdateRequestedBadge,
  WORK_STATUSES,
  updateInclude,
} from "../ui";
import { ProgrammeBadge } from "../../operations/ui";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const project = await db.project.findFirst({
    where: { id, ...projectScope(user) },
    include: {
      owner: { select: { id: true, name: true } },
      department: true,
      organization: { select: { id: true, name: true } },
      deal: { select: { id: true, title: true } },
      programmes: { select: { id: true, name: true, status: true, organization: { select: { name: true } } } },
      decidedBy: { select: { name: true } },
      members: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      milestones: { orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] },
      tasks: {
        include: {
          assignee: { select: { id: true, name: true } },
          milestone: { select: { title: true } },
          _count: { select: { files: true } },
        },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      },
      stockRequests: {
        where: { status: { notIn: ["CANCELLED", "REJECTED"] } },
        include: { lines: { include: { item: { select: { name: true, returnable: true } } } } },
        orderBy: { createdAt: "desc" },
      },
      updates: { include: updateInclude, orderBy: { createdAt: "desc" }, take: 15 },
      files: { include: { uploadedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) notFound();

  const [canEdit, canApprove, hours, expenses, options] = await Promise.all([
    canEditProject(user, project),
    canApproveProject(user, project),
    db.timeEntry.aggregate({ where: { projectId: id }, _sum: { hours: true } }),
    db.expenseClaim.findMany({
      where: { projectId: id, status: { not: "REJECTED" } },
      select: { amount: true, approvedAmount: true },
    }),
    canEditProject(user, project) ? projectFormOptions(project.dealId) : null,
  ]);
  const today = todayIST();
  const pct = progress(project.tasks);
  const done = project.tasks.filter((t) => t.status === "DONE").length;
  const nextMilestone = project.milestones.find((m) => !m.doneAt);
  const i = PROJECT_STAGES.indexOf(project.stage);
  const next = PROJECT_STAGES[i + 1];
  const prev = PROJECT_STAGES[i - 1];
  const info = stageInfo[project.stage];
  const openTasks = project.tasks.filter((t) => t.status !== "DONE").length;
  const sentBack = project.stage === "REVIEW" && project.decidedAt && project.approvalNote;

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={
          <>
            {kindLabel[project.kind]}
            {project.organization && (
              <>
                {" · "}
                <Link href={`/crm/organizations/${project.organization.id}`} className="link">
                  {project.organization.name}
                </Link>
              </>
            )}
            {project.deal && (
              <>
                {" · deal "}
                <Link href={`/crm/deals/${project.deal.id}`} className="link">
                  {project.deal.title}
                </Link>
              </>
            )}
            {" · "}
            <StageBadge stage={project.stage} onHold={project.onHold} />
          </>
        }
        actions={
          <>
            <Link href="/projects" className="btn-secondary">
              All projects
            </Link>
            {canEdit && project.stage !== "COMPLETE" && (
              <form action={toggleHold.bind(null, project.id)}>
                <button className="btn-secondary">{project.onHold ? "Resume" : "Put on hold"}</button>
              </form>
            )}
            {isAdmin(user) && (
              <form action={deleteProject.bind(null, project.id)}>
                <button className="btn-danger">Delete</button>
              </form>
            )}
          </>
        }
      />

      <section className="card mb-6">
        <StageRail stage={project.stage} />
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-xl bg-brand-50 p-4">
          <div>
            <div className="text-xs font-semibold tracking-wider text-brand-700 uppercase">
              {String(i + 1).padStart(2, "0")} / {humanize(project.stage)}
            </div>
            <h2 className="mt-1 text-lg font-semibold">{info.title}</h2>
            <p className="text-sm text-slate-600">{info.hint}</p>
            {sentBack && (
              <p className="mt-2 text-sm text-red-700">
                Sent back by {project.decidedBy?.name} on {formatDate(project.decidedAt)}: “{project.approvalNote}”
              </p>
            )}
            {project.stage === "HANDOVER" && project.decidedAt && (
              <p className="mt-2 text-sm text-emerald-800">
                Approved by {project.decidedBy?.name} on {formatDate(project.decidedAt)}
                {project.approvalNote && `: “${project.approvalNote}”`}
              </p>
            )}
            {project.stage === "EXECUTE" && openTasks > 0 && (
              <p className="mt-2 text-sm text-slate-600">{openTasks} task(s) still open.</p>
            )}
          </div>

          {project.stage === "APPROVAL" ? (
            canApprove ? (
              <form action={decideProject.bind(null, project.id)} className="flex flex-wrap items-center gap-2">
                <input name="note" placeholder="Note, e.g. what needs fixing" className="input w-60" />
                <button name="decision" value="APPROVED" className="btn-primary">
                  Approve
                </button>
                <button name="decision" value="REJECTED" className="btn-danger">
                  Send back
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3 text-sm text-slate-600">
                Waiting for an admin or {project.owner.name}&apos;s manager.
                {canEdit && (
                  <form action={moveStage.bind(null, project.id)}>
                    <button name="direction" value="back" className="btn-secondary btn-sm">
                      Withdraw
                    </button>
                  </form>
                )}
              </div>
            )
          ) : (
            canEdit && (
              <form action={moveStage.bind(null, project.id)} className="flex gap-2">
                {prev && prev !== "CREATE" && prev !== "APPROVAL" && (
                  <button name="direction" value="back" className="btn-secondary">
                    Back to {humanize(prev)}
                  </button>
                )}
                {next && (
                  <button name="direction" value="next" className="btn-primary">
                    {next === "APPROVAL" ? "Request approval" : next === "COMPLETE" ? "Mark complete" : `Move to ${humanize(next)}`}
                  </button>
                )}
              </form>
            )
          )}
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card">
          <div className="text-xs font-medium text-slate-500">Progress</div>
          <div className="mt-1 text-2xl font-semibold">{pct}%</div>
          <ProgressBar value={pct} className="mt-2" />
        </div>
        <div className="card">
          <div className="text-xs font-medium text-slate-500">Tasks done</div>
          <div className="mt-1 text-2xl font-semibold">
            {done} / {project.tasks.length}
          </div>
        </div>
        <div className="card">
          <div className="text-xs font-medium text-slate-500">Next milestone</div>
          <div className="mt-1 truncate font-semibold">{nextMilestone?.title ?? "—"}</div>
          <div className="text-xs text-slate-500">{nextMilestone?.dueDate ? formatDate(nextMilestone.dueDate) : ""}</div>
        </div>
        <div className="card">
          <div className="text-xs font-medium text-slate-500">Hours logged</div>
          <div className="mt-1 text-2xl font-semibold">{Number(hours._sum.hours ?? 0)}</div>
          <div className="text-xs text-slate-500">
            {project.dueDate ? `Due ${formatDate(project.dueDate)}` : "No due date"} · owner {project.owner.name}
          </div>
          {expenses.length > 0 && (
            <div className="text-xs text-slate-500">
              Expenses claimed {formatINR(expenses.reduce((s, c) => s + payableOf(c), 0))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Tasks</h2>
          {project.tasks.length === 0 ? (
            <Empty>No tasks yet.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {project.tasks.map((t) => {
                const late = t.status !== "DONE" && t.dueDate && t.dueDate < today;
                const canMove = canEdit || t.assignee?.id === user.id;
                const tPct = t.status === "DONE" ? 100 : t.progress;
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                    <div className="min-w-0 flex-1 basis-full sm:basis-0">
                      <Link
                        href={`/projects/${project.id}/tasks/${t.id}`}
                        className={t.status === "DONE" ? "text-slate-400 line-through hover:underline" : "font-medium hover:underline"}
                      >
                        {t.title}
                      </Link>{" "}
                      {t.updateRequestedAt && <UpdateRequestedBadge />}
                      <div className="text-xs text-slate-500">
                        {t.assignee?.name ?? "Unassigned"}
                        {t.milestone && ` · ${t.milestone.title}`}
                        {t._count.files > 0 && ` · 📎 ${t._count.files}`}
                        {t.description && ` · ${t.description}`}
                      </div>
                    </div>
                    <div className="flex w-24 items-center gap-1.5" title={`${tPct}% complete`}>
                      <ProgressBar value={tPct} className="flex-1" />
                      <span className="w-8 text-right text-xs text-slate-500 tabular-nums">{tPct}%</span>
                    </div>
                    <PriorityBadge priority={t.priority} />
                    <span className={`text-xs ${late ? "font-medium text-red-600" : "text-slate-500"}`}>
                      {t.dueDate ? formatDate(t.dueDate) : ""}
                    </span>
                    {canMove ? (
                      <form action={setTaskStatus.bind(null, t.id)} className="flex gap-1">
                        <select name="status" defaultValue={t.status} className="input w-auto py-1 text-xs">
                          {WORK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s === "TODO" ? "To do" : humanize(s)}
                            </option>
                          ))}
                        </select>
                        <button className="btn-secondary btn-sm">Set</button>
                      </form>
                    ) : (
                      <TaskStatusBadge status={t.status} dueDate={t.dueDate} today={today} />
                    )}
                    {canEdit && (
                      <form action={deleteTask.bind(null, t.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600" title="Delete task">
                          ✕
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {canEdit && (
            <ActionForm action={addTask.bind(null, project.id)} className="mt-4 border-t border-slate-100 pt-4">
              <div className="grid gap-3 sm:grid-cols-6">
                <Field label="New task *" className="sm:col-span-3">
                  <input name="title" required className="input" />
                </Field>
                <Field label="Assign to" className="sm:col-span-3">
                  <select name="assigneeId" className="input" defaultValue="">
                    <option value="">—</option>
                    {options!.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Priority" className="sm:col-span-2">
                  <select name="priority" defaultValue="MEDIUM" className="input">
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </Field>
                <Field label="Due" className="sm:col-span-2">
                  <input type="date" name="dueDate" className="input" />
                </Field>
                <Field label="Milestone" className="sm:col-span-2">
                  <select name="milestoneId" className="input" defaultValue="">
                    <option value="">—</option>
                    {project.milestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Notes" className="sm:col-span-6">
                  <input name="description" className="input" />
                </Field>
              </div>
              <div className="mt-3">
                <SubmitButton>Add task</SubmitButton>
              </div>
            </ActionForm>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Updates</h2>
          <ActionForm action={postProjectUpdate.bind(null, project.id)} className="mb-4 space-y-2">
            <textarea name="note" rows={2} className="input" placeholder="Share progress, blockers or meeting notes with the team" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input type="file" name="files" multiple className="text-xs text-slate-500" />
              <SubmitButton className="btn-secondary btn-sm">Post</SubmitButton>
            </div>
          </ActionForm>
          <UpdateFeed updates={project.updates} projectId={project.id} showTask />
        </section>
        </div>

        <div className="space-y-6">
          <section className="card">
            <h2 className="mb-3 font-semibold">Team ({project.members.length})</h2>
            <ul className="space-y-2 text-sm">
              {project.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <span>
                    {m.user.name}
                    {m.role && <span className="text-slate-500"> · {m.role}</span>}
                  </span>
                  {canEdit && m.user.id !== project.owner.id && (
                    <form action={removeMember.bind(null, m.id)}>
                      <button className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <ActionForm action={addMember.bind(null, project.id)} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <select name="userId" className="input" defaultValue="">
                  <option value="">Add a person…</option>
                  {options!.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <input name="role" placeholder="Role, e.g. Trainer" className="input" />
                <SubmitButton className="btn-secondary btn-sm">Add to team</SubmitButton>
              </ActionForm>
            )}
          </section>

          {(project.programmes.length > 0 || (project.kind === "SCHOOL_PROGRAMME" && isManagerOrAdmin(user))) && (
            <section className="card">
              <h2 className="mb-3 font-semibold">School sessions</h2>
              {project.programmes.length === 0 ? (
                <p className="text-sm text-slate-500">Set up the school&apos;s timetable and trainers under Operations.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {project.programmes.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <Link href={`/operations/programmes/${p.id}`} className="link">
                        {p.organization.name} · {p.name}
                      </Link>
                      <ProgrammeBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              )}
              {isManagerOrAdmin(user) && (
                <Link href={`/operations/programmes/new?project=${project.id}`} className="btn-secondary btn-sm mt-3">
                  {project.programmes.length ? "Add another school" : "Set up school sessions"}
                </Link>
              )}
            </section>
          )}

          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Kits and parts</h2>
              {project.stage !== "COMPLETE" && (
                <Link href={`/inventory/requests/new?project=${project.id}`} className="link text-sm">
                  Request
                </Link>
              )}
            </div>
            {project.stockRequests.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing requested from inventory.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {project.stockRequests.map((r) => {
                  const out = r.lines.reduce((n, l) => n + outstanding(l), 0);
                  return (
                    <li key={r.id}>
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/inventory/requests/${r.id}`} className="link">
                          {requestNo(r.number)}
                        </Link>
                        <RequestBadge status={r.status} />
                      </div>
                      <div className="text-xs text-slate-500">
                        {r.lines.map((l) => `${l.quantity} × ${l.item.name}`).join(", ")}
                        {out > 0 && ` · ${out} still out`}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 font-semibold">Files ({project.files.length})</h2>
            <FileList files={project.files} canDelete={(f) => canEdit || f.uploadedById === user.id} />
          </section>

          <section className="card">
            <h2 className="mb-3 font-semibold">Milestones</h2>
            {project.milestones.length === 0 ? (
              <p className="text-sm text-slate-500">None yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {project.milestones.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <span className={m.doneAt ? "text-slate-400 line-through" : ""}>
                      {m.title}
                      {m.dueDate && <span className="text-slate-500"> · {formatDate(m.dueDate)}</span>}
                    </span>
                    {canEdit ? (
                      <span className="flex shrink-0 gap-2">
                        <form action={toggleMilestone.bind(null, m.id)}>
                          <button className="link text-xs">{m.doneAt ? "Reopen" : "Done"}</button>
                        </form>
                        <form action={deleteMilestone.bind(null, m.id)}>
                          <button className="text-xs text-slate-400 hover:text-red-600">✕</button>
                        </form>
                      </span>
                    ) : (
                      m.doneAt && <Badge color="green">Done</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <ActionForm action={addMilestone.bind(null, project.id)} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <input name="title" required placeholder="Milestone, e.g. Kits delivered" className="input" />
                <input type="date" name="dueDate" className="input" />
                <SubmitButton className="btn-secondary btn-sm">Add milestone</SubmitButton>
              </ActionForm>
            )}
          </section>
        </div>
      </div>

      {canEdit && options && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">Edit project details</summary>
          <div className="mt-3 max-w-3xl">
            <ProjectForm action={updateProject.bind(null, project.id)} project={project} {...options} />
          </div>
        </details>
      )}
    </>
  );
}
