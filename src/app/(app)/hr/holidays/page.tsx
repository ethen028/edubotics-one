import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { yearBounds } from "@/lib/leave";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { confirmHoliday, createHoliday, deleteHoliday } from "../actions";

export const metadata = { title: "Holidays" };

export default async function HolidaysPage({ searchParams }: PageProps<"/hr/holidays">) {
  const user = await requireUser();
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();
  const holidays = await db.holiday.findMany({ where: { date: yearBounds(year) }, orderBy: { date: "asc" } });
  const admin = isAdmin(user);

  return (
    <>
      <PageHeader
        title={`Holidays ${year}`}
        subtitle="Company holidays are skipped when counting leave days. Restricted holidays are optional. Tentative dates depend on the moon or the official notification: confirm or change them when the government announces them."
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
      <div className="grid gap-6 lg:grid-cols-3">
        <div className={`card overflow-x-auto p-0 ${admin ? "lg:col-span-2" : "lg:col-span-3"}`}>
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
                    <td>{formatDate(h.date)}</td>
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
