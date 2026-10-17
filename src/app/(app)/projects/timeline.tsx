import Link from "next/link";
import { formatDate } from "@/lib/format";

const DAY = 86400000;

export type TimelineTone = "todo" | "active" | "review" | "done" | "late" | "blocked";

export type TimelineRow = {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  start: Date | null;
  end: Date | null;
  tone: TimelineTone;
  /** Indent subtasks under their main task. */
  indent?: boolean;
  /** 0–100, drawn as the filled part of the bar. */
  progress?: number;
};

export type TimelineMarker = { id: string; label: string; date: Date; done: boolean };

const toneBar: Record<TimelineTone, string> = {
  todo: "bg-slate-300",
  active: "bg-brand-600",
  review: "bg-violet-500",
  done: "bg-emerald-500",
  late: "bg-red-500",
  blocked: "bg-red-400",
};

const toneLabel: [TimelineTone, string][] = [
  ["todo", "To do"],
  ["active", "In progress"],
  ["review", "Review"],
  ["done", "Done"],
  ["late", "Overdue"],
  ["blocked", "Blocked"],
];

/** Picks the tone for a task or project bar. */
export function toneOf(status: string, end: Date | null, today: Date, blocked = false): TimelineTone {
  if (status === "DONE" || status === "COMPLETE") return "done";
  if (blocked) return "blocked";
  if (end && end < today) return "late";
  if (status === "REVIEW" || status === "APPROVAL") return "review";
  if (status === "TODO" || status === "CREATE" || status === "ASSIGN" || status === "PLAN") return "todo";
  return "active";
}

/**
 * Task Flow v5's Timeline: one bar per task (or project) from its start to its due date, milestones as diamonds and a
 * line for today. Rows with only a due date show as a short bar ending on it; rows with no dates are listed underneath.
 */
export function Timeline({ rows, markers = [], today }: { rows: TimelineRow[]; markers?: TimelineMarker[]; today: Date }) {
  const dated = rows.filter((r) => r.start || r.end);
  const undated = rows.filter((r) => !r.start && !r.end);
  if (dated.length === 0 && markers.length === 0) {
    return <p className="text-sm text-slate-500">Give tasks a start or due date to see them on the timeline.</p>;
  }

  const times = [today.getTime(), ...dated.flatMap((r) => [r.start, r.end]).filter(Boolean).map((d) => d!.getTime()), ...markers.map((m) => m.date.getTime())];
  const first = new Date(Math.min(...times) - 2 * DAY);
  const last = new Date(Math.max(...times) + 3 * DAY);
  const span = last.getTime() - first.getTime();
  const pos = (d: Date) => ((d.getTime() - first.getTime()) / span) * 100;

  // Month starts (or week starts for short ranges) as grid lines.
  const ticks: Date[] = [];
  const short = span < 70 * DAY;
  const t = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), short ? first.getUTCDate() : 1));
  while (t <= last) {
    if (t >= first) ticks.push(new Date(t));
    if (short) t.setUTCDate(t.getUTCDate() + 7);
    else t.setUTCMonth(t.getUTCMonth() + 1);
  }
  const tickLabel = (d: Date) =>
    d.toLocaleDateString("en-IN", short ? { day: "numeric", month: "short", timeZone: "UTC" } : { month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="flex text-[11px] text-slate-400">
            <div className="w-44 shrink-0" />
            <div className="relative h-5 flex-1">
              {ticks.map((d) => (
                <span key={d.getTime()} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${pos(d)}%` }}>
                  {tickLabel(d)}
                </span>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 right-0 left-44">
              {ticks.map((d) => (
                <span key={d.getTime()} className="absolute inset-y-0 w-px bg-slate-100" style={{ left: `${pos(d)}%` }} />
              ))}
              <span className="absolute inset-y-0 w-0.5 bg-amber-400" style={{ left: `${pos(today)}%` }} title="Today" />
            </div>

            {markers.length > 0 && (
              <div className="flex items-center border-b border-slate-100 py-1.5">
                <div className="w-44 shrink-0 pr-3 text-xs font-medium text-slate-500">Milestones</div>
                <div className="relative h-5 flex-1">
                  {markers.map((m) => (
                    <span
                      key={m.id}
                      className={`absolute top-1 h-3 w-3 -translate-x-1/2 rotate-45 ${m.done ? "bg-emerald-500" : "bg-amber-500"}`}
                      style={{ left: `${pos(m.date)}%` }}
                      title={`${m.label} · ${formatDate(m.date)}${m.done ? " · done" : ""}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {dated.map((r) => {
              const start = r.start ?? new Date(r.end!.getTime() - DAY);
              const end = r.end ?? start;
              const left = pos(start);
              const width = Math.max(pos(new Date(end.getTime() + DAY)) - left, 0.8);
              return (
                <div key={r.id} className="flex items-center py-1">
                  <div className={`w-44 shrink-0 truncate pr-3 text-xs ${r.indent ? "pl-4 text-slate-600" : "font-medium text-slate-800"}`}>
                    <Link href={r.href} className="hover:underline" title={r.label}>
                      {r.indent && "↳ "}
                      {r.label}
                    </Link>
                    {r.sublabel && <div className="truncate text-[11px] font-normal text-slate-400">{r.sublabel}</div>}
                  </div>
                  <div className="relative h-5 flex-1">
                    <Link
                      href={r.href}
                      className={`absolute top-0.5 h-4 overflow-hidden rounded-full ${toneBar[r.tone]} ${r.tone === "todo" ? "" : "opacity-90"}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${r.label}: ${r.start ? formatDate(r.start) : "?"} → ${r.end ? formatDate(r.end) : "?"}${r.progress !== undefined ? ` · ${r.progress}%` : ""}`}
                    >
                      {r.progress !== undefined && r.tone !== "done" && (
                        <span className="block h-full bg-black/15" style={{ width: `${r.progress}%` }} />
                      )}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {toneLabel.map(([tone, label]) => (
          <span key={tone} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-4 rounded-full ${toneBar[tone]}`} /> {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-amber-400" /> Today
        </span>
        {markers.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rotate-45 bg-amber-500" /> Milestone
          </span>
        )}
      </div>
      {undated.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          No dates yet: {undated.map((r) => r.label).join(", ")}.
        </p>
      )}
    </div>
  );
}
