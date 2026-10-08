import Link from "next/link";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { todayIST } from "@/lib/time";
import { myChecklistsNow } from "@/lib/checklists";
import { ChecklistTabs, EntryRow } from "./ui";

export const metadata = { title: "My checklists" };

export default async function MyChecklistsPage() {
  const user = await requireUser();
  const manager = isManagerOrAdmin(user);
  const today = todayIST();
  const { open, doneNow, missed } = await myChecklistsNow(user.id);

  return (
    <>
      <PageHeader
        title="Checklists"
        subtitle="Routines to tick off: office opening, kit checks before a class, month-end and the rest."
        actions={
          manager && (
            <Link href="/checklists/templates/new" className="btn-primary">
              New checklist
            </Link>
          )
        }
      />
      <ChecklistTabs current="mine" manager={manager} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="card min-w-0 lg:col-span-2">
          <h2 className="mb-1 font-semibold">To do</h2>
          {open.length === 0 ? (
            <p className="py-2 text-sm text-slate-500">
              {doneNow.length ? "All done. Nice work." : "Nothing on your list right now."}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {open.map((e) => (
                <EntryRow key={`${e.template.id}|${e.slot.periodKey}`} e={e} today={today} />
              ))}
            </ul>
          )}
          {doneNow.length > 0 && (
            <>
              <h2 className="mt-5 mb-1 font-semibold">Done</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {doneNow.map((e) => (
                  <EntryRow key={`${e.template.id}|${e.slot.periodKey}`} e={e} today={today} />
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card">
          <h2 className="mb-1 font-semibold">Missed in the last week</h2>
          <p className="mb-2 text-xs text-slate-500">Your manager sees these too.</p>
          {missed.length === 0 ? (
            <p className="text-sm text-slate-500">None. Keep it up.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {missed.map((e) => (
                <EntryRow key={`${e.template.id}|${e.slot.periodKey}`} e={e} today={today} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {open.length + doneNow.length + missed.length === 0 && manager && (
        <div className="mt-6">
          <Empty>
            No checklists are set up for you yet.{" "}
            <Link href="/checklists/templates/new" className="link">
              Set one up
            </Link>{" "}
            for yourself or your team.
          </Empty>
        </div>
      )}
    </>
  );
}
