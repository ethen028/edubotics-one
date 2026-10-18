import { isHrOrAdmin } from "@/lib/permissions";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { yearBounds } from "@/lib/leave";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, PageHeader, Stat } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { confirmHoliday, createHoliday, deleteHoliday } from "../actions";

export const metadata = { title: "Holidays" };

export default async function HolidaysPage({ searchParams }: PageProps<"/hr/holidays">) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayIST();
  const year = Number(sp.year) || today.getUTCFullYear();
  const holidays = await db.holiday.findMany({ where: { date: yearBounds(year) }, orderBy: { date: "asc" } });
  const admin = isHrOrAdmin(user);
  const nextHoliday = holidays.find((holiday) => holiday.date >= today);
  const companyDays = holidays.filter((holiday) => !holiday.optional).length;

  return (
    <>
      <PageHeader
        title={`Holidays ${year}`}
        subtitle="Plan your time away. Company holidays are excluded from leave-day calculations; restricted holidays are optional."
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
      <section className="holiday-hero" aria-label="Holiday overview">
        <div>
          <p className="eyebrow mb-3 text-[#b9daca]">People & culture · {year}</p>
          <h2 className="font-semibold">A little room to recharge.</h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-300">
            {nextHoliday ? <>Next on the calendar: <strong className="text-white">{nextHoliday.name}</strong>{nextHoliday.optional ? " · restricted holiday" : " · company holiday"}.</> : `No upcoming holidays listed for ${year}. Browse the year's dates below.`}
          </p>
          {nextHoliday?.tentative && <p className="mt-2 text-xs text-amber-200">Date is tentative and awaits official confirmation.</p>}
        </div>
        <div className="paper-date" aria-label={nextHoliday ? formatDate(nextHoliday.date) : String(year)}>
          <div className="paper-date-month">{nextHoliday ? nextHoliday.date.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }) : "Year"}</div>
          <div className="paper-date-day">{nextHoliday ? nextHoliday.date.getUTCDate() : String(year).slice(2)}</div>
          <div className="paper-date-weekday">{nextHoliday ? nextHoliday.date.toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" }) : year}</div>
        </div>
      </section>
      <div className="overview-stats mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Dates on the calendar" value={holidays.length} />
        <Stat label="Company holidays" value={companyDays} />
        <Stat label="Restricted holidays" value={holidays.length - companyDays} />
        <Stat label="Awaiting confirmation" value={holidays.filter((holiday) => holiday.tentative).length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className={`card overflow-x-auto p-0 ${admin ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <div className="ledger-heading">
            <h2 className="text-sm font-semibold">The year ahead</h2>
            <span className="eyebrow text-slate-500">{year} calendar</span>
          </div>
          {holidays.length === 0 ? (
            <div className="p-5">
              <Empty>No holidays listed for {year}.</Empty>
            </div>
          ) : (
            <table className="table">
              <caption className="sr-only">Company and restricted holidays for {year}</caption>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Holiday</th>
                  {admin && <th><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.id}>
                    <td><time dateTime={h.date.toISOString().slice(0, 10)} className="holiday-date"><b>{h.date.getUTCDate()}</b><span>{h.date.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</span></time></td>
                    <td>{h.date.toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" })}</td>
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
            <h2 className="font-semibold">Add holiday</h2>
            <p className="text-xs leading-relaxed text-slate-500">Keep the shared calendar up to date. Tentative dates can be confirmed after the official announcement.</p>
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
