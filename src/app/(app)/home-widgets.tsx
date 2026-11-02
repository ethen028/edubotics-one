import Link from "next/link";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { calendarEvents, CALENDAR_KINDS } from "@/lib/calendar";
import { formatDateTime, humanize } from "@/lib/format";
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/notifications";
import { monthEnd, monthLabel, monthStart, needsUpdate } from "@/lib/plan-rules";

const DAY = 86400000;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** A small month calendar with dots on busy days and the next few things coming up. */
export async function CalendarCard({ user, today }: { user: CurrentUser; today: Date }) {
  const first = monthStart(today);
  const last = monthEnd(today);
  const events = await calendarEvents(user, first, last);
  const busy = new Set(events.filter((e) => e.kind !== "holiday").map((e) => e.date.getTime()));
  const holidays = new Set(events.filter((e) => e.kind === "holiday").map((e) => e.date.getTime()));
  const lead = (first.getUTCDay() + 6) % 7;
  const days: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; d <= last; d = new Date(d.getTime() + DAY)) days.push(d);
  const next = events.filter((e) => e.date >= today).slice(0, 4);
  const color = (k: string) => CALENDAR_KINDS.find((c) => c.kind === k)?.color;
  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{monthLabel(today)}</h2>
        <Link href="/calendar" className="link text-sm">
          Calendar
        </Link>
      </div>
      <div className="mini-cal" aria-hidden>
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="pb-1 text-[11px] font-semibold text-slate-500">
            {w}
          </div>
        ))}
        {days.map((d, i) =>
          d ? (
            <div
              key={i}
              className="mini-cal-day"
              data-today={d.getTime() === today.getTime() || undefined}
              data-holiday={holidays.has(d.getTime()) || undefined}
              data-muted={d.getUTCDay() === 0 || undefined}
            >
              {d.getUTCDate()}
              {busy.has(d.getTime()) && <span className="mini-cal-dot" />}
            </div>
          ) : (
            <div key={i} />
          ),
        )}
      </div>
      <ul className="mt-4 space-y-2 border-t border-[var(--line)] pt-3 text-sm">
        {next.length === 0 && <li className="text-slate-500">Nothing else this month.</li>}
        {next.map((e, i) => (
          <li key={i} className="flex items-start gap-2">
            <i className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color(e.kind) }} aria-hidden />
            <div className="min-w-0">
              {e.href ? (
                <Link href={e.href} className="block truncate hover:underline">
                  {e.title}
                </Link>
              ) : (
                <span className="block truncate">{e.title}</span>
              )}
              <span className="text-xs text-slate-500">
                {e.date.getTime() === today.getTime() ? "Today" : e.date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                {e.time && ` · ${e.time}`}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** This month's focus from the operating plan, the person's own plan tasks and how the team stands. */
export async function PlanCard({ user, today }: { user: CurrentUser; today: Date }) {
  const plan = await db.planMonth.findFirst({
    where: { month: monthStart(today) },
    include: { tasks: { select: { id: true, activity: true, ownerId: true, status: true, rag: true, lastUpdateAt: true } } },
  });
  if (!plan) return null;
  const mine = plan.tasks.filter((t) => t.ownerId === user.id);
  const counts = { GREEN: 0, AMBER: 0, RED: 0 };
  for (const t of plan.tasks) if (t.rag) counts[t.rag]++;
  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between">
        <div className="eyebrow text-brand-700">This month&apos;s focus</div>
        <Link href="/plan" className="link text-sm">
          Work plan
        </Link>
      </div>
      <h2 className="font-semibold">{plan.focus}</h2>
      {plan.tasks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rag" data-rag="GREEN">{counts.GREEN} green</span>
          <span className="rag" data-rag="AMBER">{counts.AMBER} amber</span>
          <span className="rag" data-rag="RED">{counts.RED} red</span>
        </div>
      )}
      {mine.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-[var(--line)] pt-3 text-sm">
          {mine.slice(0, 4).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2">
              <Link href={`/plan#task-${t.id}`} className="min-w-0 truncate hover:underline">
                {t.activity}
              </Link>
              {needsUpdate(t, today) ? (
                <span className="shrink-0 text-xs font-medium text-amber-700">Update due</span>
              ) : (
                <span className="shrink-0 text-xs text-slate-500">{humanize(t.status)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The latest messages in the person's Inbox. */
export async function InboxCard({ user }: { user: CurrentUser }) {
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 4 });
  if (items.length === 0) return null;
  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Inbox</h2>
        <Link href="/inbox" className="link text-sm">
          All
        </Link>
      </div>
      <ul className="space-y-3 text-sm">
        {items.map((n) => (
          <li key={n.id} className="flex gap-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-slate-300" : "bg-brand-700"}`} aria-label={n.readAt ? undefined : "Unread"} />
            <div className="min-w-0">
              <Link href={n.href} className={`block truncate hover:underline ${n.readAt ? "" : "font-medium"}`}>
                {n.title}
              </Link>
              <div className="text-xs text-slate-500">
                {NOTIFICATION_KINDS[n.kind as NotificationKind] ?? "Message"} · {formatDateTime(n.createdAt)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
