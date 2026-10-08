import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { isAdmin, type CurrentUser } from "./auth";
import { todayIST } from "./time";
import { OPEN_PROJECT_STAGES } from "./projects";

export const OPEN_EXIT = ["REQUESTED", "ON_NOTICE"] as const;

/** Exits this user may see in lists: everyone's for admins, their direct reports' for managers. */
export function exitScope(user: CurrentUser): Prisma.EmployeeExitWhereInput {
  if (isAdmin(user)) return {};
  return { employee: { managerId: user.employee?.id ?? "__none__" } };
}

/**
 * One exit with what this user may do on it, or null when they may not open it.
 * The person, their manager and admins can open it. The exit interview and the settlement
 * are for the person and admins only; managers see the checklist and the handover.
 */
export async function exitFor(user: CurrentUser, id: string) {
  const exit = await db.employeeExit.findUnique({
    where: { id },
    include: {
      employee: {
        include: {
          department: { select: { name: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
          user: { select: { id: true, active: true } },
        },
      },
      startedBy: { select: { name: true } },
      acceptedBy: { select: { name: true } },
      tasks: { include: { doneBy: { select: { name: true } } }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!exit) return null;
  const admin = isAdmin(user);
  const isSelf = user.employee?.id === exit.employeeId;
  const isManager = !!user.employee && user.employee.id === exit.employee.managerId;
  if (!admin && !isSelf && !isManager) return null;
  return { exit, admin, isSelf, isManager, canRun: admin || isManager };
}

/** The person's resignation or exit in progress, if any. */
export function openExitOf(employeeId: string) {
  return db.employeeExit.findFirst({ where: { employeeId, stage: { in: [...OPEN_EXIT] } }, orderBy: { createdAt: "desc" } });
}

/**
 * Work still in a leaving person's name, so it can be handed over before they go.
 * Each count is what "Hand over" moves to someone else.
 */
export async function handoverCounts(employeeId: string, userId: string | null) {
  const today = todayIST();
  const u = userId ?? "__none__";
  const [
    tasks,
    projects,
    leads,
    deals,
    organizations,
    contacts,
    followUps,
    helpdesk,
    sessions,
    programmes,
    workshops,
    reviews,
    reports,
  ] = await Promise.all([
    db.projectTask.count({ where: { assigneeId: u, status: { not: "DONE" }, project: { stage: { not: "COMPLETE" } } } }),
    db.project.count({ where: { ownerId: u, stage: { in: [...OPEN_PROJECT_STAGES] } } }),
    db.lead.count({ where: { ownerId: u, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } } }),
    db.deal.count({ where: { ownerId: u, stage: { in: ["PROSPECT", "DEMO", "PROPOSAL", "NEGOTIATION"] } } }),
    db.organization.count({ where: { ownerId: u } }),
    db.contact.count({ where: { ownerId: u } }),
    db.activity.count({ where: { assigneeId: u, done: false } }),
    db.helpdeskTicket.count({ where: { assigneeId: u, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    db.programmeSession.count({ where: { trainerId: u, status: "SCHEDULED", date: { gte: today } } }),
    db.programme.count({ where: { coordinatorId: u, status: { not: "COMPLETED" } } }),
    db.workshop.count({ where: { coordinatorId: u, status: "UPCOMING" } }),
    db.performanceReview.count({ where: { reviewerId: u, managerSubmittedAt: null, cycle: { stage: { not: "CLOSED" } } } }),
    db.employee.count({ where: { managerId: employeeId, status: { not: "EXITED" } } }),
  ]);
  const rows = [
    { key: "tasks", label: "Open project tasks", count: tasks, href: "/work" },
    { key: "projects", label: "Projects they own", count: projects, href: "/projects" },
    { key: "leads", label: "Open leads", count: leads, href: "/crm/leads" },
    { key: "deals", label: "Open deals", count: deals, href: "/crm/deals" },
    { key: "organizations", label: "Schools and institutions they look after", count: organizations, href: "/crm/organizations" },
    { key: "contacts", label: "Contacts", count: contacts, href: "/crm/contacts" },
    { key: "followUps", label: "Follow-ups not done", count: followUps, href: "/crm/activities" },
    { key: "helpdesk", label: "Helpdesk requests assigned to them", count: helpdesk, href: "/helpdesk" },
    { key: "sessions", label: "Upcoming school sessions as trainer", count: sessions, href: "/operations/schedule" },
    { key: "programmes", label: "School programmes they coordinate", count: programmes, href: "/operations/programmes" },
    { key: "workshops", label: "Upcoming workshops they coordinate", count: workshops, href: "/workshops" },
    { key: "reviews", label: "Performance reviews they still have to do", count: reviews, href: "/hr/reviews" },
    { key: "reports", label: "People who report to them", count: reports, href: "/hr/employees" },
  ] as const;
  return rows;
}

/** Things to settle before the last day that live in other modules: assets, kits, expense claims. */
export async function leavingChecks(employeeId: string, userId: string | null) {
  const [assets, kits, claims] = await Promise.all([
    db.asset.findMany({ where: { employeeId, status: "ASSIGNED" }, orderBy: { code: "asc" } }),
    userId
      ? db.stockRequest.findMany({
          where: { requesterId: userId, status: "ISSUED" },
          select: { id: true, number: true, purpose: true, returnBy: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
    db.expenseClaim.findMany({
      where: { employeeId, status: { in: ["SUBMITTED", "APPROVED"] } },
      select: { id: true, status: true, amount: true, approvedAmount: true, payslipId: true },
    }),
  ]);
  return { assets, kits, claims };
}

/** Exits waiting for this user to accept (direct reports for managers, everyone for admins). */
export function resignationsToAccept(user: CurrentUser) {
  const me = user.employee?.id ?? "__none__";
  return db.employeeExit.findMany({
    where: { stage: "REQUESTED", employeeId: { not: me }, ...(isAdmin(user) ? {} : { employee: { managerId: me } }) },
    include: { employee: { select: { id: true, firstName: true, lastName: true, designation: true } } },
    orderBy: { noticeGivenOn: "asc" },
  });
}
