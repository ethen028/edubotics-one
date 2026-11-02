import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { todayIST } from "@/lib/time";
import { CALENDAR_KINDS, calendarEvents, type CalendarKind } from "@/lib/calendar";
import { addMonths, monthEnd, monthLabel, monthParam, monthStart, parseMonth } from "@/lib/plan-rules";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Calendar" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY = 86400000;

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const today = todayIST();
  const month = parseMonth(sp.month) ?? monthStart(today);
  const hidden = new Set((sp.hide ?? "").split(",").filter(Boolean) as CalendarKind[]);
  // Whole weeks, Monday to Sunday, around the month.
  const first = monthStart(month);
  const gridStart = new Date(first.getTime() - ((first.getUTCDay() + 6) % 7) * DAY);
  const last = monthEnd(month);
  const gridEnd = new Date(last.getTime() + ((7 - last.getUTCDay()) % 7) * DAY);
  const events = (await calendarEvents(user, gridStart, gridEnd)).filter((e) => !hidden.has(e.kind));
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = new Date(d.getTime() + DAY)) days.push(d);
  const byDay = new Map<number, typeof events>();
  for (const e of events) byDay.set(e.date.getTime(), [...(byDay.get(e.date.getTime()) ?? []), e]);
  const agenda = events.filter((e) => e.date >= first && e.date <= last);

  const link = (m: Date, hide = hidden) => {
    const p = new URLSearchParams({ month: monthParam(m) });
    if (hide.size) p.set("hide", [...hide].join(","));
    return `?${p}`;
  };
  const toggle = (k: CalendarKind) => {
    const next = new Set(hidden);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    return link(month, next);
  };

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Holidays, the planning rhythm, plan deadlines, school sessions, workshops, leave and due dates in one place."
        actions={
          <>
            <Link href={link(addMonths(month, -1))} className="btn-secondary" aria-label="Previous month">
              ←
            </Link>
            <Link href={link(monthStart(today))} className="btn-secondary">
              Today
            </Link>
            <Link href={link(addMonths(month, 1))} className="btn-secondary" aria-label="Next month">
              →
            </Link>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">{monthLabel(month)}</h2>
        <div className="flex flex-wrap gap-2" aria-label="Show or hide">
          {CALENDAR_KINDS.map((k) => (
            <Link key={k.kind} href={toggle(k.kind)} className={`filter-chip gap-1.5 ${hidden.has(k.kind) ? "opacity-50" : ""}`} aria-pressed={!hidden.has(k.kind)}>
              <i className="h-2.5 w-2.5 rounded-sm" style={{ background: k.color }} aria-hidden />
              {k.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="hidden md:block">
        <div className="cal-grid" role="grid" aria-label={monthLabel(month)}>
          {WEEKDAYS.map((d) => (
            <div key={d} className="cal-head" role="columnheader">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const list = byDay.get(d.getTime()) ?? [];
            const inMonth = d.getUTCMonth() === month.getUTCMonth();
            return (
              <div key={d.toISOString()} className="cal-cell" role="gridcell" data-muted={!inMonth || undefined} data-today={d.getTime() === today.getTime() || undefined}>
                <span className="cal-date">{d.getUTCDate()}</span>
                {list.slice(0, 4).map((e, i) =>
                  e.href ? (
                    <Link key={i} href={e.href} className="cal-event" data-kind={e.kind} title={`${e.time ? `${e.time} · ` : ""}${e.title}`}>
                      {e.time && <span className="font-semibold">{e.time} </span>}
                      {e.title}
                    </Link>
                  ) : (
                    <span key={i} className="cal-event" data-kind={e.kind} title={e.title}>
                      {e.title}
                    </span>
                  ),
                )}
                {list.length > 4 && <span className="px-1.5 text-[11px] text-slate-500">+{list.length - 4} more</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Phones, and a plain list for anyone: the month as an agenda. */}
      <section className="card mt-6 p-0 md:mt-6">
        <h2 className="border-b border-[var(--line)] px-5 py-4 font-semibold">This month, day by day</h2>
        {agenda.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Nothing on the calendar this month.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {[...new Set(agenda.map((e) => e.date.getTime()))].map((t) => {
              const d = new Date(t);
              return (
                <li key={t} className="flex gap-4 px-5 py-3">
                  <span className="date-chip shrink-0" data-today={t === today.getTime() || undefined}>
                    <span className="text-base font-bold">{d.getUTCDate()}</span>
                    <span className="mt-0.5 text-[10px] font-semibold text-slate-500 uppercase">
                      {d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })}
                    </span>
                  </span>
                  <ul className="min-w-0 flex-1 space-y-1">
                    {agenda
                      .filter((e) => e.date.getTime() === t)
                      .map((e, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: CALENDAR_KINDS.find((k) => k.kind === e.kind)?.color }} aria-hidden />
                          {e.time && <span className="shrink-0 text-xs text-slate-500">{e.time}</span>}
                          {e.href ? (
                            <Link href={e.href} className="min-w-0 truncate hover:underline">
                              {e.title}
                            </Link>
                          ) : (
                            <span className="min-w-0 truncate">{e.title}</span>
                          )}
                        </li>
                      ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
