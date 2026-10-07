import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate, toDateInput } from "@/lib/format";
import { parseDateOnly } from "@/lib/leave";
import { todayIST } from "@/lib/time";
import { PrintButton } from "../../../../payroll/payslip/[id]/print-button";

export const metadata = { title: "School report" };

/** A progress report to send the school: what was taught, attendance and anything to follow up. */
export default async function ProgrammeReportPage({ params, searchParams }: PageProps<"/operations/programmes/[id]/report">) {
  await requireUser();
  const { id } = await params;
  const sp = (await searchParams) as Record<string, string | undefined>;
  const programme = await db.programme.findUnique({
    where: { id },
    include: {
      organization: { select: { name: true, city: true } },
      coordinator: { select: { name: true } },
      contact: { select: { name: true, designation: true } },
    },
  });
  if (!programme) notFound();

  const today = todayIST();
  let from = programme.startDate ?? new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  let to = today;
  try {
    if (sp.from) from = parseDateOnly(sp.from);
    if (sp.to) to = parseDateOnly(sp.to);
  } catch {}

  const sessions = await db.programmeSession.findMany({
    where: { programmeId: id, date: { gte: from, lte: to } },
    include: { trainer: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  const held = sessions.filter((s) => s.status === "COMPLETED");
  const withAttendance = held.filter((s) => s.studentsPresent != null);
  const avg = withAttendance.length
    ? Math.round(withAttendance.reduce((n, s) => n + s.studentsPresent!, 0) / withAttendance.length)
    : null;

  // One line per class.
  const classes = new Map<string, { held: number; cancelled: number; missed: number; present: number[] }>();
  for (const s of sessions) {
    const k = s.classGroup ?? "All classes";
    const c = classes.get(k) ?? { held: 0, cancelled: 0, missed: 0, present: [] };
    if (s.status === "COMPLETED") c.held++;
    if (s.status === "CANCELLED") c.cancelled++;
    if (s.status === "MISSED") c.missed++;
    if (s.status === "COMPLETED" && s.studentsPresent != null) c.present.push(s.studentsPresent);
    classes.set(k, c);
  }
  // Issues are written for the coordinator, so they only go in when asked for.
  const issues = sp.issues === "1" ? held.filter((s) => s.issues) : [];

  return (
    <>
      <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <Link href={`/operations/programmes/${id}`} className="btn-secondary">
          ← Back
        </Link>
        <label>
          <span className="label">From</span>
          <input type="date" name="from" defaultValue={toDateInput(from)} className="input" />
        </label>
        <label>
          <span className="label">To</span>
          <input type="date" name="to" defaultValue={toDateInput(to)} className="input" />
        </label>
        <label className="flex items-center gap-1.5 py-2 text-sm">
          <input type="checkbox" name="issues" value="1" defaultChecked={sp.issues === "1"} className="accent-brand-600" />
          Include issues raised
        </label>
        <button className="btn-secondary">Update</button>
        <PrintButton />
      </form>

      <article className="card mx-auto max-w-4xl space-y-6 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="text-xs font-semibold tracking-wider text-brand-700 uppercase">Edubotics Global · Programme report</div>
            <h1 className="mt-1 text-2xl font-semibold">{programme.organization.name}</h1>
            <p className="text-sm text-slate-600">
              {programme.name}
              {programme.grades && ` · ${programme.grades}`}
              {programme.academicYear && ` · ${programme.academicYear}`}
            </p>
          </div>
          <div className="text-right text-sm text-slate-600">
            <div>
              {formatDate(from)} to {formatDate(to)}
            </div>
            {programme.contact && (
              <div>
                For {programme.contact.name}
                {programme.contact.designation && `, ${programme.contact.designation}`}
              </div>
            )}
            <div>Coordinator: {programme.coordinator.name}</div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Sessions held", held.length],
            ["Cancelled", sessions.filter((s) => s.status === "CANCELLED").length],
            ["Still to come", sessions.filter((s) => s.status === "SCHEDULED").length],
            ["Average attendance", avg ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-brand-50 p-3">
              <div className="text-xs text-slate-600">{label}</div>
              <div className="text-xl font-semibold">{value}</div>
            </div>
          ))}
        </section>

        {classes.size > 0 && (
          <section>
            <h2 className="mb-2 font-semibold">By class</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Held</th>
                  <th>Cancelled</th>
                  <th>Missed</th>
                  <th>Avg. present</th>
                </tr>
              </thead>
              <tbody>
                {[...classes.entries()].map(([name, c]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{c.held}</td>
                    <td>{c.cancelled}</td>
                    <td>{c.missed}</td>
                    <td>{c.present.length ? Math.round(c.present.reduce((a, b) => a + b, 0) / c.present.length) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section>
          <h2 className="mb-2 font-semibold">What was taught</h2>
          {held.length === 0 ? (
            <p className="text-sm text-slate-500">No sessions held in this period.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Class</th>
                  <th>Topic</th>
                  <th>Present</th>
                  <th>Trainer</th>
                </tr>
              </thead>
              <tbody>
                {held.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap">{formatDate(s.date)}</td>
                    <td>{s.classGroup ?? "—"}</td>
                    <td>{s.covered}</td>
                    <td>{s.studentsPresent ?? "—"}</td>
                    <td>{s.trainer?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {issues.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold">Points to follow up</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {issues.map((s) => (
                <li key={s.id}>
                  {formatDate(s.date)}
                  {s.classGroup && `, ${s.classGroup}`}: {s.issues}
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </>
  );
}
