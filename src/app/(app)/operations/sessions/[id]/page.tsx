import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { canLogSession, canManageProgramme, findClashes, timeRange, trainerLeaveDays } from "@/lib/operations";
import { dateKey } from "@/lib/attendance";
import { deleteSession, logSession, reopenSession, updateSession } from "../../actions";
import { trainerOptions } from "../../data";
import { RescheduleForm, SessionBadge } from "../../ui";
import { SessionChecklists } from "../../../checklists/session-card";

export const metadata = { title: "Session" };

const OUTCOMES = [
  ["COMPLETED", "Held", "The class went ahead"],
  ["CANCELLED", "Cancelled", "Called off: exams, school event, holiday"],
  ["MISSED", "Missed", "Should have happened and didn't"],
] as const;

export default async function SessionPage({ params }: PageProps<"/operations/sessions/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const session = await db.programmeSession.findUnique({
    where: { id },
    include: {
      programme: { include: { organization: { select: { name: true, address: true, city: true } } } },
      trainer: { select: { id: true, name: true } },
      loggedBy: { select: { name: true } },
    },
  });
  if (!session) notFound();
  const today = todayIST();
  const canLog = canLogSession(user, session);
  const canManage = canManageProgramme(user, session.programme);

  const [sameDay, onLeave, trainers] = await Promise.all([
    session.trainerId ? db.programmeSession.findMany({ where: { trainerId: session.trainerId, date: session.date } }) : [],
    trainerLeaveDays(session.date, session.date),
    canManage ? trainerOptions() : [],
  ]);
  const clash = findClashes(sameDay).has(session.id);
  const trainerAway = session.trainerId && onLeave.has(`${session.trainerId}|${dateKey(session.date)}`);
  const due = session.status === "SCHEDULED" && session.date < today;
  const p = session.programme;

  return (
    <>
      <PageHeader
        title={`${p.organization.name}${session.classGroup ? ` · ${session.classGroup}` : ""}`}
        subtitle={
          <>
            {formatDate(session.date)} · {timeRange(session.startTime, session.durationMins)} · {session.trainer?.name ?? "No trainer"}{" "}
            <SessionBadge status={session.status} needsLog={due} />
          </>
        }
        actions={
          <>
            <Link href={`/operations/programmes/${p.id}`} className="btn-secondary">
              {p.name}
            </Link>
            <Link href="/operations" className="btn-secondary">
              Today
            </Link>
          </>
        }
      />

      {(clash || trainerAway) && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {clash && `${session.trainer?.name} has another class at the same time that day. `}
          {trainerAway && `${session.trainer?.name} has leave on this date. `}
          {canManage ? "Reassign the session below." : "Tell the programme coordinator."}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card min-w-0 lg:col-span-2">
          <h2 className="mb-1 font-semibold">Session log</h2>
          {session.loggedAt ? (
            <p className="mb-4 text-sm text-slate-500">
              Logged by {session.loggedBy?.name ?? "—"} on {formatDateTime(session.loggedAt)}.
            </p>
          ) : (
            <p className="mb-4 text-sm text-slate-500">Fill this in after the class. It goes into the school&apos;s report.</p>
          )}
          {canLog ? (
            <ActionForm action={logSession.bind(null, id)} className="space-y-4">
              <fieldset>
                <legend className="label">What happened? *</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {OUTCOMES.map(([value, label, hint]) => (
                    <label
                      key={value}
                      className="flex cursor-pointer gap-2 rounded-xl border border-slate-300 bg-white p-3 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
                    >
                      <input
                        type="radio"
                        name="status"
                        value={value}
                        required
                        defaultChecked={session.status === value || (session.status === "SCHEDULED" && value === "COMPLETED")}
                        className="mt-0.5 accent-brand-600"
                      />
                      <span>
                        <span className="font-medium">{label}</span>
                        <span className="block text-xs text-slate-500">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="Students present" className="sm:col-span-1">
                  <input type="number" name="studentsPresent" min={0} defaultValue={session.studentsPresent ?? ""} className="input" />
                </Field>
                <Field label="What was taught (needed when held)" className="sm:col-span-3">
                  <input
                    name="covered"
                    defaultValue={session.covered ?? session.topic ?? ""}
                    placeholder="e.g. Built and tested the line follower"
                    className="input"
                  />
                </Field>
              </div>
              <Field label="Notes (the reason, if cancelled or missed)" className="block">
                <textarea name="notes" rows={2} defaultValue={session.notes ?? ""} className="input" />
              </Field>
              <Field label="Issues for the coordinator" className="block">
                <textarea
                  name="issues"
                  rows={2}
                  defaultValue={session.issues ?? ""}
                  placeholder="Broken kit, missing laptops, a student who needs help…"
                  className="input"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <SubmitButton>{session.loggedAt ? "Update log" : "Save log"}</SubmitButton>
              </div>
            </ActionForm>
          ) : session.loggedAt ? (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-slate-500">Taught</dt>
                <dd>{session.covered ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Students present</dt>
                <dd>{session.studentsPresent ?? "—"}</dd>
              </div>
              {session.notes && (
                <div>
                  <dt className="text-slate-500">Notes</dt>
                  <dd>{session.notes}</dd>
                </div>
              )}
              {session.issues && (
                <div>
                  <dt className="text-slate-500">Issues</dt>
                  <dd>{session.issues}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Not logged yet. Only the trainer or the coordinator can log it.</p>
          )}
          {canLog && session.loggedAt && (
            <form action={reopenSession.bind(null, id)} className="mt-3">
              <button className="text-xs text-slate-500 hover:text-red-600">Clear the log and mark it scheduled again</button>
            </form>
          )}
        </section>

        <div className="space-y-6">
          <SessionChecklists user={user} session={session} />
          <section className="card text-sm">
            <h2 className="mb-3 font-semibold">Class</h2>
            <dl className="space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Planned topic</dt>
                <dd className="text-right">{session.topic ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Grades</dt>
                <dd className="text-right">{p.grades ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Where</dt>
                <dd className="text-right">{[p.organization.address, p.organization.city].filter(Boolean).join(", ") || "—"}</dd>
              </div>
            </dl>
            {p.notes && <p className="mt-3 border-t border-slate-100 pt-3 whitespace-pre-line text-slate-600">{p.notes}</p>}
          </section>

          {canManage && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Reschedule or reassign</h2>
              <RescheduleForm action={updateSession.bind(null, id)} trainers={trainers} session={session} />
              <form action={deleteSession.bind(null, id)} className="mt-4 border-t border-slate-100 pt-3">
                <button className="text-xs text-slate-500 hover:text-red-600">Delete this session</button>
              </form>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
