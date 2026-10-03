import type { Activity, User } from "@prisma/client";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, Options } from "@/components/ui";
import { formatDateTime, humanize } from "@/lib/format";
import { createActivity, toggleActivity } from "./actions";
import { ACTIVITY_TYPES } from "./constants";

type Link = { leadId?: string; dealId?: string; organizationId?: string; contactId?: string };
type Row = Activity & { assignee: Pick<User, "name"> | null; createdBy: Pick<User, "name"> };

/** Timeline of calls/visits/notes for a record, with a form to log or schedule one. */
export function ActivityPanel({
  activities,
  link,
  users,
}: {
  activities: Row[];
  link: Link;
  users: { id: string; name: string }[];
}) {
  const now = new Date();
  return (
    <div className="card space-y-4">
      <h2 className="font-semibold">Activity</h2>
      <ActionForm action={createActivity} className="space-y-3 rounded-lg bg-slate-50 p-3">
        {Object.entries(link).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <select name="type" defaultValue="CALL" className="input w-auto">
            <Options values={ACTIVITY_TYPES} labels={humanize} />
          </select>
          <input name="subject" required placeholder="What happened, or what's next?" className="input" />
        </div>
        <textarea name="body" rows={2} placeholder="Details (optional)" className="input" />
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Follow up on (leave empty to just log it)">
            <input name="dueAt" type="datetime-local" className="input w-auto" />
          </Field>
          <Field label="Assign to">
            <select name="assigneeId" defaultValue="" className="input w-auto">
              <option value="">Me</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <SubmitButton className="btn-primary">Save</SubmitButton>
        </div>
      </ActionForm>

      {activities.length === 0 ? (
        <p className="text-sm text-slate-500">No activity yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {activities.map((a) => {
            const overdue = !a.done && a.dueAt && a.dueAt < now;
            return (
              <li key={a.id} className="flex gap-3 py-3 text-sm">
                <form action={toggleActivity.bind(null, a.id)} className="pt-0.5">
                  <button
                    title={a.done ? "Mark as not done" : "Mark as done"}
                    className={`h-4 w-4 rounded border ${a.done ? "border-emerald-500 bg-emerald-500" : "border-slate-400 bg-white"}`}
                  />
                </form>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{humanize(a.type)}</Badge>
                    <span className={a.done && a.dueAt ? "text-slate-400 line-through" : "font-medium"}>{a.subject}</span>
                    {a.dueAt && (
                      <Badge color={a.done ? "gray" : overdue ? "red" : "amber"}>
                        {a.done ? "Done" : overdue ? "Overdue" : "Due"} {formatDateTime(a.dueAt)}
                      </Badge>
                    )}
                  </div>
                  {a.body && <p className="mt-1 whitespace-pre-wrap text-slate-600">{a.body}</p>}
                  <div className="mt-1 text-xs text-slate-400">
                    {a.createdBy.name} · {formatDateTime(a.createdAt)}
                    {a.assignee && a.assignee.name !== a.createdBy.name && ` · assigned to ${a.assignee.name}`}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export const activityInclude = {
  assignee: { select: { name: true } },
  createdBy: { select: { name: true } },
} as const;
