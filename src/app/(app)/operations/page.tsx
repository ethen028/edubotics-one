import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isManagerOrAdmin, requireUser } from "@/lib/auth";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { addDays, mondayOf } from "@/lib/week";
import { canLogSession, findClashes, needsLogWhere, timeRange, trainerLeaveDays } from "@/lib/operations";
import { dateKey } from "@/lib/attendance";
import { SessionBadge } from "./ui";

export const metadata = { title: "School sessions" };

const sessionInclude = {
  programme: { select: { id: true, name: true, coordinatorId: true, organization: { select: { name: true } } } },
  trainer: { select: { id: true, name: true } },
} satisfies Prisma.ProgrammeSessionInclude;

type Row = Prisma.ProgrammeSessionGetPayload<{ include: typeof sessionInclude }>;

export default async function OperationsTodayPage({ searchParams }: PageProps<"/operations">) {
  const user = await requireUser();
  const sp = (await searchParams) as Record<string, string | undefined>;
  const manager = isManagerOrAdmin(user);
  // Managers see the whole company unless they ask for their own; trainers see their own.
  const everyone = manager && sp.mine !== "1";
  const mine: Prisma.ProgrammeSessionWhereInput = everyone ? {} : { trainerId: user.id };
  const today = todayIST();
  const weekStart = mondayOf(today);
  const weekAhead = addDays(today, 7);

  const [todays, logsDue, upcoming, weekCount, running, issues] = await Promise.all([
    db.programmeSession.findMany({
      where: { ...mine, date: today },
      include: sessionInclude,
      orderBy: { startTime: "asc" },
    }),
    db.programmeSession.findMany({
      where: { ...mine, ...needsLogWhere(today) },
      include: sessionInclude,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.programmeSession.findMany({
      where: { ...mine, date: { gt: today, lte: weekAhead }, status: "SCHEDULED" },
      include: sessionInclude,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 25,
    }),
    db.programmeSession.count({
      where: { ...mine, date: { gte: weekStart, lt: addDays(weekStart, 7) }, status: { not: "CANCELLED" } },
    }),
    db.programme.count({ where: { status: "RUNNING" } }),
    everyone
      ? db.programmeSession.findMany({
          where: { issues: { not: null }, loggedAt: { gte: addDays(today, -14) } },
          include: sessionInclude,
          orderBy: { loggedAt: "desc" },
          take: 8,
        })
      : [],
  ]);

  // Flag double-bookings and trainers on leave among today's and the coming week's sessions.
  const window = [...todays, ...upcoming];
  const clashes = findClashes(
    window.length
      ? await db.programmeSession.findMany({ where: { date: { gte: today, lte: weekAhead }, trainerId: { not: null } } })
      : [],
  );
  const onLeave = window.length ? await trainerLeaveDays(today, weekAhead) : new Set<string>();

  const flags = (s: Row) => (
    <>
      {clashes.has(s.id) && <span className="text-xs font-medium text-red-600">Double-booked</span>}
      {s.trainerId && onLeave.has(`${s.trainerId}|${dateKey(s.date)}`) && (
        <span className="text-xs font-medium text-amber-700">Trainer on leave</span>
      )}
      {!s.trainerId && <span className="text-xs font-medium text-amber-700">No trainer</span>}
    </>
  );

  const row = (s: Row, opts: { showDate?: boolean; due?: boolean } = {}) => (
    <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
      <div className="w-36 shrink-0 text-xs text-slate-500">
        {opts.showDate && <div className="font-medium text-slate-700">{formatDate(s.date)}</div>}
        {timeRange(s.startTime, s.durationMins)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {s.programme.organization.name}
          {s.classGroup && <span className="text-slate-500"> · {s.classGroup}</span>}
        </div>
        <div className="truncate text-xs text-slate-500">
          {s.topic ?? s.programme.name}
          {everyone && ` · ${s.trainer?.name ?? "no trainer"}`}
        </div>
      </div>
      {flags(s)}
      <SessionBadge status={s.status} needsLog={opts.due} />
      {canLogSession(user, s) && (
        <Link href={`/operations/sessions/${s.id}`} className={opts.due || s.date.getTime() === today.getTime() ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
          {s.status === "SCHEDULED" ? "Log" : "Open"}
        </Link>
      )}
    </li>
  );

  return (
    <>
      <PageHeader
        title="School sessions"
        subtitle={`${today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} · ${
          everyone ? "Everyone's sessions" : "Your sessions"
        }`}
        actions={
          <>
            {manager && (
              <Link href={`?mine=${everyone ? "1" : "0"}`} className="btn-secondary">
                {everyone ? "Only mine" : "Everyone"}
              </Link>
            )}
            <Link href="/operations/schedule" className="btn-secondary">
              Week schedule
            </Link>
            {manager && (
              <Link href="/operations/programmes/new" className="btn-primary">
                New programme
              </Link>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Sessions today" value={todays.filter((s) => s.status !== "CANCELLED").length} />
        <Stat label="Sessions this week" value={weekCount} href="/operations/schedule" />
        <Stat label="Logs due" value={logsDue.length} />
        <Stat label="Schools running" value={running} href="/operations/programmes" />
      </div>

      {logsDue.length > 0 && (
        <section className="card mb-6 border-red-200">
          <h2 className="mb-1 font-semibold text-red-700">Logs due ({logsDue.length})</h2>
          <p className="mb-2 text-sm text-slate-500">
            These sessions have passed without a log. Mark each one held, cancelled or missed.
          </p>
          <ul className="divide-y divide-slate-100">{logsDue.slice(0, 20).map((s) => row(s, { showDate: true, due: true }))}</ul>
          {logsDue.length > 20 && <p className="mt-2 text-xs text-slate-500">And {logsDue.length - 20} more.</p>}
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="mb-2 font-semibold">Today</h2>
            {todays.length === 0 ? (
              <Empty>No school sessions today.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">{todays.map((s) => row(s))}</ul>
            )}
          </section>
          <section className="card">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Next 7 days</h2>
              <Link href="/operations/schedule" className="link text-sm">
                Schedule
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing scheduled.</p>
            ) : (
              <ul className="divide-y divide-slate-100">{upcoming.map((s) => row(s, { showDate: true }))}</ul>
            )}
          </section>
        </div>
        <div className="space-y-6">
          {everyone && (
            <section className="card">
              <h2 className="mb-2 font-semibold">Issues raised (last 14 days)</h2>
              {issues.length === 0 ? (
                <p className="text-sm text-slate-500">None reported.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {issues.map((s) => (
                    <li key={s.id}>
                      <Link href={`/operations/sessions/${s.id}`} className="font-medium hover:underline">
                        {s.programme.organization.name}
                        {s.classGroup && ` · ${s.classGroup}`}
                      </Link>
                      <div className="text-slate-600">{s.issues}</div>
                      <div className="text-xs text-slate-400">
                        {s.trainer?.name ?? "—"} · {formatDate(s.date)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <section className="card">
            <h2 className="mb-2 font-semibold">How it works</h2>
            <ol className="list-decimal space-y-1 pl-4 text-sm text-slate-600">
              <li>A coordinator sets up each school&apos;s programme and weekly timetable.</li>
              <li>Trainers see their classes here and on the week schedule.</li>
              <li>After each class, the trainer logs what was taught and how many attended.</li>
              <li>The school report and monthly trainer report build themselves from the logs.</li>
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
