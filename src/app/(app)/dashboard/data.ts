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
import { OPEN_STAGES } from "../crm/constants";
import { invoicesWithBalance } from "../invoices/data";

const DAY = 86_400_000;
const MONTHS_SHOWN = 6;

/** "2026-10" for a UTC-midnight date. */
const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/** The last six months, oldest first, ending with the current one. */
function recentMonths(today: Date) {
  return Array.from({ length: MONTHS_SHOWN }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (MONTHS_SHOWN - 1 - i), 1));
    return { key: monthKey(d), label: d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }) };
  });
}

function sumBy<T>(rows: T[], key: (r: T) => string, value: (r: T) => number) {
  const out = new Map<string, number>();
  for (const r of rows) out.set(key(r), (out.get(key(r)) ?? 0) + value(r));
  return out;
}

/** Everything the owner dashboard shows, read across every module in one go. */
export async function ownerDashboard(user: CurrentUser) {
  const today = todayIST();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const months = recentMonths(today);
  const firstMonth = new Date(`${months[0].key}-01T00:00:00Z`);
  const weekAhead = new Date(today.getTime() + 7 * DAY);
  const monthAhead = new Date(today.getTime() + 30 * DAY);

  const [
    pipelineByStage,
    wonDeals,
    closingSoon,
    receivables,
    invoicedThisMonth,
    received,
    vendorPaid,
    payrollRuns,
    claimsPaidByHand,
    openBills,
    claimsWaiting,
    claimsToPay,
    sessionsThisMonth,
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
    db.deal.findMany({ where: { stage: "WON", closedAt: { gte: firstMonth } }, select: { value: true, closedAt: true } }),
    db.deal.findMany({
      where: { stage: { in: [...OPEN_STAGES] }, expectedClose: { lte: monthAhead } },
      include: { organization: { select: { name: true } } },
      orderBy: [{ expectedClose: "asc" }, { value: "desc" }],
      take: 5,
    }),
    invoicesWithBalance({ status: "ISSUED" }),
    db.invoice.aggregate({ where: { status: "ISSUED", issueDate: { gte: monthStart } }, _sum: { total: true }, _count: true }),
    db.invoicePayment.findMany({
      where: { receivedOn: { gte: firstMonth }, invoice: { status: { not: "CANCELLED" } } },
      select: { amount: true, receivedOn: true },
    }),
    db.vendorPayment.findMany({
      where: { paidOn: { gte: firstMonth }, bill: { status: "OPEN" } },
      select: { amount: true, paidOn: true },
    }),
    db.payrollRun.findMany({
      where: { month: { in: months.map((m) => m.key) } },
      include: { payslips: { select: { net: true } } },
      orderBy: { month: "desc" },
    }),
    db.expenseClaim.findMany({
      where: { status: "PAID", payslipId: null, paidOn: { gte: firstMonth } },
      select: { amount: true, approvedAmount: true, paidOn: true },
    }),
    db.vendorBill.findMany({ where: { status: "OPEN" }, select: { id: true, total: true, dueDate: true } }),
    db.expenseClaim.aggregate({ where: { status: "SUBMITTED" }, _sum: { amount: true }, _count: true }),
    db.expenseClaim.findMany({ where: { status: "APPROVED" }, select: { amount: true, approvedAmount: true } }),
    db.programmeSession.groupBy({ by: ["status"], where: { date: { gte: monthStart, lte: today } }, _count: true }),
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
  const wonByMonth = sumBy(wonDeals, (d) => monthKey(d.closedAt!), (d) => Number(d.value));
  const wonCountThisMonth = wonDeals.filter((d) => d.closedAt! >= monthStart).length;

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
  // Salaries count once a run is finalised; drafts can still change.
  const salaryByMonth = new Map(
    payrollRuns.filter((r) => r.status !== "DRAFT").map((r) => [r.month, r.payslips.reduce((s, p) => s + Number(p.net), 0)]),
  );
  const latestRun = payrollRuns[0];

  const cashIn = sumBy(received, (p) => monthKey(p.receivedOn), (p) => Number(p.amount));
  const vendorOut = sumBy(vendorPaid, (p) => monthKey(p.paidOn), (p) => Number(p.amount));
  const claimsOut = sumBy(claimsPaidByHand, (c) => monthKey(c.paidOn!), claimAmount);
  const cashFlow = months.map((m) => {
    const vendors = vendorOut.get(m.key) ?? 0;
    const salaries = salaryByMonth.get(m.key) ?? 0;
    const claims = claimsOut.get(m.key) ?? 0;
    return { ...m, in: cashIn.get(m.key) ?? 0, out: vendors + salaries + claims, vendors, salaries, claims, won: wonByMonth.get(m.key) ?? 0 };
  });

  // Sessions
  const sessionCount = (s: string) => sessionsThisMonth.find((r) => r.status === s)?._count ?? 0;

  // Projects
  const late = projects.filter((p) => !p.onHold && p.dueDate && p.dueDate < today);
  const projectsByStage = OPEN_PROJECT_STAGES.map((stage) => ({ stage, count: projects.filter((p) => p.stage === stage).length }));

  // People
  const leaveIds = new Set(onLeave.map((l) => l.employee.id));
  const inToday = checkedIn.filter((c) => !leaveIds.has(c.employeeId)).length;

  return {
    today,
    sales: {
      pipeline,
      openValue: pipeline.reduce((s, p) => s + p.value, 0),
      openCount: pipeline.reduce((s, p) => s + p.count, 0),
      wonThisMonth: wonByMonth.get(monthKey(today)) ?? 0,
      wonCountThisMonth,
      closingSoon,
    },
    moneyIn: {
      toCollect: receivableAgeing.reduce((s, v) => s + v, 0),
      overdue: receivableAgeing.slice(1).reduce((s, v) => s + v, 0),
      ageing: receivableAgeing,
      topOwing,
      invoicedThisMonth: Number(invoicedThisMonth._sum.total ?? 0),
      invoicesThisMonth: invoicedThisMonth._count,
      receivedThisMonth: cashIn.get(monthKey(today)) ?? 0,
    },
    moneyOut: {
      owed: payableAgeing.reduce((s, v) => s + v, 0),
      overdue: payableAgeing.slice(1).reduce((s, v) => s + v, 0),
      dueThisWeek,
      ageing: payableAgeing,
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
