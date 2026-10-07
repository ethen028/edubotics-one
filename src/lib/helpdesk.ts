import "server-only";
import type { Prisma, TicketStatus } from "@prisma/client";
import { db } from "./db";
import { isAdmin, type CurrentUser } from "./auth";

/** What staff can ask the admin team for. Equipment and repair requests can point at an HR asset. */
export const HELPDESK_CATEGORIES = [
  "Laptop or equipment",
  "Repair or maintenance",
  "ID card or access card",
  "Salary or experience letter",
  "Salary or payslip query",
  "Email, accounts or software",
  "Office supplies",
  "Travel or accommodation",
  "Other",
] as const;

export const ASSET_CATEGORIES_FOR_HELPDESK: readonly string[] = ["Laptop or equipment", "Repair or maintenance", "ID card or access card"];

export const OPEN_TICKET_STATUSES = ["OPEN", "IN_PROGRESS"] as const satisfies readonly TicketStatus[];

export const ticketNo = (n: number) => `HD-${String(n).padStart(3, "0")}`;

/** Admins see every request; everyone else sees what they raised or were given to handle. */
export function ticketScope(user: CurrentUser): Prisma.HelpdeskTicketWhereInput {
  if (isAdmin(user)) return {};
  return { OR: [{ requesterId: user.id }, { assigneeId: user.id }] };
}

/** Admins and the person it's assigned to move a request along. */
export function canHandle(user: CurrentUser, ticket: { assigneeId: string | null }) {
  return isAdmin(user) || ticket.assigneeId === user.id;
}

/** Numbers for the menu badge and Home: requests waiting on this user, and updates they haven't seen. */
export async function helpdeskCounts(user: CurrentUser) {
  const [unread, assigned, unassigned] = await Promise.all([
    db.helpdeskTicket.count({ where: { requesterId: user.id, requesterUnread: true } }),
    db.helpdeskTicket.count({ where: { assigneeId: user.id, status: { in: [...OPEN_TICKET_STATUSES] } } }),
    isAdmin(user) ? db.helpdeskTicket.count({ where: { status: "OPEN", assigneeId: null } }) : 0,
  ]);
  return { unread, assigned, unassigned, total: unread + assigned + unassigned };
}
