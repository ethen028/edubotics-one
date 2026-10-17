import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { yearBounds } from "@/lib/leave";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, PageHeader, Stat } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { confirmHoliday, createHoliday, deleteHoliday } from "../actions";

export const metadata = { title: "Holidays" };

export default async function HolidaysPage({ searchParams }: PageProps<"/hr/holidays">) {
  const user = await requireUser();
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();
  const holidays = await db.holiday.findMany({ where: { date: yearBounds(year) }, orderBy: { date: "asc" } });
  const admin = isAdmin(user);
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const next = holidays.find((h) => h.date >= today);
  const day = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-IN", { ...o, timeZone: "UTC" });

  return (
    <>
      <PageHeader
        title={`Holidays ${year}`}
        subtitle="Plan your time away. Company holidays are skipped when counting leave days; restricted holidays are optional."
        actions={
          <>
            <a href={`?year=${year - 1}`} className="btn-secondary">
              ← {year - 1}
            </a>
            <a href={`?year=${year + 1}`} className="btn-secondary">
              {year + 1} →
            </a>
          </>
        }
      />
      <section className="hero-card mb-6 flex flex-wrap items-center justify-between gap-6 p-6 text-white md:p-8">
        <div className="max-w-xl">
          <div className="text-[11px] font-semibold tracking-widest text-mint/80 uppercase">People &amp; culture · {year}</div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">A little room to recharge.</h2>
          {next ? (
            <>
              <p className="mt-3 text-sm text-white/80">
                Next on the calendar: <strong className="text-white">{next.name}</strong> ·{" "}
                {next.optional ? "restricted holiday" : "company holiday"}
              </p>
              {next.tentative && (
                <p className="mt-1 text-xs font-medium text-amber-200">
                  The date is tentative until the government confirms it.
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-white/80">No more holidays listed for {year}.</p>
          )}
        </div>
        {next && (
          <div className="cal-tile rotate-3">
            <div className="cal-tile-month">{day(next.date, { month: "short" })}</div>
            <div className="py-2 text-4xl font-bold">{day(next.date, { day: "numeric" })}</div>
            <div className="pb-2 text-xs text-slate-500">{day(next.date, { weekday: "long" })}</div>
          </div>
        )}
      </section>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Dates on the calendar" value={holidays.length} />
        <Stat label="Company holidays" value={holidays.filter((h) => !h.optional).length} />
        <Stat label="Restricted holidays" value={holidays.filter((h) => h.optional).length} />
        <Stat label="Waiting for confirmation" value={holidays.filter((h) => h.tentative).length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className={`card overflow-x-auto p-0 ${admin ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <h2 className="font-semibold">The year ahead</h2>
            <span className="text-xs font-semibold tracking-widest text-slate-500 uppercase">{year} calendar</span>
          </div>
          {holidays.length === 0 ? (
            <div className="p-5">
              <Empty>No holidays listed for {year}.</Empty>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Holiday</th>
                  {admin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <span className="date-chip" title={formatDate(h.date)}>
                        <span className="text-base font-bold">{day(h.date, { day: "numeric" })}</span>
                        <span className="mt-0.5 text-[10px] font-semibold text-slate-500 uppercase">{day(h.date, { month: "short" })}</span>
                      </span>
                    </td>
                    <td>{day(h.date, { weekday: "long" })}</td>
                    <td>
                      {h.name} {h.optional && <Badge color="purple">Restricted</Badge>}{" "}
                      {h.tentative && <Badge color="amber">Tentative</Badge>}
                    </td>
                    {admin && (
                      <td>
                        <div className="flex justify-end gap-2">
                          {h.tentative && (
                            <form action={confirmHoliday.bind(null, h.id)}>
                              <button className="btn-secondary btn-sm">Confirm date</button>
                            </form>
                          )}
                          <form action={deleteHoliday.bind(null, h.id)}>
                            <button className="btn-danger btn-sm">Remove</button>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {admin && (
          <ActionForm action={createHoliday} className="card space-y-3 self-start">
            <div>
              <h2 className="font-semibold">Add holiday</h2>
              <p className="mt-1 text-sm text-slate-500">
                Keep the shared calendar up to date. Tentative dates can be confirmed once the government announces them.
              </p>
            </div>
            <Field label="Date" className="block">
              <input name="date" type="date" required className="input" />
            </Field>
            <Field label="Name" className="block">
              <input name="name" required className="input" placeholder="Onam" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="optional" /> Restricted (optional) holiday
            </label>
            <SubmitButton>Add</SubmitButton>
          </ActionForm>
        )}
      </div>
    </>
  );
}
