import Link from "next/link";
import { isManagerOrAdmin, type CurrentUser } from "@/lib/auth";
import { myChecklistsNow, teamFlags } from "@/lib/checklists";
import { todayIST } from "@/lib/time";
import { Progress, runHref, slotWhen } from "./ui";

/** Home: the user's checklists to tick now, and for managers, anything their team has let slip. */
export async function ChecklistsHomeCard({ user }: { user: CurrentUser }) {
  const today = todayIST();
  const manager = isManagerOrAdmin(user);
  const [mine, team] = await Promise.all([myChecklistsNow(user.id), manager ? teamFlags(user, today) : null]);
  const flagged = team ? team.overdue.length + team.missed.length : 0;
  if (!mine.open.length && !mine.doneNow.length && !mine.missed.length && !flagged) return null;

  return (
    <>
      {team && flagged > 0 && (
        <section className="card border-red-200 bg-red-50">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-red-900">Team checklists slipping</h2>
            <Link href="/checklists/team" className="link text-sm">
              Open
            </Link>
          </div>
          <ul className="space-y-1.5 text-sm">
            {[...team.overdue, ...team.missed].slice(0, 5).map((e) => (
              <li key={`${e.user.id}|${e.template.id}|${e.slot.periodKey}`} className="flex items-center justify-between gap-2">
                <Link href={runHref(e, e.user.id)} className="min-w-0 truncate hover:underline">
                  {e.user.name.split(" ")[0]} · {e.template.title}
                </Link>
                <span className="shrink-0 text-xs font-medium text-red-700">{e.status === "OVERDUE" ? "overdue" : "missed"}</span>
              </li>
            ))}
          </ul>
          {flagged > 5 && <p className="mt-1 text-xs text-red-800">and {flagged - 5} more</p>}
        </section>
      )}

      {(mine.open.length > 0 || mine.doneNow.length > 0 || mine.missed.length > 0) && (
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">My checklists</h2>
            <Link href="/checklists" className="link text-sm">
              All
            </Link>
          </div>
          {mine.open.length === 0 ? (
            <p className="text-sm text-slate-500">{mine.doneNow.length ? "All done for now." : "Nothing to tick right now."}</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {mine.open.slice(0, 5).map((e) => (
                <li key={`${e.template.id}|${e.slot.periodKey}`}>
                  <div className="flex items-center justify-between gap-2">
                    <Link href={runHref(e)} className="min-w-0 truncate font-medium hover:underline">
                      {e.template.title}
                    </Link>
                    <Progress done={e.run?.ticked ?? 0} total={e.total} />
                  </div>
                  <div className={`truncate text-xs ${e.status === "OVERDUE" ? "font-medium text-red-600" : "text-slate-500"}`}>
                    {e.status === "OVERDUE" && "Overdue · "}
                    {slotWhen(e, today)}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {mine.missed.length > 0 && (
            <p className="mt-2 text-xs text-red-600">
              {mine.missed.length} missed in the last week.
            </p>
          )}
        </section>
      )}
    </>
  );
}
