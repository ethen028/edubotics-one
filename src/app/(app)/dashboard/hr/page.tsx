import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getAttendance } from "@/lib/attendance-data";
import { dateKey } from "@/lib/attendance";
import { daysFromNow, todayIST } from "@/lib/time";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui";
import { Bars } from "../ui";
import { Attention, Line, Lines, Panel, fullName, plural } from "../role-ui";

export const metadata = { title: "HR dashboard" };

const PIPELINE = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER"] as const;

/**
 * People at a glance for HR (and admins): who is in, leave, hiring, joining, training, reviews and leavers.
 * No salaries, payslips or money: those stay with the admin and owner dashboards.
 */
export default async function HrDashboard() {
  const user = await requireUser(["ADMIN", "HR"]);
  const today = todayIST();
  const weekAhead = new Date(today.getTime() + 7 * 86_400_000);
  const me = user.employee?.id ?? "__none__";

  const staff = await db.employee.findMany({
    where: { status: { not: "EXITED" } },
    select: { id: true, firstName: true, lastName: true, status: true, dateOfJoining: true, dateOfBirth: true },
    orderBy: { firstName: "asc" },
  });

  const [attendance, leaveToDecide, corrections, onLeaveWeek, jobs, candidates, newOnline, interviews, feedbackDue, onboarding, training, documents, leavers, cycle, assets] =
    await Promise.all([
      getAttendance(staff.map((s) => s.id), today, today),
      db.leaveRequest.findMany({ where: { status: "PENDING", employeeId: { not: me } }, include: { employee: true, leaveType: true }, orderBy: { startDate: "asc" }, take: 6 }),
      db.attendanceCorrection.count({ where: { status: "PENDING", employeeId: { not: me } } }),
      db.leaveRequest.findMany({ where: { status: "APPROVED", startDate: { lte: weekAhead }, endDate: { gte: today } }, include: { employee: true, leaveType: true }, orderBy: { startDate: "asc" } }),
      db.jobOpening.findMany({ where: { status: "OPEN" }, select: { id: true, title: true, positions: true, _count: { select: { candidates: { where: { stage: { in: [...PIPELINE] } } } } } }, orderBy: { createdAt: "desc" } }),
      db.candidate.groupBy({ by: ["stage"], where: { stage: { in: [...PIPELINE] }, job: { status: "OPEN" } }, _count: true }),
      db.candidate.count({ where: { appliedOnlineAt: { not: null }, stage: "APPLIED" } }),
      db.interview.findMany({
        where: { status: "SCHEDULED", scheduledAt: { gte: new Date(), lte: daysFromNow(7) } },
        include: { candidate: { select: { id: true, name: true } }, interviewer: { select: { name: true } } },
        orderBy: { scheduledAt: "asc" },
        take: 5,
      }),
      db.interview.count({ where: { status: "SCHEDULED", scheduledAt: { lt: new Date() } } }),
      db.employee.findMany({
        where: { status: "ONBOARDING" },
        select: { id: true, firstName: true, lastName: true, dateOfJoining: true, onboardingTasks: { select: { status: true } } },
        orderBy: { dateOfJoining: "asc" },
      }),
      db.trainingAssignment.count({ where: { status: { not: "COMPLETED" }, module: { active: true }, employee: { status: { not: "EXITED" } } } }),
      db.employeeDocument.count({ where: { status: "PENDING" } }),
      db.employee.findMany({ where: { status: "ON_NOTICE" }, select: { id: true, firstName: true, lastName: true, exits: { where: { stage: "ON_NOTICE" }, select: { lastWorkingDay: true, proposedLastDay: true }, take: 1 } } }),
      db.reviewCycle.findFirst({
        where: { stage: { not: "CLOSED" } },
        select: { id: true, name: true, reviews: { select: { selfSubmittedAt: true, managerRating: true } } },
        orderBy: { periodStart: "desc" },
      }),
      db.asset.groupBy({ by: ["status"], _count: true }),
    ]);

  const days = staff.map((s) => ({ person: s, day: attendance.days.get(s.id)?.get(dateKey(today)) }));
  const inToday = days.filter((d) => d.day && d.day.sessions.length > 0).length;
  const onLeaveToday = days.filter((d) => d.day?.status === "LEAVE");
  const notIn = days.filter((d) => d.day && d.day.sessions.length === 0 && ["NOT_YET", "ABSENT"].includes(d.day.status));
  const holiday = days.length > 0 && days.every((d) => d.day?.status === "HOLIDAY" || d.day?.status === "WEEKLY_OFF");
  const openings = jobs.reduce((s, j) => s + j.positions, 0);
  const stageCount = (stage: string) => candidates.find((c) => c.stage === stage)?._count ?? 0;
  const thisMonth = today.getUTCMonth();
  const celebrations = staff
    .flatMap((s) => [
      s.dateOfBirth && s.dateOfBirth.getUTCMonth() === thisMonth ? { key: `${s.id}b`, text: `${fullName(s)} · birthday`, day: s.dateOfBirth.getUTCDate() } : null,
      s.dateOfJoining.getUTCMonth() === thisMonth && s.dateOfJoining.getUTCFullYear() < today.getUTCFullYear()
        ? { key: `${s.id}j`, text: `${fullName(s)} · ${plural(today.getUTCFullYear() - s.dateOfJoining.getUTCFullYear(), "year")} with us`, day: s.dateOfJoining.getUTCDate() }
        : null,
    ])
    .filter((c): c is { key: string; text: string; day: number } => !!c)
    .sort((a, b) => a.day - b.day);
  const assetCount = (status: string) => assets.find((a) => a.status === status)?._count ?? 0;

  return (
    <>
      <PageHeader title="HR dashboard" subtitle="People, attendance, leave, hiring, joining and leaving. Salaries and payroll are not shown here." />

      <Attention
        items={[
          leaveToDecide.length > 0 && { text: `${plural(leaveToDecide.length, "leave request")} to decide`, href: "/hr/approvals" },
          corrections > 0 && { text: `${plural(corrections, "missed check-out")} to fix`, href: "/hr/approvals" },
          documents > 0 && { text: `${plural(documents, "document")} to verify`, href: "/hr/employees" },
          newOnline > 0 && { text: `${plural(newOnline, "new application")} from the careers page`, href: "/recruitment/candidates" },
          feedbackDue > 0 && { text: `${plural(feedbackDue, "interview")} waiting for feedback`, href: "/recruitment/interviews" },
        ]}
      />

      <div className="executive-stats mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="People on the team" value={staff.length} href="/hr/employees" />
        <Stat label="In today" value={holiday ? "Holiday" : `${inToday} / ${staff.length}`} href="/hr/attendance/register" />
        <Stat label="On leave today" value={onLeaveToday.length} href="/hr/approvals" />
        <Stat label={`Open jobs · ${jobs.length}`} value={`${openings} ${openings === 1 ? "opening" : "openings"}`} href="/recruitment" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Attendance today" href="/hr/attendance/register" link="Register">
          <Lines empty="No one on the team yet.">
            {[
              <Line key="in" label="Checked in" value={inToday} tone="green" />,
              <Line key="leave" label={`On leave${onLeaveToday.length ? `: ${onLeaveToday.map((d) => d.person.firstName).join(", ")}` : ""}`} value={onLeaveToday.length} />,
              <Line
                key="not"
                label={`Not in yet${notIn.length && notIn.length <= 4 ? `: ${notIn.map((d) => d.person.firstName).join(", ")}` : ""}`}
                value={holiday ? "—" : notIn.length}
                tone={!holiday && notIn.length ? "amber" : undefined}
              />,
              <Line key="fix" label="Missed check-outs to fix" value={corrections} href="/hr/approvals" tone={corrections ? "red" : undefined} />,
            ]}
          </Lines>
        </Panel>

        <Panel title="Leave" href="/hr/approvals" link="Leave approvals">
          <Lines empty="No leave waiting and no one away this week.">
            {[
              ...leaveToDecide.map((l) => (
                <Line key={l.id} label={`${fullName(l.employee)} · ${l.leaveType.name}, ${formatDate(l.startDate)}`} value={`${l.days} d · waiting`} tone="amber" href="/hr/approvals" />
              )),
              ...onLeaveWeek.slice(0, 6).map((l) => (
                <Line key={l.id} label={`${fullName(l.employee)} · ${l.leaveType.name}`} value={l.startDate <= today ? `till ${formatDate(l.endDate)}` : `from ${formatDate(l.startDate)}`} />
              )),
            ]}
          </Lines>
        </Panel>

        <Panel title="Hiring" href="/recruitment">
          {jobs.length === 0 ? (
            <p className="text-sm text-slate-500">No open jobs.</p>
          ) : (
            <Bars rows={PIPELINE.map((s) => ({ label: humanize(s), value: stageCount(s), display: String(stageCount(s)), href: `/recruitment/candidates?stage=${s}` }))} />
          )}
          {interviews.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-sm">
              {interviews.map((i) => (
                <Line key={i.id} label={`${i.candidate.name} · ${i.interviewer.name}`} value={formatDateTime(i.scheduledAt)} href={`/recruitment/candidates/${i.candidate.id}`} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Joining" href="/hr/onboarding" link="Onboarding">
          <Lines empty="No one is joining right now.">
            {onboarding.map((e) => {
              const done = e.onboardingTasks.filter((t) => t.status === "COMPLETED" || t.status === "NOT_APPLICABLE").length;
              return (
                <Line
                  key={e.id}
                  label={`${fullName(e)} · joined ${formatDate(e.dateOfJoining)}`}
                  value={`${done} / ${e.onboardingTasks.length} tasks`}
                  href={`/hr/employees/${e.id}`}
                  tone={done < e.onboardingTasks.length ? "amber" : "green"}
                />
              );
            })}
          </Lines>
        </Panel>

        <Panel title="Leaving" href="/hr/employees">
          <Lines empty="No one is serving notice.">
            {leavers.map((e) => (
              <Line key={e.id} label={fullName(e)} value={`last day ${formatDate(e.exits[0]?.lastWorkingDay ?? e.exits[0]?.proposedLastDay)}`} href={`/hr/employees/${e.id}`} tone="amber" />
            ))}
          </Lines>
        </Panel>

        <Panel title="Training, reviews and assets" href="/hr/training" link="Training">
          <Lines empty="">
            {[
              <Line key="t" label="Training modules not finished" value={training} href="/hr/training" tone={training ? "amber" : undefined} />,
              cycle ? (
                <Line
                  key="r"
                  label={`${cycle.name}: self reviews in`}
                  value={`${cycle.reviews.filter((r) => r.selfSubmittedAt).length} / ${cycle.reviews.length}`}
                  href="/hr/reviews"
                />
              ) : (
                <Line key="r" label="Performance reviews" value="No open cycle" href="/hr/reviews" />
              ),
              cycle ? <Line key="rr" label="Manager ratings given" value={`${cycle.reviews.filter((r) => r.managerRating).length} / ${cycle.reviews.length}`} href="/hr/reviews" /> : null,
              <Line key="a" label="Assets with staff" value={assetCount("ASSIGNED")} href="/hr/assets" />,
              <Line key="av" label="Assets free to hand out" value={assetCount("AVAILABLE")} href="/hr/assets" />,
            ]}
          </Lines>
        </Panel>

        {celebrations.length > 0 && (
          <Panel title="Birthdays and work anniversaries this month">
            <Lines empty="">
              {celebrations.map((c) => (
                <Line key={c.key} label={c.text} value={`${c.day} ${today.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}`} tone={c.day === today.getUTCDate() ? "green" : undefined} />
              ))}
            </Lines>
          </Panel>
        )}
      </div>
    </>
  );
}
