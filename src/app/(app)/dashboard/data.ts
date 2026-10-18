import "server-only";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/time";
import { OPEN_PROJECT_STAGES } from "@/lib/projects";
import { needsLogWhere } from "@/lib/operations";
import { lowStockItems } from "@/lib/inventory";
import { settledByBill } from "@/lib/purchases";
import { AGE_BUCKETS, ageBucket, round2 } from "@/lib/purchase-math";
import { OPEN_STAGES as OPEN_CANDIDATE_STAGES } from "@/lib/recruitment";
import { OPEN_TICKET_STATUSES } from "@/lib/helpdesk";
import { pendingApprovals } from "@/lib/approvals";
import type { CurrentUser } from "@/lib/auth";
import { bucketIndex, type DashboardRange } from "@/lib/dashboard-range";
import { OPEN_STAGES } from "../crm/constants";
import { invoicesWithBalance } from "../invoices/data";
import { cashIn, cashOut, invoicedLessCredit, moneyRecords, total, type Dated } from "./records";

const DAY = 86_400_000;

function sumBy<T>(rows: T[], key: (r: T) => string, value: (r: T) => number) {
  const out = new Map<string, number>();
  for (const r of rows) out.set(key(r), (out.get(key(r)) ?? 0) + value(r));
  return out;
}

const within = (from: Date, to: Date) => (r: Dated) => r.on >= from && r.on <= to;

/** One figure for the chosen range and the same figure for the period before, to compare. */
function compare(rows: Dated[], range: DashboardRange) {
  return { now: total(rows.filter(within(range.from, range.to))), before: total(rows.filter(within(range.prevFrom, range.prevTo))) };
}

/** Everything the owner dashboard shows, read across every module in one go. */
export async function ownerDashboard(user: CurrentUser, range: DashboardRange) {
  const today = todayIST();
  const weekAhead = new Date(today.getTime() + 7 * DAY);
  const monthAhead = new Date(today.getTime() + 30 * DAY);

  const [
    pipelineByStage,
    money,
    closingSoon,
    receivables,
    latestRun,
    openBills,
    claimsWaiting,
    claimsToPay,
    sessionsInRange,
    sessionsBefore,
    sessionsToday,
    logsDue,
    projects,
    staff,
    checkedIn,
    onLeave,
    leavePending,
    openJobs,
    candidates,
    interviewsThisWeek,
    offersOut,
    lowStock,
    kitsLate,
    tickets,
    approvals,
  ] = await Promise.all([
    db.deal.groupBy({ by: ["stage"], where: { stage: { in: [...OPEN_STAGES] } }, _sum: { value: true }, _count: true }),
    moneyRecords(range.prevFrom, range.to, today),
    db.deal.findMany({
      where: { stage: { in: [...OPEN_STAGES] }, expectedClose: { lte: monthAhead } },
      include: { organization: { select: { name: true } } },
      orderBy: [{ expectedClose: "asc" }, { value: "desc" }],
      take: 5,
    }),
    invoicesWithBalance({ status: "ISSUED" }),
    db.payrollRun.findFirst({ orderBy: { month: "desc" }, include: { payslips: { select: { net: true } } } }),
    db.vendorBill.findMany({ where: { status: "OPEN" }, select: { id: true, total: true, dueDate: true } }),
    db.expenseClaim.aggregate({ where: { status: "SUBMITTED" }, _sum: { amount: true }, _count: true }),
    db.expenseClaim.findMany({ where: { status: "APPROVED" }, select: { amount: true, approvedAmount: true } }),
    db.programmeSession.groupBy({ by: ["status"], where: { date: { gte: range.from, lte: range.to } }, _count: true }),
    db.programmeSession.groupBy({ by: ["status"], where: { date: { gte: range.prevFrom, lte: range.prevTo } }, _count: true }),
    db.programmeSession.count({ where: { date: today, status: { not: "CANCELLED" } } }),
    db.programmeSession.count({ where: needsLogWhere(today) }),
    db.project.findMany({
      where: { stage: { in: [...OPEN_PROJECT_STAGES] } },
      select: { id: true, name: true, stage: true, onHold: true, dueDate: true },
      orderBy: { dueDate: { sort: "asc", nulls: "last" } },
    }),
    db.employee.count({ where: { status: { in: ["ONBOARDING", "ACTIVE", "ON_NOTICE"] } } }),
    db.attendanceSession.findMany({ where: { workDate: today }, distinct: ["employeeId"], select: { employeeId: true } }),
    db.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } },
      include: { employee: { select: { id: true, firstName: true, lastName: true } }, leaveType: { select: { code: true } } },
    }),
    db.leaveRequest.count({ where: { status: "PENDING" } }),
    db.jobOpening.findMany({ where: { status: "OPEN" }, select: { positions: true } }),
    db.candidate.groupBy({ by: ["stage"], where: { stage: { in: OPEN_CANDIDATE_STAGES }, job: { status: "OPEN" } }, _count: true }),
    db.interview.count({ where: { status: "SCHEDULED", scheduledAt: { gte: today, lt: new Date(weekAhead.getTime() + DAY) } } }),
    db.offer.count({ where: { status: "SENT" } }),
    lowStockItems(),
    db.stockRequest.count({ where: { status: "ISSUED", returnBy: { lt: today } } }),
    db.helpdeskTicket.findMany({
      where: { status: { in: [...OPEN_TICKET_STATUSES] } },
      select: { assigneeId: true, priority: true },
    }),
    pendingApprovals(user),
  ]);

  // Sales
  const pipeline = OPEN_STAGES.map((stage) => {
    const row = pipelineByStage.find((r) => r.stage === stage);
    return { stage, count: row?._count ?? 0, value: Number(row?._sum.value ?? 0) };
  });
  const inRange = within(range.from, range.to);
  const won = compare(money.won, range);

  // Money in
  const owed = receivables.filter((i) => i.balance > 0);
  const receivableAgeing = AGE_BUCKETS.map(() => 0);
  for (const i of owed) receivableAgeing[ageBucket(i.dueDate, today)] += i.balance;
  const bySchool = sumBy(owed, (i) => i.organization.name, (i) => i.balance);
  const topOwing = [...bySchool].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Money out
  const billSettled = await settledByBill(openBills.map((b) => b.id));
  const payableAgeing = AGE_BUCKETS.map(() => 0);
  let dueThisWeek = 0;
  for (const b of openBills) {
    const balance = round2(Number(b.total) - (billSettled.get(b.id) ?? 0));
    if (balance <= 0) continue;
    payableAgeing[ageBucket(b.dueDate, today)] += balance;
    if (b.dueDate >= today && b.dueDate <= weekAhead) dueThisWeek += balance;
  }
  const claimAmount = (c: { amount: unknown; approvedAmount: unknown }) => Number(c.approvedAmount ?? c.amount);

  // Money in and out over the range, split into the chart's days, weeks or months.
  const ins = cashIn(money);
  const outs = cashOut(money);
  const inBucket = <T extends Dated>(rows: T[]) => {
    const sums = range.buckets.map(() => 0);
    for (const r of rows) {
      const i = bucketIndex(range.buckets, r.on);
      if (i >= 0) sums[i] += r.amount;
    }
    return sums;
  };
  const [bIn, bVendors, bSalaries, bClaims, bWon] = [ins, money.vendorPayments, money.salaries, money.claims, money.won].map(inBucket);
  const cashFlow = range.buckets.map((b, i) => ({
    ...b,
    in: bIn[i],
    out: bVendors[i] + bSalaries[i] + bClaims[i],
    vendors: bVendors[i],
    salaries: bSalaries[i],
    claims: bClaims[i],
    won: bWon[i],
  }));

  // Sessions
  const sessionCount = (s: string, rows = sessionsInRange) => rows.find((r) => r.status === s)?._count ?? 0;

  // Projects
  const late = projects.filter((p) => !p.onHold && p.dueDate && p.dueDate < today);
  const projectsByStage = OPEN_PROJECT_STAGES.map((stage) => ({ stage, count: projects.filter((p) => p.stage === stage).length }));

  // People
  const leaveIds = new Set(onLeave.map((l) => l.employee.id));
  const inToday = checkedIn.filter((c) => !leaveIds.has(c.employeeId)).length;

  return {
    today,
    range,
    sales: {
      pipeline,
      openValue: pipeline.reduce((s, p) => s + p.value, 0),
      openCount: pipeline.reduce((s, p) => s + p.count, 0),
      won,
      wonCount: money.won.filter(inRange).length,
      closingSoon,
    },
    moneyIn: {
      toCollect: receivableAgeing.reduce((s, v) => s + v, 0),
      overdue: receivableAgeing.slice(1).reduce((s, v) => s + v, 0),
      ageing: receivableAgeing,
      topOwing,
      // Credit notes raised in the range come off, whichever month their invoice was from.
      invoiced: compare(invoicedLessCredit(money), range),
      invoiceCount: money.invoices.filter(inRange).length,
      received: compare(ins, range),
    },
    moneyOut: {
      owed: payableAgeing.reduce((s, v) => s + v, 0),
      overdue: payableAgeing.slice(1).reduce((s, v) => s + v, 0),
      dueThisWeek,
      ageing: payableAgeing,
      paid: compare(outs, range),
      claimsWaiting: { count: claimsWaiting._count, amount: Number(claimsWaiting._sum.amount ?? 0) },
      claimsToPay: { count: claimsToPay.length, amount: claimsToPay.reduce((s, c) => s + claimAmount(c), 0) },
      latestRun: latestRun && {
        month: latestRun.month,
        status: latestRun.status,
        net: latestRun.payslips.reduce((s, p) => s + Number(p.net), 0),
        people: latestRun.payslips.length,
      },
    },
    cashFlow,
    sessions: {
      held: sessionCount("COMPLETED"),
      heldBefore: sessionCount("COMPLETED", sessionsBefore),
      missed: sessionCount("MISSED"),
      cancelled: sessionCount("CANCELLED"),
      today: sessionsToday,
      logsDue,
    },
    projects: { open: projects.length, onHold: projects.filter((p) => p.onHold).length, late, byStage: projectsByStage },
    people: { staff, inToday, onLeave, leavePending },
    hiring: {
      openings: openJobs.reduce((s, j) => s + j.positions, 0),
      jobs: openJobs.length,
      candidates: OPEN_CANDIDATE_STAGES.map((stage) => ({ stage, count: candidates.find((c) => c.stage === stage)?._count ?? 0 })),
      interviewsThisWeek,
      offersOut,
    },
    stock: { low: lowStock, kitsLate },
    helpdesk: {
      open: tickets.length,
      unassigned: tickets.filter((t) => !t.assigneeId).length,
      urgent: tickets.filter((t) => t.priority === "HIGH").length,
    },
    approvals: approvals.total,
  };
}

export type OwnerDashboard = Awaited<ReturnType<typeof ownerDashboard>>;
