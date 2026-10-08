import Link from "next/link";
import type { CurrentUser } from "@/lib/auth";
import { checklistEntries, teamUserIds } from "@/lib/checklists";
import { ChecklistStatusBadge, Progress, runHref } from "./ui";

/** On a school session: the trainer's "before the class" checklists, like the kit check. */
export async function SessionChecklists({
  user,
  session,
}: {
  user: CurrentUser;
  session: { id: string; date: Date; trainerId: string | null; status: string };
}) {
  if (session.status === "CANCELLED") return null;
  const team = await teamUserIds(user);
  const ids = [...new Set([session.trainerId, user.id, ...team].filter((x): x is string => !!x))];
  const entries = (await checklistEntries({ userIds: ids, from: session.date, to: session.date })).filter(
    (e) => e.slot.sessionId === session.id,
  );
  if (entries.length === 0) return null;

  return (
    <section className="card">
      <h2 className="mb-2 font-semibold">Before the class</h2>
      <ul className="space-y-2 text-sm">
        {entries.map((e) => {
          const canOpen = e.user.id === user.id || team.includes(e.user.id);
          return (
            <li key={`${e.user.id}|${e.template.id}`} className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">
                {canOpen ? (
                  <Link href={runHref(e, e.user.id === user.id ? undefined : e.user.id)} className="font-medium hover:underline">
                    {e.template.title}
                  </Link>
                ) : (
                  <span className="font-medium">{e.template.title}</span>
                )}
                {e.user.id !== user.id && <span className="text-slate-500"> · {e.user.name.split(" ")[0]}</span>}
              </span>
              <span className="flex items-center gap-2">
                <Progress done={Math.min(e.run?.ticked ?? 0, e.total)} total={e.total} />
                <ChecklistStatusBadge status={e.status} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
