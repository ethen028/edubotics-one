import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { todayIST } from "@/lib/time";
import { checklistEntries, tally, teamUserIds } from "@/lib/checklists";
import { ChecklistTabs, ChecklistStatusBadge, EntryRow, runHref } from "../ui";

export const metadata = { title: "Team checklists" };

const DAY = 86_400_000;

export default async function TeamChecklistsPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const today = todayIST();
  const now = new Date();
  const ids = (await teamUserIds(user)).filter((id) => id !== user.id);
  const [entries, people] = await Promise.all([
    checklistEntries({ userIds: ids, from: new Date(today.getTime() - 7 * DAY), to: today, now }),
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const overdue = entries.filter((e) => e.status === "OVERDUE");
  const missed = entries.filter((e) => e.status === "MISSED").reverse();
  // Today's slots: anything open now, or due today.
  const current = entries.filter((e) => e.slot.opensAt <= now && e.slot.closesAt > now);

  return (
    <>
      <PageHeader
        title="Team checklists"
        subtitle={user.role === "ADMIN" ? "Everyone's checklists today, and anything overdue or missed." : "Your team's checklists today, and anything overdue or missed."}
      />
      <ChecklistTabs current="team" manager />

      {ids.length === 0 ? (
        <Empty>Nobody reports to you in HR yet, so there is no team to show. An admin can set managers on each person&apos;s profile.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <section className="card">
              <h2 className="mb-1 font-semibold">Overdue now</h2>
              {overdue.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing overdue.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {overdue.map((e) => (
                    <EntryRow key={`${e.user.id}|${e.template.id}|${e.slot.periodKey}`} e={e} today={today} showPerson userId={e.user.id} />
                  ))}
                </ul>
              )}
            </section>

            <section className="card overflow-x-auto p-0">
              <h2 className="px-4 pt-4 pb-2 font-semibold">By person</h2>
              <table className="w-full text-sm">
                <thead className="border-y border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Person</th>
                    <th className="px-4 py-2 font-medium">Open now</th>
                    <th className="px-4 py-2 font-medium">Last 7 days on time</th>
                    <th className="px-4 py-2 font-medium">Missed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {people.map((p) => {
                    const mine = current.filter((e) => e.user.id === p.id);
                    const week = tally(entries.filter((e) => e.user.id === p.id));
                    return (
                      <tr key={p.id} className="align-top">
                        <td className="px-4 py-2">
                          <Link href={`/checklists/history?person=${p.id}`} className="font-medium hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          {mine.length === 0 ? (
                            <span className="text-slate-400">None</span>
                          ) : (
                            <ul className="space-y-1">
                              {mine.map((e) => (
                                <li key={`${e.template.id}|${e.slot.periodKey}`} className="flex items-center gap-2">
                                  <Link href={runHref(e, p.id)} className="truncate hover:underline">
                                    {e.template.title}
                                  </Link>
                                  <ChecklistStatusBadge status={e.status} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {week.onTimePct === null ? <span className="text-slate-400">–</span> : `${week.onTimePct}% (${week.done} of ${week.total})`}
                        </td>
                        <td className={`px-4 py-2 tabular-nums ${week.missed ? "font-medium text-red-600" : "text-slate-400"}`}>{week.missed}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </div>

          <section className="card">
            <h2 className="mb-1 font-semibold">Missed in the last week</h2>
            {missed.length === 0 ? (
              <p className="text-sm text-slate-500">None missed.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {missed.map((e) => (
                  <EntryRow key={`${e.user.id}|${e.template.id}|${e.slot.periodKey}`} e={e} today={today} showPerson userId={e.user.id} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
