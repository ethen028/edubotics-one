import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Empty, PageHeader } from "@/components/ui";
import { formatDate, humanize } from "@/lib/format";
import { todayIST } from "@/lib/time";
import {
  PROGRAMME_STATUSES,
  canLogSession,
  canManageProgramme,
  findClashes,
  needsLogWhere,
  programmeProgress,
  sessionCounts,
  timeRange,
} from "@/lib/operations";
import { ProgressBar } from "../../../projects/ui";
import { addSessions, addTrainer, deleteProgramme, removeTrainer, setProgrammeStatus, updateProgramme } from "../../actions";
import { programmeFormOptions, trainerOptions } from "../../data";
import { OneSessionForm, ProgrammeBadge, ProgrammeForm, SessionBadge, WeeklySessionsForm } from "../../ui";

const PAGE = 15;

export default async function ProgrammePage({ params, searchParams }: PageProps<"/operations/programmes/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = (await searchParams) as Record<string, string | undefined>;
  const today = todayIST();

  const programme = await db.programme.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, city: true } },
      contact: { select: { name: true, phone: true, designation: true } },
      project: { select: { id: true, name: true } },
      coordinator: { select: { id: true, name: true } },
      trainers: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!programme) notFound();
  const canManage = canManageProgramme(user, programme);

  const [upcoming, past, counts, logsDue, attendance, trainers, options] = await Promise.all([
    db.programmeSession.findMany({
      where: { programmeId: id, date: { gte: today } },
      include: { trainer: { select: { id: true, name: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: sp.all === "1" ? undefined : PAGE,
    }),
    db.programmeSession.findMany({
      where: { programmeId: id, date: { lt: today } },
      include: { trainer: { select: { id: true, name: true } } },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
      take: sp.all === "1" ? undefined : PAGE,
    }),
    sessionCounts([id]).then((m) => m.get(id)!),
    db.programmeSession.count({ where: { programmeId: id, ...needsLogWhere(today) } }),
    db.programmeSession.aggregate({
      where: { programmeId: id, status: "COMPLETED", studentsPresent: { not: null } },
      _avg: { studentsPresent: true },
    }),
    canManage ? trainerOptions() : [],
    canManage ? programmeFormOptions(programme.projectId) : null,
  ]);
  const prog = programmeProgress(programme, { completed: counts.COMPLETED, total: counts.total });
  // Check the trainers' other schools too when looking for double-bookings.
  const window = upcoming.filter((s) => s.trainerId);
  const clashes = findClashes(
    window.length
      ? await db.programmeSession.findMany({
          where: {
            trainerId: { in: [...new Set(window.map((s) => s.trainerId!))] },
            date: { gte: today, lte: window[window.length - 1].date },
          },
        })
      : [],
  );
  const programmeRef = { coordinatorId: programme.coordinatorId };

  const sessionRow = (s: (typeof upcoming)[number], due = false) => (
    <tr key={s.id}>
      <td className="whitespace-nowrap">
        <div className="font-medium">{formatDate(s.date)}</div>
        <div className="text-xs text-slate-500">{timeRange(s.startTime, s.durationMins)}</div>
      </td>
      <td>{s.classGroup ?? "—"}</td>
      <td>
        {s.trainer?.name ?? <span className="text-amber-700">Not assigned</span>}
        {clashes.has(s.id) && <div className="text-xs font-medium text-red-600">Double-booked</div>}
      </td>
      <td className="max-w-xs">
        <div className="truncate">{s.covered ?? s.topic ?? "—"}</div>
        {s.studentsPresent != null && <div className="text-xs text-slate-500">{s.studentsPresent} present</div>}
      </td>
      <td>
        <SessionBadge status={s.status} needsLog={due && s.status === "SCHEDULED"} />
      </td>
      <td className="text-right">
        {canLogSession(user, { trainerId: s.trainerId, programme: programmeRef }) && (
          <Link href={`/operations/sessions/${s.id}`} className="link text-xs">
            {due && s.status === "SCHEDULED" ? "Log" : "Open"}
          </Link>
        )}
      </td>
    </tr>
  );

  return (
    <>
      <PageHeader
        title={programme.organization.name}
        subtitle={
          <>
            {programme.name}
            {programme.grades && ` · ${programme.grades}`}
            {programme.academicYear && ` · ${programme.academicYear}`}
            {" · "}
            <ProgrammeBadge status={programme.status} />
          </>
        }
        actions={
          <>
            <Link href="/operations/programmes" className="btn-secondary">
              All programmes
            </Link>
            <Link href={`/operations/programmes/${id}/report`} className="btn-secondary">
              School report
            </Link>
            {canManage && (
              <form action={setProgrammeStatus.bind(null, id)} className="flex gap-1">
                <select name="status" defaultValue={programme.status} className="input w-auto">
                  {PROGRAMME_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </select>
                <button className="btn-secondary">Set</button>
              </form>
            )}
            {isAdmin(user) && (
              <form action={deleteProgramme.bind(null, id)}>
                <button className="btn-danger">Delete</button>
              </form>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card">
          <div className="text-xs font-medium text-slate-500">Sessions held</div>
          <div className="mt-1 text-2xl font-semibold">
            {prog.completed} / {prog.planned}
          </div>
          <ProgressBar value={prog.pct} className="mt-2" />
        </div>
        <div className="card">
          <div className="text-xs font-medium text-slate-500">Still scheduled</div>
          <div className="mt-1 text-2xl font-semibold">{counts.SCHEDULED}</div>
          <div className="text-xs text-slate-500">
            {counts.CANCELLED} cancelled · {counts.MISSED} missed
          </div>
        </div>
        <div className="card">
          <div className="text-xs font-medium text-slate-500">Logs due</div>
          <div className={`mt-1 text-2xl font-semibold ${logsDue ? "text-red-600" : ""}`}>{logsDue}</div>
        </div>
        <div className="card">
          <div className="text-xs font-medium text-slate-500">Average attendance</div>
          <div className="mt-1 text-2xl font-semibold">
            {attendance._avg.studentsPresent != null ? Math.round(attendance._avg.studentsPresent) : "—"}
          </div>
          <div className="text-xs text-slate-500">{programme.students ? `of ${programme.students} enrolled` : "per session"}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section className="card">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Upcoming sessions</h2>
              {sp.all !== "1" && (upcoming.length === PAGE || past.length === PAGE) && (
                <Link href="?all=1" className="link text-sm">
                  Show all
                </Link>
              )}
            </div>
            {upcoming.length === 0 ? (
              <Empty>{canManage ? "Nothing scheduled. Add the weekly timetable below." : "Nothing scheduled."}</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Class</th>
                      <th>Trainer</th>
                      <th>Topic</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>{upcoming.map((s) => sessionRow(s))}</tbody>
                </table>
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className="card">
              <h2 className="mb-2 font-semibold">Past sessions</h2>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Class</th>
                      <th>Trainer</th>
                      <th>Taught</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>{past.map((s) => sessionRow(s, true))}</tbody>
                </table>
              </div>
            </section>
          )}

          {canManage && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Add to the timetable</h2>
              <WeeklySessionsForm action={addSessions.bind(null, id)} trainers={trainers} programme={programme} />
              <details className="mt-5 border-t border-slate-100 pt-4">
                <summary className="cursor-pointer text-sm font-medium text-brand-700">Add a single session instead</summary>
                <div className="mt-3">
                  <OneSessionForm action={addSessions.bind(null, id)} trainers={trainers} />
                </div>
              </details>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="card">
            <h2 className="mb-3 font-semibold">Trainers ({programme.trainers.length})</h2>
            {programme.trainers.length === 0 ? (
              <p className="text-sm text-slate-500">No trainers assigned yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {programme.trainers.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span>
                      {t.user.name}
                      {t.classes && <span className="text-slate-500"> · {t.classes}</span>}
                    </span>
                    {canManage && (
                      <form action={removeTrainer.bind(null, t.id)}>
                        <button className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <ActionForm action={addTrainer.bind(null, id)} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <select name="userId" className="input" defaultValue="">
                  <option value="">Assign a trainer…</option>
                  {trainers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <input name="classes" placeholder="Classes, e.g. Grades 3 to 5" className="input" />
                <SubmitButton className="btn-secondary btn-sm">Assign</SubmitButton>
              </ActionForm>
            )}
          </section>

          <section className="card text-sm">
            <h2 className="mb-3 font-semibold">Details</h2>
            <dl className="space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">School</dt>
                <dd className="text-right">
                  <Link href={`/crm/organizations/${programme.organization.id}`} className="link">
                    {programme.organization.name}
                  </Link>
                  {programme.organization.city && <div className="text-xs text-slate-500">{programme.organization.city}</div>}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">School contact</dt>
                <dd className="text-right">
                  {programme.contact ? (
                    <>
                      {programme.contact.name}
                      <div className="text-xs text-slate-500">
                        {[programme.contact.designation, programme.contact.phone].filter(Boolean).join(" · ")}
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Coordinator</dt>
                <dd>{programme.coordinator.name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Students</dt>
                <dd>{programme.students ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Runs</dt>
                <dd>
                  {formatDate(programme.startDate)} to {formatDate(programme.endDate)}
                </dd>
              </div>
              {programme.project && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Project</dt>
                  <dd className="text-right">
                    <Link href={`/projects/${programme.project.id}`} className="link">
                      {programme.project.name}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
            {programme.notes && <p className="mt-3 border-t border-slate-100 pt-3 whitespace-pre-line text-slate-600">{programme.notes}</p>}
          </section>
        </div>
      </div>

      {canManage && options && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">Edit programme details</summary>
          <div className="mt-3 max-w-3xl">
            <ProgrammeForm action={updateProgramme.bind(null, id)} programme={programme} {...options} />
          </div>
        </details>
      )}
    </>
  );
}
