import Link from "next/link";
import { Badge } from "@/components/ui";
import { STATUS_COLOR, STATUS_LABEL, clock, dayWord, dueLabel, type SlotStatus } from "@/lib/checklist-schedule";
import type { Entry } from "@/lib/checklists";

export function ChecklistStatusBadge({ status }: { status: SlotStatus }) {
  return <Badge color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Badge>;
}

export const runHref = (e: Pick<Entry, "template" | "slot">, userId?: string) =>
  `/checklists/run/${e.template.id}/${e.slot.periodKey}${userId ? `?user=${userId}` : ""}`;

/** Tabs across the checklist pages. */
export function ChecklistTabs({ current, manager }: { current: "mine" | "team" | "history" | "setup"; manager: boolean }) {
  const tabs = [
    ["mine", "My checklists", "/checklists"],
    ...(manager ? [["team", "Team today", "/checklists/team"] as const] : []),
    ["history", "History", "/checklists/history"],
    ...(manager ? [["setup", "Set up checklists", "/checklists/templates"] as const] : []),
  ] as const;
  return (
    <div className="mb-4 flex flex-wrap gap-2 text-sm">
      {tabs.map(([key, label, href]) => (
        <Link key={key} href={href} className={current === key ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
          {label}
        </Link>
      ))}
    </div>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 tabular-nums">
        {done}/{total}
      </span>
    </div>
  );
}

/** What the slot is for: the school session, or when it's due. */
export function slotWhen(e: Entry, today: Date) {
  if (e.session) {
    return `${e.session.school}${e.session.classGroup ? ` · ${e.session.classGroup}` : ""} · class ${clock(e.session.startTime)} ${dayWord(e.slot.dueDate, today)}`;
  }
  return `Due ${dueLabel(e.slot, e.template.dueTime, today)}`;
}

/** One row in a list of checklists: title, what it's for, progress and status. */
export function EntryRow({ e, today, showPerson, userId }: { e: Entry; today: Date; showPerson?: boolean; userId?: string }) {
  const done = e.status === "DONE" || e.status === "LATE" ? Math.max(e.run?.ticked ?? 0, e.total) : (e.run?.ticked ?? 0);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
      <div className="min-w-0 flex-1">
        <Link href={runHref(e, userId)} className="block truncate font-medium hover:underline">
          {showPerson && <span className="text-slate-500">{e.user.name} · </span>}
          {e.template.title}
        </Link>
        <div className="truncate text-xs text-slate-500">{slotWhen(e, today)}</div>
      </div>
      <Progress done={Math.min(done, e.total)} total={e.total} />
      <ChecklistStatusBadge status={e.status} />
    </li>
  );
}
