"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/auth";
import { parseDateOnly } from "@/lib/leave";
import { projectScope } from "@/lib/projects";
import { todayIST } from "@/lib/time";
import { MAX_DOCUMENT_BYTES, sniffMime } from "@/lib/hr-constants";
import { STOCK_UNITS } from "@/lib/inventory";
import { canApproveOrder, RECEIVABLE_STATUSES, BILLABLE_STATUSES, settledByBill } from "@/lib/purchases";
import { COMPANY_STATE, GST_RATES, INDIAN_STATES, PAYMENT_METHODS, orderTotals, poNo, round2 } from "@/lib/purchase-math";
import type { FormState } from "@/components/action-form";

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
/** yyyy-mm-dd from a date input, or null when blank or malformed. */
const toDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? parseDateOnly(v) : null);
const optionalDate = z
  .string()
  .trim()
  .transform(toDate)
  .nullable()
  .optional();
const requiredDate = (label: string) =>
  z
    .string()
    .trim()
    .transform(toDate)
    .refine((d) => d !== null, `Enter the ${label}`);
const money = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), `${label} must be a number like 4500 or 4500.50`)
    .transform(Number);

function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  return issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}

function refresh(opts: { orderId?: string; billId?: string; vendorId?: string; projectId?: string | null } = {}) {
  revalidatePath("/purchases", "layout");
  if (opts.projectId) revalidatePath(`/projects/${opts.projectId}`);
  revalidatePath("/inventory", "layout");
  revalidatePath("/approvals");
  revalidatePath("/");
}

// ─── Vendors (admins and managers) ─────────────────────────────────────────

const vendorSchema = z.object({
  name: z.string().trim().min(2, "Enter the vendor's name"),
  contactName: optional,
  phone: optional,
  email: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v.toLowerCase()))
    .refine((v) => v === null || z.email().safeParse(v).success, "That email doesn't look right"),
  address: optional,
  state: z.enum(INDIAN_STATES),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), "GSTIN should be 15 characters, like 32ABCDE1234F1Z5"),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^[A-Z]{5}\d{4}[A-Z]$/.test(v), "PAN should be 10 characters, like ABCDE1234F"),
  paymentDays: z.coerce.number().int("Use whole days").min(0).max(365),
  bankDetails: optional,
  notes: optional,
});

export async function createVendor(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN", "MANAGER"]);
  const parsed = vendorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  let vendor;
  try {
    vendor = await db.vendor.create({ data: parsed.data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "A vendor with that name already exists." };
    throw e;
  }
  refresh();
  const back = String(formData.get("back") ?? "");
  // Coming from a new purchase order: go straight back to it with this vendor picked.
  if (back === "order") redirect(`/purchases/new?vendor=${vendor.id}`);
  return { ok: `${vendor.name} added.` };
}

export async function updateVendor(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN", "MANAGER"]);
  const parsed = vendorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  try {
    await db.vendor.update({ where: { id }, data: parsed.data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "A vendor with that name already exists." };
    throw e;
  }
  refresh({ vendorId: id });
  return { ok: "Saved." };
}

export async function toggleVendorActive(id: string) {
  await requireUser(["ADMIN", "MANAGER"]);
  const vendor = await db.vendor.findUniqueOrThrow({ where: { id } });
  await db.vendor.update({ where: { id }, data: { active: !vendor.active } });
  refresh({ vendorId: id });
}

// ─── Purchase orders ───────────────────────────────────────────────────────

const orderSchema = z.object({
  vendorId: z.string().min(1, "Pick a vendor"),
  projectId: optional,
  purpose: z.string().trim().min(3, "Say what it's for"),
  expectedBy: optionalDate,
});

type DraftLine = { itemId: string | null; description: string; quantity: number; unit: string; unitPrice: number; gstRate: number };

/** Lines come in as repeated fields; blank rows are skipped. */
function readLines(formData: FormData): DraftLine[] | string {
  const get = (k: string) => formData.getAll(k).map((v) => String(v).trim());
  const [itemIds, descriptions, quantities, units, prices, rates] = ["lineItem", "lineDesc", "lineQty", "lineUnit", "linePrice", "lineGst"].map(get);
  const lines: DraftLine[] = [];
  for (let i = 0; i < descriptions.length; i++) {
    const itemId = itemIds[i] || null;
    const description = descriptions[i];
    if (!itemId && !description) continue;
    const label = description || `Line ${i + 1}`;
    const quantity = Number(quantities[i]);
    if (!Number.isInteger(quantity) || quantity < 1) return `${label}: quantity must be a whole number of at least 1.`;
    const price = (prices[i] ?? "").replace(/,/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(price)) return `${label}: enter the price per unit, like 450 or 450.50.`;
    const gstRate = Number(rates[i]);
    if (!(GST_RATES as readonly number[]).includes(gstRate)) return `${label}: pick a GST rate.`;
    const unit = (STOCK_UNITS as readonly string[]).includes(units[i]) ? units[i] : "pcs";
    lines.push({ itemId, description, quantity, unit, unitPrice: Number(price), gstRate });
  }
  return lines;
}

export async function createOrder(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = orderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const data = parsed.data;
  const lines = readLines(formData);
  if (typeof lines === "string") return { error: lines };
  if (lines.length === 0) return { error: "Add at least one thing to buy." };

  const itemIds = [...new Set(lines.flatMap((l) => (l.itemId ? [l.itemId] : [])))];
  const [vendor, items, project] = await Promise.all([
    db.vendor.findFirst({ where: { id: data.vendorId, active: true } }),
    db.stockItem.findMany({ where: { id: { in: itemIds }, active: true }, select: { id: true, name: true, unit: true } }),
    data.projectId ? db.project.findFirst({ where: { id: data.projectId, ...projectScope(user) }, select: { id: true } }) : null,
  ]);
  if (!vendor) return { error: "That vendor is no longer active. Reload and try again." };
  if (items.length !== itemIds.length) return { error: "One of the stock items is archived. Reload and try again." };
  if (data.projectId && !project) return { error: "You're not on that project." };
  const byId = new Map(items.map((i) => [i.id, i]));
  // A stock line takes the item's own name and unit, so receiving adds the right thing.
  for (const l of lines) {
    const item = l.itemId ? byId.get(l.itemId) : undefined;
    if (item) {
      l.description ||= item.name;
      l.unit = item.unit;
    }
  }

  const totals = orderTotals(lines);
  if (totals.total <= 0) return { error: "The order adds up to zero. Check the prices." };
  // Admins look after purchasing, so their own orders don't wait for approval.
  const autoApprove = isAdmin(user);
  const order = await db.purchaseOrder.create({
    data: {
      ...data,
      requesterId: user.id,
      interState: vendor.state !== COMPANY_STATE,
      ...totals,
      status: autoApprove ? "APPROVED" : "PENDING",
      ...(autoApprove ? { decidedById: user.id, decidedAt: new Date(), decisionNote: "Admin order, approved automatically" } : {}),
      lines: { create: lines },
    },
  });
  refresh({ projectId: data.projectId });
  redirect(`/purchases/${order.id}`);
}

async function loadOrder(id: string) {
  const order = await db.purchaseOrder.findUnique({ where: { id }, include: { lines: { include: { item: true } } } });
  if (!order) throw new Error("Purchase order not found");
  return order;
}

export async function decidePurchaseOrder(id: string, formData: FormData) {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const order = await loadOrder(id);
  if (order.status !== "PENDING") return;
  if (!(await canApproveOrder(user, order))) throw new Error("Not allowed");
  const decision = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim() || null;
  await db.purchaseOrder.update({
    where: { id },
    data: {
      status: decision,
      decisionNote: note,
      decidedById: user.id,
      decidedAt: new Date(),
      closedAt: decision === "REJECTED" ? new Date() : null,
    },
  });
  refresh({ orderId: id, projectId: order.projectId });
}

export async function markOrdered(id: string) {
  await requireUser(["ADMIN"]);
  const order = await loadOrder(id);
  if (order.status !== "APPROVED") return;
  await db.purchaseOrder.update({ where: { id }, data: { status: "ORDERED", orderedAt: new Date() } });
  refresh({ orderId: id });
}

export async function cancelOrder(id: string) {
  const user = await requireUser();
  const order = await loadOrder(id);
  if (order.requesterId !== user.id && !isAdmin(user)) throw new Error("Only the requester or an admin can cancel");
  if (!["PENDING", "APPROVED", "ORDERED"].includes(order.status) || order.lines.some((l) => l.received > 0))
    throw new Error("Orders with goods received can't be cancelled. Close it instead.");
  await db.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED", closedAt: new Date() } });
  refresh({ orderId: id, projectId: order.projectId });
}

/** Stop waiting for the rest of a part-delivered order. */
export async function closeOrder(id: string) {
  await requireUser(["ADMIN"]);
  const order = await loadOrder(id);
  if (order.status !== "PART_RECEIVED") return;
  await db.purchaseOrder.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });
  refresh({ orderId: id });
}

/** Record a delivery. Lines linked to a stock item go into inventory and update its unit cost. */
export async function receiveOrder(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const order = await loadOrder(id);
  if (!(RECEIVABLE_STATUSES as readonly string[]).includes(order.status)) return { error: "This order isn't waiting for goods." };
  const receivedOn = toDate(String(formData.get("receivedOn") ?? "")) ?? todayIST();
  const note = String(formData.get("note") ?? "").trim() || null;

  const plan: { lineId: string; qty: number; itemId: string | null; unitPrice: number }[] = [];
  for (const line of order.lines) {
    const left = line.quantity - line.received;
    if (left <= 0) continue;
    const qty = Number(formData.get(`recv_${line.id}`) ?? 0);
    if (!Number.isInteger(qty) || qty < 0) return { error: `${line.description}: use a whole number.` };
    if (qty > left) return { error: `${line.description}: only ${left} still to come.` };
    if (qty > 0) plan.push({ lineId: line.id, qty, itemId: line.itemId, unitPrice: Number(line.unitPrice) });
  }
  if (plan.length === 0) return { error: "Enter what arrived." };

  await db.$transaction(async (tx) => {
    const receipt = await tx.purchaseReceipt.create({
      data: { orderId: id, receivedOn, note, byId: user.id, lines: { create: plan.map((p) => ({ lineId: p.lineId, quantity: p.qty })) } },
    });
    for (const p of plan) {
      await tx.purchaseOrderLine.update({ where: { id: p.lineId }, data: { received: { increment: p.qty } } });
      if (p.itemId) {
        await tx.stockItem.update({ where: { id: p.itemId }, data: { onHand: { increment: p.qty }, unitCost: p.unitPrice } });
        await tx.stockMovement.create({
          data: {
            itemId: p.itemId,
            type: "RECEIVE",
            quantity: p.qty,
            note: `${poNo(order.number)}${note ? ` · ${note}` : ""}`,
            receiptId: receipt.id,
            projectId: order.projectId,
            byId: user.id,
          },
        });
      }
    }
    const lines = await tx.purchaseOrderLine.findMany({ where: { orderId: id }, select: { quantity: true, received: true } });
    const done = lines.every((l) => l.received >= l.quantity);
    await tx.purchaseOrder.update({
      where: { id },
      data: { status: done ? "RECEIVED" : "PART_RECEIVED", closedAt: done ? new Date() : null, orderedAt: order.orderedAt ?? new Date() },
    });
  });
  refresh({ orderId: id, projectId: order.projectId });
  const stocked = plan.filter((p) => p.itemId).length;
  return { ok: stocked ? `Delivery recorded. ${stocked} stock item${stocked > 1 ? "s" : ""} updated.` : "Delivery recorded." };
}

// ─── Vendor bills and payments (admins) ────────────────────────────────────

const billSchema = z.object({
  vendorId: z.string().min(1, "Pick a vendor"),
  orderId: optional,
  billNo: z.string().trim().min(1, "Enter the vendor's invoice number"),
  billDate: requiredDate("bill date"),
  dueDate: optionalDate,
  subtotal: money("Amount before GST"),
  tax: money("GST"),
  notes: optional,
});

export async function createBill(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const parsed = billSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { dueDate, ...data } = parsed.data;
  if (!data.billDate) return { error: "Enter the bill date." };
  const vendor = await db.vendor.findUnique({ where: { id: data.vendorId } });
  if (!vendor) return { error: "Pick a vendor." };
  if (data.orderId) {
    const order = await db.purchaseOrder.findUnique({ where: { id: data.orderId }, select: { vendorId: true, status: true } });
    if (!order || order.vendorId !== vendor.id) return { error: "That purchase order is from another vendor." };
    if (!(BILLABLE_STATUSES as readonly string[]).includes(order.status)) return { error: "That purchase order isn't approved." };
  }
  const total = round2(data.subtotal + data.tax);
  if (total <= 0) return { error: "The bill adds up to zero." };
  const due = dueDate ?? new Date(data.billDate.getTime() + vendor.paymentDays * 86_400_000);
  if (due < data.billDate) return { error: "The due date is before the bill date." };

  let file: { fileName: string; mimeType: string; size: number; data: Uint8Array<ArrayBuffer> } | undefined;
  const upload = formData.get("file");
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > MAX_DOCUMENT_BYTES) return { error: "The bill file can be up to 5 MB." };
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const mimeType = sniffMime(bytes);
    if (!mimeType) return { error: "Attach the bill as a photo (JPG, PNG, WebP) or a PDF." };
    file = { fileName: upload.name.slice(0, 200) || "bill", mimeType, size: upload.size, data: bytes };
  }

  let bill;
  try {
    bill = await db.vendorBill.create({
      data: { ...data, billDate: data.billDate, dueDate: due, total, byId: user.id, ...(file ? { file: { create: file } } : {}) },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { error: `Bill ${data.billNo} from ${vendor.name} is already entered.` };
    throw e;
  }
  refresh({ vendorId: vendor.id, orderId: data.orderId ?? undefined });
  redirect(`/purchases/bills/${bill.id}`);
}

export async function cancelBill(id: string) {
  await requireUser(["ADMIN"]);
  const bill = await db.vendorBill.findUniqueOrThrow({ where: { id }, include: { _count: { select: { payments: true } } } });
  if (bill._count.payments > 0) throw new Error("Remove the payments first");
  await db.vendorBill.update({ where: { id }, data: { status: "CANCELLED" } });
  refresh({ billId: id, vendorId: bill.vendorId });
}

const paymentSchema = z.object({
  paidOn: requiredDate("payment date"),
  amount: money("Amount paid"),
  tds: z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, "") || "0")
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "TDS must be a number")
    .transform(Number),
  method: z.enum(PAYMENT_METHODS),
  reference: optional,
  note: optional,
});

export async function recordPayment(billId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN"]);
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { paidOn, ...data } = parsed.data;
  if (!paidOn) return { error: "Enter the payment date." };
  if (data.amount + data.tds <= 0) return { error: "Enter the amount paid." };
  const bill = await db.vendorBill.findUniqueOrThrow({ where: { id: billId } });
  if (bill.status !== "OPEN") return { error: "This bill is cancelled." };
  const settled = (await settledByBill([billId])).get(billId) ?? 0;
  const balance = round2(Number(bill.total) - settled);
  if (round2(data.amount + data.tds) > balance) return { error: `Only ₹${balance.toLocaleString("en-IN")} is left to pay on this bill.` };
  await db.vendorPayment.create({ data: { ...data, paidOn, billId, byId: user.id } });
  refresh({ billId, vendorId: bill.vendorId });
  return { ok: "Payment recorded." };
}

export async function deletePayment(id: string) {
  await requireUser(["ADMIN"]);
  const payment = await db.vendorPayment.delete({ where: { id }, include: { bill: { select: { vendorId: true } } } });
  refresh({ billId: payment.billId, vendorId: payment.bill.vendorId });
}
