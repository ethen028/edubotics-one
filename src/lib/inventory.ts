import "server-only";
import type { Prisma, StockRequestStatus } from "@prisma/client";
import { db } from "./db";
import { isAdmin, type CurrentUser } from "./auth";

export const INVENTORY_CATEGORIES = [
  "Robotics kit",
  "IoT kit",
  "Microcontroller board",
  "Sensor",
  "Motor / actuator",
  "Electronic component",
  "Cable / connector",
  "Battery / power",
  "Tool",
  "Consumable",
  "Other",
] as const;

export const STOCK_UNITS = ["pcs", "kit", "set", "pack", "box", "m"] as const;

/** Statuses where the request still needs someone to act. */
export const OPEN_REQUEST_STATUSES = ["PENDING", "APPROVED", "ISSUED"] as const satisfies readonly StockRequestStatus[];

export const requestNo = (n: number) => `REQ-${String(n).padStart(4, "0")}`;

export const isLowStock = (item: { onHand: number; reorderLevel: number }) => item.reorderLevel > 0 && item.onHand <= item.reorderLevel;

/** How many of a line are still out with the requester and expected back. Consumables never come back. */
export function outstanding(line: { issued: number; returned: number; writtenOff: number; item: { returnable: boolean } }) {
  return line.item.returnable ? line.issued - line.returned - line.writtenOff : 0;
}

/**
 * Which requests a user can see: admins all; managers their own and their direct reports';
 * everyone else their own. Requests for a project are also shown on that project's page.
 */
export function requestScope(user: CurrentUser): Prisma.StockRequestWhereInput {
  if (isAdmin(user)) return {};
  const mine: Prisma.StockRequestWhereInput[] = [{ requesterId: user.id }];
  if (user.role === "MANAGER" && user.employee) mine.push({ requester: { employee: { managerId: user.employee.id } } });
  return { OR: mine };
}

/** Who approves a request: any admin, or the requester's reporting manager. Never the requester. */
export async function canApproveRequest(user: CurrentUser, request: { requesterId: string }) {
  if (request.requesterId === user.id) return false;
  if (isAdmin(user)) return true;
  if (user.role !== "MANAGER" || !user.employee) return false;
  const requester = await db.employee.findUnique({ where: { userId: request.requesterId }, select: { managerId: true } });
  return requester?.managerId === user.employee.id;
}

/** Quantity approved but not yet handed out, per item. Shown as "reserved" so stock isn't promised twice. */
export async function reservedByItem(itemIds?: string[]) {
  const rows = await db.stockRequestLine.groupBy({
    by: ["itemId"],
    where: { request: { status: "APPROVED" }, ...(itemIds ? { itemId: { in: itemIds } } : {}) },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.itemId, r._sum.quantity ?? 0]));
}

/** Items at or below their reorder level. Postgres compares the two columns directly. */
export async function lowStockItems() {
  return db.$queryRaw<{ id: string; sku: string; name: string; unit: string; onHand: number; reorderLevel: number }[]>`
    SELECT "id", "sku", "name", "unit", "onHand", "reorderLevel" FROM "StockItem"
    WHERE "active" AND "reorderLevel" > 0 AND "onHand" <= "reorderLevel"
    ORDER BY "onHand" - "reorderLevel", "name"`;
}
