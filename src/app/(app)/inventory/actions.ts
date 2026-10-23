"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { optionalDateOnlyInput } from "@/lib/date-input";
import { projectScope } from "@/lib/projects";
import { INVENTORY_CATEGORIES, STOCK_UNITS, canApproveRequest, outstanding, requestNo } from "@/lib/inventory";
import type { FormState } from "@/components/action-form";
import { flash } from "@/lib/flash";

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const optionalDate = optionalDateOnlyInput;
const count = z.coerce.number().int("Use whole numbers").min(0, "Can't be negative").max(2147483647, "Quantity is too large");

function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  return issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}

function refresh(opts: { itemId?: string; requestId?: string; projectId?: string | null } = {}) {
  revalidatePath("/inventory", "layout");
  if (opts.itemId) revalidatePath(`/inventory/${opts.itemId}`);
  if (opts.requestId) revalidatePath(`/inventory/requests/${opts.requestId}`);
  if (opts.projectId) revalidatePath(`/projects/${opts.projectId}`);
  revalidatePath("/approvals");
  revalidatePath("/");
}

// ─── Stock items (admins) ──────────────────────────────────────────────────

const itemSchema = z.object({
  sku: z.string().trim().toUpperCase().min(2, "Enter an item code, e.g. EB-KIT-ARD-01"),
  name: z.string().trim().min(2, "Enter a name"),
  category: z.enum(INVENTORY_CATEGORIES),
  unit: z.enum(STOCK_UNITS),
  location: optional,
  returnable: z.literal("on").optional().transform((v) => v === "on"),
  reorderLevel: count,
  unitCost: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0 && Number(v) <= 99999999.99), "Unit cost must be from 0 to 99999999.99, with up to two decimal places"),
  notes: optional,
});

export async function createItem(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const parsed = itemSchema.extend({ opening: count }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { opening, ...data } = parsed.data;
  try {
    await db.stockItem.create({
      data: {
        ...data,
        onHand: opening,
        movements: opening > 0 ? { create: { type: "RECEIVE", quantity: opening, note: "Opening stock", byId: user.id } } : undefined,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "That item code is already used." };
    throw e;
  }
  refresh();
  return { ok: `${data.name} added.` };
}

export async function updateItem(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  try {
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "StockItem" WHERE "id" = ${id} FOR UPDATE`;
      const item = await tx.stockItem.findUniqueOrThrow({ where: { id }, include: { _count: { select: { requestLines: true, movements: true, poLines: true } } } });
      if ((item.unit !== parsed.data.unit || item.returnable !== parsed.data.returnable) && (item._count.requestLines || item._count.movements || item._count.poLines)) return { error: "Unit and return rules cannot change after stock activity. Create a separate item instead." };
      await tx.stockItem.update({ where: { id }, data: parsed.data });
      return { ok: "Saved." };
    });
    if (result.error) return result;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "That item code is already used." };
    throw e;
  }
  refresh({ itemId: id });
  return { ok: "Saved." };
}

export async function toggleItemActive(id: string) {
  await requireUser(["ADMIN"]);
  const item = await db.stockItem.findUniqueOrThrow({ where: { id } });
  await db.stockItem.update({ where: { id }, data: { active: !item.active } });
  refresh({ itemId: id });
}

const movementSchema = z.object({
  kind: z.enum(["RECEIVE", "COUNT", "WRITE_OFF"]),
  quantity: count,
  note: optional,
});

/** Receive new stock, correct the count after a stock check, or write off lost/damaged units. */
export async function recordMovement(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const parsed = movementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { kind, quantity, note } = parsed.data;
  if (kind !== "COUNT" && quantity === 0) return { error: "Enter a quantity above 0." };
  if (kind === "WRITE_OFF" && !note) return { error: "Say why it's written off (lost, damaged, used in the lab…)." };

  const result = await db.$transaction(async (tx) => {
    const item = await tx.stockItem.findUniqueOrThrow({ where: { id } });
    const delta = kind === "RECEIVE" ? quantity : kind === "WRITE_OFF" ? -quantity : quantity - item.onHand;
    if (delta === 0) return { ok: "The count already matches. Nothing changed." };
    if (item.onHand + delta < 0) return { error: `Only ${item.onHand} ${item.unit} in stock.` };
    if (item.onHand + delta > 2147483647) return { error: "The resulting stock count is too large." };
    // Guard against a parallel change between the read and the write.
    const updated = await tx.stockItem.updateMany({ where: { id, onHand: item.onHand }, data: { onHand: item.onHand + delta } });
    if (updated.count === 0) return { error: "Stock changed while you were saving. Try again." };
    await tx.stockMovement.create({
      data: { itemId: id, type: kind === "COUNT" ? "ADJUST" : kind, quantity: delta, note: note ?? (kind === "COUNT" ? "Stock count" : null), byId: user.id },
    });
    return { ok: `Stock is now ${item.onHand + delta} ${item.unit}.` };
  });
  refresh({ itemId: id });
  return result;
}

// ─── Requests ──────────────────────────────────────────────────────────────

const requestSchema = z.object({
  projectId: optional,
  purpose: z.string().trim().min(3, "Say what it's for"),
  neededBy: optionalDate,
  returnBy: optionalDate,
});

export async function createRequest(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const data = parsed.data;
  if (data.neededBy && data.returnBy && data.returnBy < data.neededBy) return { error: "Return date is before the date it's needed." };

  // Lines come in as itemId / quantity pairs; blank rows are skipped and repeats are added up.
  const itemIds = formData.getAll("itemId").map(String);
  const quantities = formData.getAll("quantity").map(String);
  const wanted = new Map<string, number>();
  for (let i = 0; i < itemIds.length; i++) {
    if (!itemIds[i]) continue;
    const q = Number(quantities[i]);
    if (!Number.isInteger(q) || q < 1 || q > 2147483647) return { error: "Each item needs a valid whole-number quantity of at least 1." };
    wanted.set(itemIds[i], (wanted.get(itemIds[i]) ?? 0) + q);
    if (wanted.get(itemIds[i])! > 2147483647) return { error: "The combined item quantity is too large." };
  }
  if (wanted.size === 0) return { error: "Add at least one item." };

  const [items, project] = await Promise.all([
    db.stockItem.findMany({ where: { id: { in: [...wanted.keys()] }, active: true }, select: { id: true } }),
    data.projectId ? db.project.findFirst({ where: { id: data.projectId, ...projectScope(user) }, select: { id: true } }) : null,
  ]);
  if (items.length !== wanted.size) return { error: "One of the items is no longer stocked. Reload and try again." };
  if (data.projectId && !project) return { error: "You're not on that project." };

  // Admins look after the stock, so their own requests don't wait for approval.
  const autoApprove = isAdmin(user);
  const request = await db.stockRequest.create({
    data: {
      ...data,
      requesterId: user.id,
      status: autoApprove ? "APPROVED" : "PENDING",
      ...(autoApprove ? { decidedById: user.id, decidedAt: new Date(), decisionNote: "Admin request, approved automatically" } : {}),
      lines: { create: [...wanted].map(([itemId, quantity]) => ({ itemId, quantity })) },
    },
  });
  refresh({ projectId: data.projectId });
  await flash("Stock request sent.");
  redirect(`/inventory/requests/${request.id}`);
}

async function loadRequest(id: string) {
  const request = await db.stockRequest.findUnique({ where: { id }, include: { lines: { include: { item: true } } } });
  if (!request) throw new Error("Request not found");
  return request;
}

export async function cancelRequest(id: string) {
  const user = await requireUser();
  const request = await loadRequest(id);
  if (request.requesterId !== user.id && !isAdmin(user)) throw new Error("Only the requester or an admin can cancel");
  if (request.status !== "PENDING" && request.status !== "APPROVED") throw new Error("Only requests not yet issued can be cancelled");
  const changed = await db.stockRequest.updateMany({ where: { id, status: { in: ["PENDING", "APPROVED"] } }, data: { status: "CANCELLED", closedAt: new Date() } });
  if (!changed.count) throw new Error("The request changed. Reload before cancelling.");
  refresh({ requestId: id, projectId: request.projectId });
}

export async function decideStockRequest(id: string, formData: FormData) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const request = await loadRequest(id);
  if (request.status !== "PENDING") return;
  if (!(await canApproveRequest(user, request))) throw new Error("Not allowed");
  const decision = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim() || null;
  await db.stockRequest.updateMany({
    where: { id, status: "PENDING" },
    data: {
      status: decision,
      decisionNote: note,
      decidedById: user.id,
      decidedAt: new Date(),
      closedAt: decision === "REJECTED" ? new Date() : null,
    },
  });
  refresh({ requestId: id, projectId: request.projectId });
}

/** Hand items out. Each line can be issued in part (e.g. only 8 of 10 kits in stock); the rest is dropped. */
export async function issueRequest(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const request = await loadRequest(id);
  if (request.status !== "APPROVED") return { error: "Only approved requests can be issued." };

  const plan: { lineId: string; itemId: string; qty: number; name: string; returnable: boolean }[] = [];
  for (const line of request.lines) {
    const qty = Number(formData.get(`issue_${line.id}`) ?? 0);
    if (!Number.isInteger(qty) || qty < 0) return { error: `${line.item.name}: use a whole number.` };
    if (qty > line.quantity) return { error: `${line.item.name}: more than was asked for (${line.quantity}).` };
    plan.push({ lineId: line.id, itemId: line.itemId, qty, name: line.item.name, returnable: line.item.returnable });
  }
  if (plan.every((p) => p.qty === 0)) return { error: "Nothing to issue. Cancel the request instead." };

  try {
    await db.$transaction(async (tx) => {
      // Claim the request before changing stock; concurrent issue/cancel attempts cannot win twice.
      const claimed = await tx.stockRequest.updateMany({ where: { id, status: "APPROVED" }, data: { status: "ISSUED" } });
      if (!claimed.count) throw new Error("Request changed. Reload before issuing it.");
      for (const p of plan) {
        if (p.qty > 0) {
          const taken = await tx.stockItem.updateMany({ where: { id: p.itemId, active: true, onHand: { gte: p.qty } }, data: { onHand: { decrement: p.qty } } });
          if (taken.count === 0) throw new Error(`Not enough ${p.name} in stock.`);
          await tx.stockMovement.create({
            data: { itemId: p.itemId, type: "ISSUE", quantity: -p.qty, requestId: id, projectId: request.projectId, byId: user.id },
          });
        }
        await tx.stockRequestLine.update({ where: { id: p.lineId }, data: { issued: p.qty } });
      }
      const anythingOut = plan.some((p) => p.returnable && p.qty > 0);
      await tx.stockRequest.update({
        where: { id },
        data: { status: anythingOut ? "ISSUED" : "CLOSED", issuedAt: new Date(), closedAt: anythingOut ? null : new Date() },
      });
    });
  } catch (e) {
    if (e instanceof Error && /^(Not enough|Request changed)/.test(e.message)) return { error: e.message };
    throw e;
  }
  refresh({ requestId: id, projectId: request.projectId });
  for (const p of plan) revalidatePath(`/inventory/${p.itemId}`);
  return { ok: `${requestNo(request.number)} issued.` };
}

/** Take items back in. Anything lost, broken or used up is written off instead of returned to stock. */
export async function returnRequest(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const request = await loadRequest(id);
  if (request.status !== "ISSUED") return { error: "Only issued requests can be returned." };

  const plan: { lineId: string; itemId: string; back: number; lost: number; returned: number; writtenOff: number }[] = [];
  for (const line of request.lines) {
    const left = outstanding(line);
    if (left === 0) continue;
    if (formData.get(`expected_${line.id}`) !== `${line.issued}:${line.returned}:${line.writtenOff}`) return { error: "Return changed. Reload before recording another return." };
    const back = Number(formData.get(`return_${line.id}`) ?? 0);
    const lost = Number(formData.get(`lost_${line.id}`) ?? 0);
    if (![back, lost].every((n) => Number.isInteger(n) && n >= 0)) return { error: `${line.item.name}: use whole numbers.` };
    if (back + lost > left) return { error: `${line.item.name}: only ${left} still out.` };
    if (back + lost > 0) plan.push({ lineId: line.id, itemId: line.itemId, back, lost, returned: line.returned, writtenOff: line.writtenOff });
  }
  if (plan.length === 0) return { error: "Enter what came back." };
  const note = String(formData.get("note") ?? "").trim() || null;
  if (plan.some(line => line.lost > 0) && !note) return { error: "Add a reason for items written off while out." };

  try { await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "StockRequest" WHERE "id" = ${id} FOR UPDATE`;
    const current = await tx.stockRequest.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    if (current.status !== "ISSUED" || plan.some(p => {
      const line = current.lines.find(line => line.id === p.lineId);
      return !line || line.returned !== p.returned || line.writtenOff !== p.writtenOff || p.back + p.lost > line.issued - line.returned - line.writtenOff;
    })) throw new Error("Return changed. Reload before recording another return.");
    for (const p of plan) {
      if (p.back > 0) {
        await tx.stockItem.update({ where: { id: p.itemId }, data: { onHand: { increment: p.back } } });
        await tx.stockMovement.create({
          data: { itemId: p.itemId, type: "RETURN", quantity: p.back, note, requestId: id, projectId: request.projectId, byId: user.id },
        });
      }
      if (p.lost > 0) await tx.stockMovement.create({ data: { itemId: p.itemId, type: "WRITE_OFF", quantity: 0, note: `${p.lost} unit(s) written off while issued; no stock-on-hand change. ${note}`, requestId: id, projectId: request.projectId, byId: user.id } });
      await tx.stockRequestLine.update({
        where: { id: p.lineId },
        data: { returned: { increment: p.back }, writtenOff: { increment: p.lost } },
      });
    }
    const lines = await tx.stockRequestLine.findMany({ where: { requestId: id }, include: { item: { select: { returnable: true } } } });
    if (lines.every((l) => outstanding(l) === 0)) {
      await tx.stockRequest.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });
    }
  }); } catch (error) {
    if (error instanceof Error && error.message.startsWith("Return changed")) return { error: error.message };
    throw error;
  }
  refresh({ requestId: id, projectId: request.projectId });
  for (const p of plan) revalidatePath(`/inventory/${p.itemId}`);
  return { ok: "Return recorded." };
}
