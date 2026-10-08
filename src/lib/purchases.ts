import "server-only";
import type { Prisma, PurchaseOrderStatus } from "@prisma/client";
import { db } from "./db";
import { isAdmin, type CurrentUser } from "./auth";

/** Approved orders still waiting for goods. */
export const RECEIVABLE_STATUSES = ["APPROVED", "ORDERED", "PART_RECEIVED"] as const satisfies readonly PurchaseOrderStatus[];
/** Orders someone still has to act on. */
export const OPEN_PO_STATUSES = ["PENDING", ...RECEIVABLE_STATUSES] as const satisfies readonly PurchaseOrderStatus[];
/** Orders with goods in hand, so a bill can be entered against them. */
export const BILLABLE_STATUSES = ["APPROVED", "ORDERED", "PART_RECEIVED", "RECEIVED", "CLOSED"] as const satisfies readonly PurchaseOrderStatus[];

/**
 * Which purchase orders a user can see: admins all; managers their own and their direct reports';
 * everyone else their own.
 */
export function orderScope(user: CurrentUser): Prisma.PurchaseOrderWhereInput {
  if (isAdmin(user)) return {};
  const mine: Prisma.PurchaseOrderWhereInput[] = [{ requesterId: user.id }];
  if (user.role === "MANAGER" && user.employee) mine.push({ requester: { employee: { managerId: user.employee.id } } });
  return { OR: mine };
}

/** Who approves an order: any admin, or the requester's reporting manager. Never the requester. */
export async function canApproveOrder(user: CurrentUser, order: { requesterId: string }) {
  if (order.requesterId === user.id) return false;
  if (isAdmin(user)) return true;
  if (user.role !== "MANAGER" || !user.employee) return false;
  const requester = await db.employee.findUnique({ where: { userId: order.requesterId }, select: { managerId: true } });
  return requester?.managerId === user.employee.id;
}

/** Paid plus TDS held back, per bill. Both settle the bill. */
export async function settledByBill(billIds?: string[]) {
  const rows = await db.vendorPayment.groupBy({
    by: ["billId"],
    where: billIds ? { billId: { in: billIds } } : {},
    _sum: { amount: true, tds: true },
  });
  return new Map(rows.map((r) => [r.billId, Number(r._sum.amount ?? 0) + Number(r._sum.tds ?? 0)]));
}

/** Units ordered from vendors but not yet delivered, per stock item. */
export async function onOrderByItem(itemIds?: string[]) {
  const lines = await db.purchaseOrderLine.findMany({
    where: { itemId: itemIds ? { in: itemIds } : { not: null }, order: { status: { in: [...RECEIVABLE_STATUSES] } } },
    select: { itemId: true, quantity: true, received: true },
  });
  const map = new Map<string, number>();
  for (const l of lines) if (l.itemId) map.set(l.itemId, (map.get(l.itemId) ?? 0) + Math.max(0, l.quantity - l.received));
  return map;
}
