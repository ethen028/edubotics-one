import { isHrOrAdmin, canManagePeople } from "@/lib/permissions";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { getAttendance } from "@/lib/attendance-data";
import { dateKey, formatMinutes, STATUS_COLOR, STATUS_LABEL } from "@/lib/attendance";
import { getLeaveBalances } from "@/lib/leave-balance";
import { todayIST } from "@/lib/time";
import { formatDate, humanize } from "@/lib/format";
import { Badge, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/action-form";
import { checkIn, checkOut } from "./attendance/actions";

export const metadata = { title: "My day · HR" };

export default async function HrPage() {
  const user = await requireUser();
  const employee = user.employee;
  const today = todayIST();
  const manager = canManagePeople(user);
  const team: Prisma.EmployeeWhereInput = { status: { not: "EXITED" }, ...(isHrOrAdmin(user) ? {} : { managerId: employee?.id ?? "__none__" }) };
  const [attendance, balances, leaves, onboarding, training, assets, tasks, sessions, holidays, teamCount, teamOnboarding, leaveDecisions, corrections] = await Promise.all([
    employee ? getAttendance([employee.id], today, today) : null,
    employee ? getLeaveBalances(employee.id, today.getUTCFullYear()) : [],
    employee ? db.leaveRequest.count({ where: { employeeId: employee.id, status: "PENDING" } }) : 0,
    employee ? db.onboardingTask.findMany({ where: { employeeId: employee.id, status: { notIn: ["COMPLETED", "NOT_APPLICABLE"] } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] }) : [],
    employee ? db.trainingAssignment.findMany({ where: { employeeId: employee.id, status: { not: "COMPLETED" }, module: { active: true } }, include: { module: { select: { title: true } } } }) : [],
    employee ? db.asset.findMany({ where: { employeeId: employee.id, status: "ASSIGNED" }, select: { id: true, code: true, name: true } }) : [],
    db.projectTask.findMany({ where: { assigneeId: user.id, status: { not: "DONE" }, project: { stage: { not: "COMPLETE" }, onHold: false } }, include: { project: { select: { id: true, name: true } } }, orderBy: { dueDate: { sort: "asc", nulls: "last" } }, take: 6 }),
    db.programmeSession.findMany({ where: { trainerId: user.id, date: today, status: { not: "CANCELLED" } }, include: { programme: { select: { organization: { select: { name: true } } } } }, orderBy: { startTime: "asc" } }),
    db.holiday.findMany({ where: { date: { gte: today } }, orderBy: { date: "asc" }, take: 3 }),
    manager ? db.employee.count({ where: team }) : 0,
    manager ? db.employee.count({ where: { ...team, status: "ONBOARDING" } }) : 0,
    manager ? db.leaveRequest.count({ where: { status: "PENDING", employee: team, employeeId: { not: employee?.id ?? "__none__" } } }) : 0,
    manager ? db.attendanceCorrection.count({ where: { status: "PENDING", employee: team, employeeId: { not: employee?.id ?? "__none__" } } }) : 0,
  ]);
  const day = employee ? attendance?.days.get(employee.id)?.get(dateKey(today)) : null;
  const checkedIn = day?.sessions.some(session => !session.checkOut) ?? false;
  const profile = employee ? `/hr/employees/${employee.id}` : null;

  return <div className="hr-workspace">
    <PageHeader title="My day" subtitle={`${formatDate(today)} · Your attendance, work and people tasks in one place.`}
      actions={<><Link href="/hr/employees" className="btn-secondary">People directory</Link>{profile && <Link href={profile} className="btn-secondary">My profile</Link>}{isHrOrAdmin(user) && <Link href="/hr/employees/new" className="btn-primary">Add employee</Link>}</>} />
    <div className="module-summary mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <section className="module-summary-primary">
        <span>Today’s attendance</span><strong>{day ? formatMinutes(day.worked) : "Not linked"}</strong>
        {day ? <><Badge color={STATUS_COLOR[day.status]}>{checkedIn ? "Checked in" : STATUS_LABEL[day.status]}</Badge><form action={checkedIn ? checkOut : checkIn} className="mt-4"><SubmitButton className="btn-secondary w-full" pendingLabel={checkedIn ? "Checking out…" : "Checking in…"}>{checkedIn ? "Check out" : "Check in"}</SubmitButton></form><small>Daily target {formatMinutes(attendance!.settings.workMinutesPerDay)} · updated on page load</small></> : <small>Ask HR to link your login to an employee record.</small>}
      </section>
      <Link href="/hr/leave"><span>Leave requests</span><strong>{leaves}</strong><small>Yours awaiting a decision</small></Link>
      <Link href={profile ?? "/hr/employees"}><span>Learning & onboarding</span><strong>{onboarding.length + training.length}</strong><small>{onboarding.length} joining tasks · {training.length} training modules</small></Link>
      <Link href={profile ?? "/hr/employees"}><span>Equipment assigned to you</span><strong>{assets.length}</strong><small>Individually tracked assets</small></Link>
    </div>
    {!employee && <div className="module-notice mb-6"><strong>Your employee profile is not linked yet.</strong><p>You can still use your work queue and the people directory. Attendance, personal leave and assigned equipment appear after HR links your record.{isAdmin(user) && <> <Link href="/admin/users" className="link">Link a user to an employee</Link>.</>}</p></div>}
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="card"><div className="dashboard-section-heading"><div><h2>Your work queue</h2><p>Next open assignments, ordered by due date</p></div><Link href="/work" className="link text-sm">View all</Link></div>
          {tasks.length ? <ul className="module-records">{tasks.map(task => <li key={task.id}><div><Link href={`/projects/${task.projectId}/tasks/${task.id}`} className="link font-medium">{task.title}</Link><small>{task.project.name} · {task.dueDate ? formatDate(task.dueDate) : "No due date"}</small></div><Badge color={task.dueDate && task.dueDate < today ? "red" : "gray"}>{humanize(task.status)}</Badge></li>)}</ul> : <p className="module-empty">No open work assigned to you.</p>}
        </section>
        <section className="card"><div className="dashboard-section-heading"><div><h2>Today’s school sessions</h2><p>Sessions assigned to you</p></div><Link href="/operations" className="link text-sm">Schedule</Link></div>
          {sessions.length ? <ul className="module-records">{sessions.map(session => <li key={session.id}><div><Link href={`/operations/sessions/${session.id}`} className="link">{session.programme.organization.name}</Link><small>{session.startTime} · {session.classGroup ?? "School session"}</small></div><Badge>{humanize(session.status)}</Badge></li>)}</ul> : <p className="module-empty">No school sessions assigned to you today.</p>}
        </section>
        {manager && <section className="card"><div className="dashboard-section-heading"><div><h2>{isHrOrAdmin(user) ? "People operations" : "Your team"}</h2><p>{isHrOrAdmin(user) ? "Current employee records" : "Your direct reports only"}</p></div><Link href="/hr/approvals" className="link text-sm">Review leave approvals</Link></div>
          <div className="module-mini-stats"><div><strong>{teamCount}</strong><span>People</span></div><div><strong>{teamOnboarding}</strong><span>Onboarding</span></div><div><strong>{leaveDecisions}</strong><span>Leave decisions</span></div><div><strong>{corrections}</strong><span>Punch corrections</span></div></div>
          <div className="mt-5 flex flex-wrap gap-2"><Link href="/hr/attendance/register" className="btn-secondary btn-sm">Attendance register</Link><Link href="/hr/onboarding" className="btn-secondary btn-sm">Onboarding</Link><Link href="/hr/training" className="btn-secondary btn-sm">Training</Link>{user.role !== "HR" && <Link href="/hr/exits" className="btn-secondary btn-sm">Exits</Link>}</div>
        </section>}
      </div>
      <div className="space-y-6">
        <section className="card"><div className="dashboard-section-heading"><h2>Your leave balances</h2><Link href="/hr/leave" className="link text-sm">Request leave</Link></div>
          {balances.length ? <ul className="module-records">{balances.map(balance => <li key={balance.leaveTypeId}><div><b>{balance.name}</b><small>{balance.used} used · {balance.pending} pending</small></div><span className="module-balance">{balance.remaining === null ? "Unlimited" : `${balance.remaining} left`}</span></li>)}</ul> : <p className="module-empty">{employee ? "No active leave types configured." : "Link your employee profile to see balances."}</p>}
        </section>
        <section className="card"><div className="dashboard-section-heading"><h2>Learning & joining</h2>{profile && <Link href={profile} className="link text-sm">Manage</Link>}</div>
          {onboarding.length + training.length ? <ul className="module-records">{onboarding.slice(0, 4).map(task => <li key={task.id}><div><b>{task.title}</b><small>{task.dueDate ? `Due ${formatDate(task.dueDate)}` : "No due date"}</small></div><Badge color={task.dueDate && task.dueDate < today ? "amber" : "gray"}>{humanize(task.status)}</Badge></li>)}{training.slice(0, 4).map(item => <li key={item.id}><div><b>{item.module.title}</b><small>Training · {humanize(item.status)}</small></div></li>)}</ul> : <p className="module-empty">No outstanding onboarding tasks or training modules.</p>}
        </section>
        <section className="card"><div className="dashboard-section-heading"><h2>Upcoming holidays</h2><Link href="/hr/holidays" className="link text-sm">Calendar</Link></div>{holidays.length ? <ul className="module-records">{holidays.map(holiday => <li key={holiday.id}><div><b>{holiday.name}</b><small>{formatDate(holiday.date)}{holiday.optional ? " · Optional" : ""}{holiday.tentative ? " · Tentative" : ""}</small></div></li>)}</ul> : <p className="module-empty">No upcoming holidays configured.</p>}</section>
      </div>
    </div>
    <section className="module-links mt-6" aria-label="HR destinations"><Link href="/hr/attendance">Attendance</Link><Link href="/hr/leave">Leave</Link><Link href="/hr/reviews">Performance reviews</Link><Link href="/hr/holidays">Holidays</Link>{isHrOrAdmin(user) && <><Link href="/hr/assets">Assets</Link><Link href="/hr/departments">Departments</Link><Link href="/hr/leave-types">Leave policy</Link></>}</section>
  </div>;
}
