import Link from "next/link";
import type { Asset, EmployeeDocument, OnboardingTask, SalaryStructure, TrainingAssignment, TrainingModule } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge } from "@/components/ui";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { DOCUMENT_TYPES, TASK_CATEGORIES } from "@/lib/hr-constants";
import { addTask, applyChecklist, deleteDocument, deleteTask, reviewDocument, setTaskStatus, uploadDocument } from "../../onboarding/actions";
import { assignTraining, removeTraining, setTrainingStatus } from "../../training/actions";
import { deleteSalary, saveSalary } from "../../../payroll/actions";

const TASK_COLOR = { PENDING: "gray", IN_PROGRESS: "blue", COMPLETED: "green", NOT_APPLICABLE: "gray" } as const;
const DOC_COLOR = { PENDING: "amber", UNDER_REVIEW: "blue", VERIFIED: "green", REJECTED: "red" } as const;
const TRAINING_COLOR = { ASSIGNED: "gray", IN_PROGRESS: "blue", COMPLETED: "green" } as const;

export function progressOf(tasks: Pick<OnboardingTask, "status">[]) {
  const counted = tasks.filter((t) => t.status !== "NOT_APPLICABLE");
  if (counted.length === 0) return null;
  return Math.round((counted.filter((t) => t.status === "COMPLETED").length / counted.length) * 100);
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${value}%` }} />
    </div>
  );
}

export function OnboardingSection({
  employeeId,
  tasks,
  canEdit,
  isSelf,
}: {
  employeeId: string;
  tasks: OnboardingTask[];
  canEdit: boolean;
  isSelf: boolean;
}) {
  const progress = progressOf(tasks);
  return (
    <section className="card text-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Onboarding checklist</h2>
        {canEdit && (
          <form action={applyChecklist.bind(null, employeeId)}>
            <button className="btn-secondary btn-sm">{tasks.length ? "Add missing standard tasks" : "Add standard checklist"}</button>
          </form>
        )}
      </div>
      {progress !== null && (
        <div className="mb-3 flex items-center gap-3">
          <ProgressBar value={progress} />
          <span className="font-medium whitespace-nowrap">{progress}%</span>
        </div>
      )}
      {tasks.length === 0 ? (
        <p className="text-slate-500">No onboarding tasks.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className={t.status === "COMPLETED" ? "text-slate-400 line-through" : ""}>{t.title}</div>
                <div className="text-xs text-slate-500">
                  {t.category}
                  {t.dueDate && ` · due ${formatDate(t.dueDate)}`}
                </div>
              </div>
              {canEdit || (isSelf && t.status !== "NOT_APPLICABLE") ? (
                <form action={setTaskStatus.bind(null, t.id)} className="flex items-center gap-1">
                  <select name="status" defaultValue={t.status} className="input w-auto py-1 text-xs">
                    <option value="PENDING">Pending</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="COMPLETED">Completed</option>
                    {canEdit && <option value="NOT_APPLICABLE">Not applicable</option>}
                  </select>
                  <button className="btn-secondary btn-sm">Save</button>
                </form>
              ) : (
                <Badge color={TASK_COLOR[t.status]}>{humanize(t.status)}</Badge>
              )}
              {canEdit && (
                <form action={deleteTask.bind(null, t.id)}>
                  <button className="text-xs text-slate-400 hover:text-red-600" title="Remove task">
                    ✕
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <ActionForm action={addTask.bind(null, employeeId)} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <input name="title" placeholder="New task" required className="input min-w-40 flex-1 py-1" />
          <select name="category" className="input w-auto py-1">
            {TASK_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input name="dueDate" type="date" className="input w-auto py-1" />
          <SubmitButton className="btn-secondary btn-sm">Add</SubmitButton>
        </ActionForm>
      )}
    </section>
  );
}

type Doc = Omit<EmployeeDocument, "data">;

export function DocumentsSection({
  employeeId,
  documents,
  isSelf,
  admin,
}: {
  employeeId: string;
  documents: Doc[];
  isSelf: boolean;
  admin: boolean;
}) {
  return (
    <section className="card text-sm">
      <h2 className="mb-1 font-semibold">Documents</h2>
      <p className="mb-3 text-xs text-slate-500">Only you and admins can open these.</p>
      {documents.length === 0 ? (
        <p className="text-slate-500">No documents yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {documents.map((d) => (
            <li key={d.id} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <a href={`/api/documents/${d.id}`} target="_blank" className="link">
                    {d.type}
                  </a>
                  <div className="truncate text-xs text-slate-500">
                    {d.fileName} · {Math.ceil(d.size / 1024)} KB · {formatDate(d.createdAt)}
                  </div>
                </div>
                <Badge color={DOC_COLOR[d.status]}>{humanize(d.status)}</Badge>
                {(admin || (isSelf && d.status !== "VERIFIED")) && (
                  <form action={deleteDocument.bind(null, d.id)}>
                    <button className="text-xs text-slate-400 hover:text-red-600" title="Delete">
                      ✕
                    </button>
                  </form>
                )}
              </div>
              {d.reviewNote && <div className="mt-1 text-xs text-slate-600">Note: {d.reviewNote}</div>}
              {admin && !isSelf && d.status !== "VERIFIED" && (
                <form action={reviewDocument.bind(null, d.id)} className="mt-2 flex flex-wrap gap-2">
                  <input name="note" placeholder="Note for the employee" className="input min-w-40 flex-1 py-1" />
                  <button name="status" value="VERIFIED" className="btn-primary btn-sm">
                    Verify
                  </button>
                  <button name="status" value="REJECTED" className="btn-secondary btn-sm">
                    Reject
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {(isSelf || admin) && (
        <ActionForm action={uploadDocument.bind(null, employeeId)} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <select name="type" className="input w-auto py-1">
            {DOCUMENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" className="min-w-0 flex-1 text-xs" />
          <SubmitButton className="btn-secondary btn-sm">Upload</SubmitButton>
          <div className="w-full text-xs text-slate-500">PDF, JPG, PNG or WebP, up to 5 MB.</div>
        </ActionForm>
      )}
    </section>
  );
}

export function TrainingSection({
  employeeId,
  assignments,
  modules,
  canEdit,
  isSelf,
}: {
  employeeId: string;
  assignments: (TrainingAssignment & { module: TrainingModule })[];
  modules: TrainingModule[];
  canEdit: boolean;
  isSelf: boolean;
}) {
  const unassigned = modules.filter((m) => m.active && !assignments.some((a) => a.moduleId === m.id));
  const done = assignments.filter((a) => a.status === "COMPLETED").length;
  return (
    <section className="card text-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Training</h2>
        {assignments.length > 0 && (
          <span className="text-slate-500">
            {done} of {assignments.length} done
          </span>
        )}
      </div>
      {assignments.length === 0 ? (
        <p className="text-slate-500">No training assigned.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {assignments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div>{a.module.title}</div>
                {a.completedAt && <div className="text-xs text-slate-500">Completed {formatDate(a.completedAt)}</div>}
              </div>
              {canEdit || isSelf ? (
                <form action={setTrainingStatus.bind(null, a.id)} className="flex items-center gap-1">
                  <select name="status" defaultValue={a.status} className="input w-auto py-1 text-xs">
                    <option value="ASSIGNED">Not started</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                  <button className="btn-secondary btn-sm">Save</button>
                </form>
              ) : (
                <Badge color={TRAINING_COLOR[a.status]}>{humanize(a.status)}</Badge>
              )}
              {canEdit && (
                <form action={removeTraining.bind(null, a.id)}>
                  <button className="text-xs text-slate-400 hover:text-red-600" title="Unassign">
                    ✕
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && unassigned.length > 0 && (
        <form action={assignTraining.bind(null, employeeId)} className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
          <select name="moduleId" className="input py-1">
            {unassigned.length > 1 && <option value="ALL">All active modules</option>}
            {unassigned.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          <button className="btn-secondary btn-sm">Assign</button>
        </form>
      )}
    </section>
  );
}

export function AssetsSection({ assets, admin }: { assets: Asset[]; admin: boolean }) {
  return (
    <section className="card text-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Assets</h2>
        {admin && (
          <Link href="/hr/assets" className="link text-xs">
            Asset register
          </Link>
        )}
      </div>
      {assets.length === 0 ? (
        <p className="text-slate-500">No assets assigned.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {assets.map((a) => (
            <li key={a.id} className="py-2">
              <div>
                {a.name} <span className="text-xs text-slate-500">· {a.code}</span>
              </div>
              <div className="text-xs text-slate-500">
                {a.category}
                {a.serialNo && ` · S/N ${a.serialNo}`}
                {a.assignedAt && ` · since ${formatDate(a.assignedAt)}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


export function SalarySection({
  employeeId,
  salaries,
  admin,
  today,
}: {
  employeeId: string;
  salaries: SalaryStructure[];
  admin: boolean;
  today: string;
}) {
  const gross = (s: SalaryStructure) => Number(s.basic) + Number(s.hra) + Number(s.specialAllowance);
  return (
    <section id="salary" className="card text-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Salary</h2>
        <Link href={admin ? "/payroll" : "/payroll/my"} className="link text-xs">
          {admin ? "Payroll" : "My payslips"}
        </Link>
      </div>
      {salaries.length === 0 ? (
        <p className="text-slate-500">No salary set.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>From</th>
              <th className="text-right">Basic</th>
              <th className="text-right">HRA</th>
              <th className="text-right">Special</th>
              <th className="text-right">Gross / month</th>
              {admin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {salaries.map((s) => (
              <tr key={s.id}>
                <td>
                  {formatDate(s.effectiveFrom)}
                  {s.note && <div className="text-xs text-slate-500">{s.note}</div>}
                </td>
                <td className="text-right">{formatINR(s.basic)}</td>
                <td className="text-right">{formatINR(s.hra)}</td>
                <td className="text-right">{formatINR(s.specialAllowance)}</td>
                <td className="text-right font-semibold">{formatINR(gross(s))}</td>
                {admin && (
                  <td>
                    <form action={deleteSalary.bind(null, s.id)}>
                      <button className="text-xs text-slate-400 hover:text-red-600" title="Delete">
                        ✕
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {admin && (
        <ActionForm action={saveSalary.bind(null, employeeId)} className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-4">
          <label className="text-xs">
            Effective from
            <input name="effectiveFrom" type="date" required defaultValue={today} className="input py-1" />
          </label>
          <label className="text-xs">
            Basic (₹/month)
            <input name="basic" type="number" min="1" required className="input py-1" />
          </label>
          <label className="text-xs">
            HRA
            <input name="hra" type="number" min="0" defaultValue="0" className="input py-1" />
          </label>
          <label className="text-xs">
            Special allowance
            <input name="specialAllowance" type="number" min="0" defaultValue="0" className="input py-1" />
          </label>
          <input name="note" placeholder="Note, e.g. annual increment" className="input col-span-2 py-1 sm:col-span-3" />
          <SubmitButton className="btn-secondary btn-sm">Save salary</SubmitButton>
        </ActionForm>
      )}
    </section>
  );
}
