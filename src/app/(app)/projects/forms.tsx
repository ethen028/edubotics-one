import type { Project } from "@prisma/client";
import { ActionForm, SubmitButton, type FormState } from "@/components/action-form";
import { Field } from "@/components/ui";
import { toDateInput } from "@/lib/format";
import { kindLabel } from "@/lib/projects";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Option = { id: string; name: string };

export function ProjectForm({
  action,
  project,
  defaults,
  users,
  departments,
  organizations,
  deals,
}: {
  action: Action;
  project?: Project;
  defaults?: Partial<Project>;
  users: Option[];
  departments: Option[];
  organizations: Option[];
  deals: { id: string; title: string }[];
}) {
  const v = { ...defaults, ...project };
  return (
    <ActionForm action={action} className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name *" className="sm:col-span-2">
          <input name="name" required defaultValue={v.name} className="input" placeholder="e.g. St. Mary's robotics lab, Term 2" />
        </Field>
        <Field label="Type">
          <select name="kind" defaultValue={v.kind ?? "CLIENT_PROJECT"} className="input">
            {Object.entries(kindLabel).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner *">
          <select name="ownerId" required defaultValue={v.ownerId ?? ""} className="input">
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Department">
          <select name="departmentId" defaultValue={v.departmentId ?? ""} className="input">
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Institution / client">
          <select name="organizationId" defaultValue={v.organizationId ?? ""} className="input">
            <option value="">—</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Won deal it delivers">
          <select name="dealId" defaultValue={v.dealId ?? ""} className="input">
            <option value="">—</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start">
            <input type="date" name="startDate" defaultValue={toDateInput(v.startDate)} className="input" />
          </Field>
          <Field label="Due">
            <input type="date" name="dueDate" defaultValue={toDateInput(v.dueDate)} className="input" />
          </Field>
        </div>
        <Field label="Objective and scope" className="sm:col-span-2">
          <textarea name="description" rows={3} defaultValue={v.description ?? ""} className="input" />
        </Field>
      </div>
      <SubmitButton>{project ? "Save" : "Create project"}</SubmitButton>
    </ActionForm>
  );
}
