import type { Programme, ProgrammeSession, ProgrammeStatus, SessionStatus } from "@prisma/client";
import { ActionForm, SubmitButton, type FormState } from "@/components/action-form";
import { Badge, Field } from "@/components/ui";
import { humanize, toDateInput } from "@/lib/format";
import { PROGRAMME_STATUSES, WEEKDAYS, programmeStatusColor, sessionStatusColor } from "@/lib/operations";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Option = { id: string; name: string };

export function SessionBadge({ status, needsLog }: { status: SessionStatus; needsLog?: boolean }) {
  if (needsLog) return <Badge color="red">Log due</Badge>;
  return <Badge color={sessionStatusColor[status]}>{status === "COMPLETED" ? "Held" : humanize(status)}</Badge>;
}

export function ProgrammeBadge({ status }: { status: ProgrammeStatus }) {
  return <Badge color={programmeStatusColor[status]}>{humanize(status)}</Badge>;
}

/** Time, class, trainer and topic: shared by "add sessions" and "reschedule". */
function SlotFields({ trainers, session }: { trainers: Option[]; session?: ProgrammeSession }) {
  return (
    <>
      <Field label="Start time *" className="sm:col-span-2">
        <input type="time" name="startTime" required defaultValue={session?.startTime ?? "10:00"} className="input" />
      </Field>
      <Field label="Minutes *" className="sm:col-span-2">
        <input type="number" name="durationMins" required min={10} max={480} step={5} defaultValue={session?.durationMins ?? 45} className="input" />
      </Field>
      <Field label="Class" className="sm:col-span-2">
        <input name="classGroup" defaultValue={session?.classGroup ?? ""} placeholder="e.g. Grade 5 A" className="input" />
      </Field>
      <Field label="Trainer" className="sm:col-span-3">
        <select name="trainerId" defaultValue={session?.trainerId ?? ""} className="input">
          <option value="">Not assigned yet</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Planned topic" className="sm:col-span-3">
        <input name="topic" defaultValue={session?.topic ?? ""} placeholder="e.g. Line follower robot" className="input" />
      </Field>
    </>
  );
}

export function WeeklySessionsForm({ action, trainers, programme }: { action: Action; trainers: Option[]; programme: Programme }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="repeat" value="weekly" />
      <div className="grid gap-3 sm:grid-cols-6">
        <Field label="From *" className="sm:col-span-3">
          <input type="date" name="from" required defaultValue={toDateInput(programme.startDate)} className="input" />
        </Field>
        <Field label="To *" className="sm:col-span-3">
          <input type="date" name="to" required defaultValue={toDateInput(programme.endDate)} className="input" />
        </Field>
        <div className="sm:col-span-6">
          <span className="label">Every</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map(([n, label]) => (
              <label key={n} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
                <input type="checkbox" name="weekday" value={n} className="accent-brand-600" />
                {label}
              </label>
            ))}
          </div>
        </div>
        <SlotFields trainers={trainers} />
      </div>
      <p className="mt-2 text-xs text-slate-500">Holidays on the HR calendar are skipped. Add one row per class and period.</p>
      <div className="mt-3">
        <SubmitButton>Add to timetable</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function OneSessionForm({ action, trainers }: { action: Action; trainers: Option[] }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-6">
        <Field label="Date *" className="sm:col-span-6">
          <input type="date" name="date" required className="input" />
        </Field>
        <SlotFields trainers={trainers} />
      </div>
      <div className="mt-3">
        <SubmitButton className="btn-secondary">Add session</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function RescheduleForm({ action, trainers, session }: { action: Action; trainers: Option[]; session: ProgrammeSession }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-6">
        <Field label="Date *" className="sm:col-span-6">
          <input type="date" name="date" required defaultValue={toDateInput(session.date)} className="input" />
        </Field>
        <SlotFields trainers={trainers} session={session} />
      </div>
      <div className="mt-3">
        <SubmitButton className="btn-secondary">Save changes</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ProgrammeForm({
  action,
  programme,
  defaults,
  users,
  schools,
  contacts,
  projects,
}: {
  action: Action;
  programme?: Programme;
  defaults?: Partial<Programme>;
  users: Option[];
  schools: Option[];
  contacts: (Option & { organizationName: string | null })[];
  projects: Option[];
}) {
  const v = { ...defaults, ...programme };
  return (
    <ActionForm action={action} className="card space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="School *">
          <select name="organizationId" required defaultValue={v.organizationId ?? ""} className="input">
            <option value="">Pick a school…</option>
            {schools.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Programme name *">
          <input name="name" required defaultValue={v.name} placeholder="e.g. Robotics & Coding" className="input" />
        </Field>
        <Field label="Academic year">
          <input name="academicYear" defaultValue={v.academicYear ?? ""} placeholder="2026-27" className="input" />
        </Field>
        <Field label="Grades">
          <input name="grades" defaultValue={v.grades ?? ""} placeholder="e.g. Grades 3 to 8" className="input" />
        </Field>
        <Field label="Students">
          <input type="number" min={0} name="students" defaultValue={v.students ?? ""} className="input" />
        </Field>
        <Field label="Sessions agreed for the year">
          <input type="number" min={0} name="sessionsPlanned" defaultValue={v.sessionsPlanned ?? ""} className="input" />
        </Field>
        <Field label="Starts">
          <input type="date" name="startDate" defaultValue={toDateInput(v.startDate)} className="input" />
        </Field>
        <Field label="Ends">
          <input type="date" name="endDate" defaultValue={toDateInput(v.endDate)} className="input" />
        </Field>
        <Field label="Coordinator (Edubotics) *">
          <select name="coordinatorId" required defaultValue={v.coordinatorId ?? ""} className="input">
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="School contact">
          <select name="contactId" defaultValue={v.contactId ?? ""} className="input">
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.organizationName && ` · ${c.organizationName}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Delivery project">
          <select name="projectId" defaultValue={v.projectId ?? ""} className="input">
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={v.status ?? "PLANNED"} className="input">
            {PROGRAMME_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea name="notes" rows={3} defaultValue={v.notes ?? ""} placeholder="Lab room, kit set used, school timings…" className="input" />
        </Field>
      </div>
      <SubmitButton>{programme ? "Save programme" : "Create programme"}</SubmitButton>
    </ActionForm>
  );
}
