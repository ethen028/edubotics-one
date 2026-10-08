import Link from "next/link";
import { db } from "@/lib/db";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { checklistEntries, tally, teamUserIds, type Entry } from "@/lib/checklists";
import { ChecklistStatusBadge, ChecklistTabs, runHref } from "../ui";

export const metadata = { title: "Checklist history" };

const DAY = 86_400_000;
const RANGES = [7, 30, 90] as const;

function Summary({ title, groups }: { title: string; groups: [string, Entry[]][] }) {
  return (
    <section className="card overflow-x-auto p-0">
      <h2 className="px-4 pt-4 pb-2 font-semibold">{title}</h2>
      <table className="w-full text-sm">
        <thead className="border-y border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium" />
            <th className="px-4 py-2 font-medium">On time</th>
            <th className="px-4 py-2 font-medium">Late</th>
            <th className="px-4 py-2 font-medium">Missed</th>
            <th className="px-4 py-2 font-medium">On time %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {groups.map(([name, list]) => {
            const t = tally(list);
            return (
              <tr key={name}>
                <td className="px-4 py-2 font-medium">{name}</td>
                <td className="px-4 py-2">{t.done}</td>
                <td className={`px-4 py-2 ${t.late ? "text-amber-700" : "text-slate-400"}`}>{t.late}</td>
                <td className={`px-4 py-2 ${t.missed ? "font-medium text-red-600" : "text-slate-400"}`}>{t.missed}</td>
                <td className="px-4 py-2">{t.onTimePct === null ? "–" : `${t.onTimePct}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

const groupBy = (entries: Entry[], key: (e: Entry) => string) => {
  const m = new Map<string, Entry[]>();
  for (const e of entries) m.set(key(e), [...(m.get(key(e)) ?? []), e]);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
};

export default async function ChecklistHistoryPage({ searchParams }: PageProps<"/checklists/history">) {
  const user = await requireUser();
  const manager = isManagerOrAdmin(user);
  const sp = (await searchParams) as Record<string, string | undefined>;
  const today = todayIST();
  const now = new Date();

  const team = await teamUserIds(user);
  const visible = [...new Set([user.id, ...team])];
  const [people, templates] = await Promise.all([
    db.user.findMany({ where: { id: { in: visible } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.checklistTemplate.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } }),
  ]);
  const person = sp.person === "all" && manager ? "all" : visible.includes(sp.person ?? "") ? sp.person! : manager ? "all" : user.id;
  const checklist = templates.find((t) => t.id === sp.checklist)?.id;
  const days = RANGES.find((r) => String(r) === sp.days) ?? 30;
  const from = new Date(today.getTime() - (days - 1) * DAY);

  const entries = (
    await checklistEntries({ userIds: person === "all" ? visible : [person], from, to: today, templateId: checklist, now })
  )
    // History is what has been due: drop slots that haven't opened, and periods that started before the range.
    .filter((e) => e.status !== "UPCOMING" && e.slot.dueDate >= from && e.slot.dueDate <= today)
    .reverse();

  const query = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { person: sp.person, checklist: sp.checklist, days: sp.days, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `?${q}`;
  };

  return (
    <>
      <PageHeader title="Checklist history" subtitle="Who ticked what and when, and what was missed." />
      <ChecklistTabs current="history" manager={manager} />

      <form className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        {people.length > 1 && (
          <label>
            <span className="label">Person</span>
            <select name="person" defaultValue={person} className="input">
              {manager && <option value="all">Everyone</option>}
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="label">Checklist</span>
          <select name="checklist" defaultValue={checklist ?? ""} className="input">
            <option value="">All checklists</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Period</span>
          <select name="days" defaultValue={days} className="input">
            {RANGES.map((r) => (
              <option key={r} value={r}>
                Last {r} days
              </option>
            ))}
          </select>
        </label>
        <button className="btn-secondary">Show</button>
      </form>

      {entries.length === 0 ? (
        <Empty>Nothing was due in this period.</Empty>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {person === "all" && <Summary title="By person" groups={groupBy(entries, (e) => e.user.name)} />}
            <Summary title="By checklist" groups={groupBy(entries, (e) => e.template.title)} />
          </div>

          <section className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Due</th>
                  <th className="px-4 py-2 font-medium">Checklist</th>
                  {person === "all" && <th className="px-4 py-2 font-medium">Person</th>}
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Ticked</th>
                  <th className="px-4 py-2 font-medium">Finished</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.slice(0, 500).map((e) => (
                  <tr key={`${e.user.id}|${e.template.id}|${e.slot.periodKey}`}>
                    <td className="px-4 py-2 whitespace-nowrap">{formatDate(e.slot.dueDate)}</td>
                    <td className="px-4 py-2">
                      <Link href={runHref(e, e.user.id === user.id ? undefined : e.user.id)} className="hover:underline">
                        {e.template.title}
                      </Link>
                      {e.session && (
                        <span className="text-xs text-slate-500">
                          {" "}
                          · {e.session.school}
                          {e.session.classGroup && ` ${e.session.classGroup}`}
                        </span>
                      )}
                    </td>
                    {person === "all" && (
                      <td className="px-4 py-2">
                        <Link href={query({ person: e.user.id })} className="hover:underline">
                          {e.user.name}
                        </Link>
                      </td>
                    )}
                    <td className="px-4 py-2">
                      <ChecklistStatusBadge status={e.status} />
                    </td>
                    <td className="px-4 py-2 tabular-nums">
                      {Math.min(e.run?.ticked ?? 0, e.total)}/{e.total}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{e.run?.completedAt ? formatDateTime(e.run.completedAt) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </>
  );
}
