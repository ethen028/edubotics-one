import "server-only";
import type { PlanMetricKind } from "@prisma/client";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/time";
import { monthEnd, monthStart, needsUpdate } from "@/lib/plan-rules";

/** How many of this person's plan tasks still need this week's update. Counted from Thursday, ahead of Friday's deadline. */
export async function myPlanTasksToUpdate(userId: string) {
  const today = todayIST();
  const weekday = today.getUTCDay();
  if (weekday !== 4 && weekday !== 5 && weekday !== 6) return 0;
  const tasks = await db.planTask.findMany({
    where: { ownerId: userId, status: { not: "DONE" }, month: { month: { lte: monthStart(today) } } },
    select: { status: true, lastUpdateAt: true },
  });
  return tasks.filter((t) => needsUpdate(t, today)).length;
}

const AUTO_KINDS: PlanMetricKind[] = [
  "LEADS",
  "MEETINGS",
  "CONVERSIONS",
  "WORKSHOP_STUDENTS",
  "INTERNSHIP_STUDENTS",
  "COLLEGE_PROJECTS",
  "SCHOOL_PROPOSALS",
  "INVOICED",
  "RECEIVED",
];

/** Where each counted number comes from, shown under the scorecard. */
export const METRIC_SOURCE: Record<PlanMetricKind, string> = {
  LEADS: "Leads added in CRM",
  MEETINGS: "Meetings and visits marked done in CRM follow-ups",
  CONVERSIONS: "Deals marked won",
  WORKSHOP_STUDENTS: "People registered on workshops held this month",
  INTERNSHIP_STUDENTS: "People registered on internship batches starting this month",
  COLLEGE_PROJECTS: "Student projects started in Projects",
  SCHOOL_PROPOSALS: "Quotes sent to schools",
  INVOICED: "Invoices issued, GST included, less credit notes",
  RECEIVED: "Invoice payments (with TDS) and workshop fees received",
  CUSTOM: "Entered by hand",
};

export const isAutoMetric = (kind: PlanMetricKind) => AUTO_KINDS.includes(kind);

/** The month's actual figure for each counted kind of target, from the rest of the app. */
export async function metricActuals(month: Date): Promise<Record<PlanMetricKind, number>> {
  const from = monthStart(month);
  const to = monthEnd(month);
  const toExclusive = new Date(to.getTime() + 86400000);
  const between = { gte: from, lt: toExclusive };
  const notCancelledReg = { status: { not: "CANCELLED" as const } };
  const [leads, meetings, won, workshopPeople, internPeople, projects, proposals, invoiced, credited, received, fees] = await Promise.all([
    db.lead.count({ where: { createdAt: between } }),
    db.activity.count({ where: { type: { in: ["MEETING", "VISIT"] }, done: true, OR: [{ dueAt: between }, { dueAt: null, createdAt: between }] } }),
    db.deal.count({ where: { stage: "WON", closedAt: between } }),
    db.workshopRegistration.count({ where: { ...notCancelledReg, workshop: { kind: { not: "INTERNSHIP" }, status: { not: "CANCELLED" }, startDate: between } } }),
    db.workshopRegistration.count({ where: { ...notCancelledReg, workshop: { kind: "INTERNSHIP", status: { not: "CANCELLED" }, startDate: between } } }),
    db.project.count({ where: { kind: "STUDENT_PROJECT", createdAt: between } }),
    db.quote.count({ where: { sentAt: between, organization: { type: "SCHOOL" } } }),
    db.invoice.aggregate({ _sum: { total: true }, where: { status: "ISSUED", issueDate: between } }),
    db.creditNote.aggregate({ _sum: { total: true }, where: { status: "ISSUED", issueDate: between } }),
    db.invoicePayment.aggregate({ _sum: { amount: true, tds: true }, where: { receivedOn: between } }),
    db.workshopPayment.aggregate({ _sum: { amount: true }, where: { paidOn: between, cancelledAt: null } }),
  ]);
  return {
    LEADS: leads,
    MEETINGS: meetings,
    CONVERSIONS: won,
    WORKSHOP_STUDENTS: workshopPeople,
    INTERNSHIP_STUDENTS: internPeople,
    COLLEGE_PROJECTS: projects,
    SCHOOL_PROPOSALS: proposals,
    INVOICED: Number(invoiced._sum.total ?? 0) - Number(credited._sum.total ?? 0),
    RECEIVED: Number(received._sum.amount ?? 0) + Number(received._sum.tds ?? 0) + Number(fees._sum.amount ?? 0),
    CUSTOM: 0,
  };
}
