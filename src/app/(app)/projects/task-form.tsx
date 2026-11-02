import type { ProjectTask } from "@prisma/client";
import { ActionForm, SubmitButton, type FormState } from "@/components/action-form";
import { Field } from "@/components/ui";
import { toDateInput } from "@/lib/format";

type Option = { id: string; name: string };
type TaskOption = { id: string; title: string; parentId: string | null };

/**
 * Task Flow v5's task editor: who, when, how long, and how it fits with the other tasks (part of a main task, or
 * waiting on another one). Used to add a task on the project page and to edit one on its own page.
 */
export function TaskForm({
  action,
  task,
  users,
  milestones,
  tasks,
  parentId,
  compact = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  task?: ProjectTask;
  users: Option[];
  milestones: { id: string; title: string }[];
  /** The project's other tasks, for "Part of" and "Waiting on". */
  tasks: TaskOption[];
  /** Fixed main task when adding a subtask from the task page. */
  parentId?: string;
  compact?: boolean;
}) {
  const others = tasks.filter((t) => t.id !== task?.id);
  // Only main tasks can take subtasks, and a task that has subtasks stays a main task.
  const mainTasks = others.filter((t) => !t.parentId);
  const hasSubtasks = task ? tasks.some((t) => t.parentId === task.id) : false;
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-6">
        <Field label={parentId ? "Subtask *" : task ? "Title *" : "New task *"} className="sm:col-span-3">
          <input name="title" required defaultValue={task?.title} className="input" />
        </Field>
        <Field label="Assign to" className="sm:col-span-3">
          <select name="assigneeId" className="input" defaultValue={task?.assigneeId ?? ""}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority" className="sm:col-span-2">
          <select name="priority" defaultValue={task?.priority ?? "MEDIUM"} className="input">
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </Field>
        <Field label="Start" className="sm:col-span-2">
          <input type="date" name="startDate" defaultValue={toDateInput(task?.startDate)} className="input" />
        </Field>
        <Field label="Due" className="sm:col-span-2">
          <input type="date" name="dueDate" defaultValue={toDateInput(task?.dueDate)} className="input" />
        </Field>
        <Field label="Estimated hours" className="sm:col-span-2">
          <input
            type="number"
            name="estimatedHours"
            min="0.25"
            max="2000"
            step="0.25"
            defaultValue={task?.estimatedHours ? Number(task.estimatedHours) : ""}
            className="input"
          />
        </Field>
        {!compact && (
          <Field label="Milestone" className="sm:col-span-2">
            <select name="milestoneId" className="input" defaultValue={task?.milestoneId ?? ""}>
              <option value="">—</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        {parentId ? (
          <input type="hidden" name="parentId" value={parentId} />
        ) : (
          !compact && (
            <Field label="Part of" className="sm:col-span-2">
              <select name="parentId" className="input" defaultValue={task?.parentId ?? ""} disabled={hasSubtasks}>
                <option value="">— (a main task)</option>
                {mainTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </Field>
          )
        )}
        {!compact && (
          <Field label="Waiting on" className={parentId ? "sm:col-span-4" : "sm:col-span-6"}>
            <select name="dependsOnId" className="input" defaultValue={task?.dependsOnId ?? ""}>
              <option value="">— (can start any time)</option>
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Notes" className="sm:col-span-6">
          <textarea name="description" rows={task ? 3 : 1} defaultValue={task?.description ?? ""} className="input" />
        </Field>
      </div>
      <div className="mt-3">
        <SubmitButton>{task ? "Save task" : parentId ? "Add subtask" : "Add task"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
