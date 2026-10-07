"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseDateOnly } from "@/lib/leave";
import { getSettings } from "@/lib/settings";
import { GST_RATES, INDIAN_STATES, PAYMENT_METHODS, computeTotals, financialYear, invoiceNumber, settledAmount } from "@/lib/invoices";
import type { FormState } from "@/components/action-form";

const BILLING_ROLES = ["ADMIN", "MANAGER"] as const;

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const date = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "pick a date")
  .transform(parseDateOnly);
const money = z.coerce.number().min(0, "can't be negative").max(1e11);

function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  return `${issue.path.join(" ") || "Form"}: ${issue.message}`;
}

function refresh(id?: string) {
  revalidatePath("/invoices", "layout");
  if (id) revalidatePath(`/invoices/${id}`);
  revalidatePath("/crm", "layout");
  revalidatePath("/");
}

const lineSchema = z.object({
  description: z.string().trim().min(1, "every line needs a description").max(500),
  sac: z.string().trim().max(10).nullish(),
  quantity: z.coerce.number().positive("quantity must be more than 0").max(1e6),
  unitPrice: money,
  gstRate: z.coerce.number().refine((r) => (GST_RATES as readonly number[]).includes(r), "pick a GST rate"),
});

const invoiceSchema = z.object({
  organizationId: z.string().min(1, "pick a school or institution"),
  contactId: optional,
  dealId: optional,
  projectId: optional,
  billToName: z.string().trim().min(1, "required"),
  billToAddress: optional,
  billToGstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[0-9]{2}[A-Z0-9]{13}$/.test(v), "a GSTIN has 15 letters and digits")
    .transform((v) => v || null),
  placeOfSupply: z.enum(INDIAN_STATES),
  issueDate: date,
  dueDate: date,
  notes: optional,
  lines: z
    .string()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "couldn't read the lines" });
        return z.NEVER;
      }
    })
    .pipe(z.array(lineSchema).min(1, "add at least one line").max(50)),
});

/** Parse the form and work out the amounts the invoice will store. */
async function readInvoiceForm(formData: FormData) {
  const parsed = invoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) } as const;
  const { lines, ...data } = parsed.data;
  if (data.dueDate < data.issueDate) return { error: "The due date is before the invoice date." } as const;
  const settings = await getSettings();
  const totals = computeTotals(lines, { interState: data.placeOfSupply !== settings.companyState, gstEnabled: settings.gstEnabled });
  return {
    data: {
      ...data,
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      total: totals.total,
    },
    lines: totals.lines.map((l, position) => ({ ...l, sac: l.sac || null, position })),
  } as const;
}

export async function createInvoice(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser([...BILLING_ROLES]);
  const form = await readInvoiceForm(formData);
  if ("error" in form) return { error: form.error };
  const invoice = await db.invoice.create({
    data: { ...form.data, createdById: user.id, lines: { create: form.lines } },
  });
  refresh();
  redirect(`/invoices/${invoice.id}`);
}

async function draft(id: string) {
  const invoice = await db.invoice.findUnique({ where: { id } });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "DRAFT") throw new Error("Only a draft can be changed. Cancel the invoice and make a new one instead.");
  return invoice;
}

export async function updateInvoice(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser([...BILLING_ROLES]);
  await draft(id);
  const form = await readInvoiceForm(formData);
  if ("error" in form) return { error: form.error };
  await db.$transaction([
    db.invoiceLine.deleteMany({ where: { invoiceId: id } }),
    db.invoice.update({ where: { id }, data: { ...form.data, lines: { create: form.lines } } }),
  ]);
  refresh(id);
  return { ok: "Draft saved." };
}

export async function deleteDraft(id: string) {
  await requireUser([...BILLING_ROLES]);
  await draft(id);
  await db.invoice.delete({ where: { id } });
  refresh();
  redirect("/invoices");
}

/**
 * Give the draft the next number in its financial year and lock it. Numbers have no gaps,
 * because drafts never take one and cancelled invoices keep theirs.
 */
export async function issueInvoice(id: string) {
  await requireUser([...BILLING_ROLES]);
  const invoice = await draft(id);
  const settings = await getSettings();
  // Amounts follow today's GST settings, in case they changed since the draft was saved.
  const lines = await db.invoiceLine.findMany({ where: { invoiceId: id }, orderBy: { position: "asc" } });
  const totals = computeTotals(
    lines.map((l) => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), gstRate: Number(l.gstRate) })),
    { interState: invoice.placeOfSupply !== settings.companyState, gstEnabled: settings.gstEnabled },
  );
  const fy = financialYear(invoice.issueDate);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.$transaction(async (tx) => {
        const last = await tx.invoice.aggregate({ where: { fy }, _max: { seq: true } });
        const seq = (last._max.seq ?? 0) + 1;
        await tx.invoice.update({
          where: { id, status: "DRAFT" },
          data: {
            status: "ISSUED",
            fy,
            seq,
            number: invoiceNumber(settings.invoicePrefix, fy, seq),
            issuedAt: new Date(),
            subtotal: totals.subtotal,
            cgst: totals.cgst,
            sgst: totals.sgst,
            igst: totals.igst,
            total: totals.total,
          },
        });
        for (const [i, l] of totals.lines.entries()) {
          await tx.invoiceLine.update({ where: { id: lines[i].id }, data: { gstRate: l.gstRate, amount: l.amount } });
        }
      });
      break;
    } catch (e) {
      // Someone else issued an invoice at the same moment and took the number: try the next one.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }
  refresh(id);
}

export async function cancelInvoice(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why it's being cancelled." };
  const invoice = await db.invoice.findUnique({ where: { id }, include: { payments: true } });
  if (!invoice || invoice.status !== "ISSUED") return { error: "Only an issued invoice can be cancelled." };
  if (invoice.payments.length > 0) return { error: "Remove the payments recorded against it first." };
  await db.invoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
  refresh(id);
  return { ok: "Invoice cancelled." };
}

// ─── Payments ──────────────────────────────────────────────────────────────

const paymentSchema = z.object({
  receivedOn: date,
  amount: money,
  tds: money.optional().default(0),
  method: z.enum(PAYMENT_METHODS),
  reference: optional,
  note: optional,
});

export async function recordPayment(invoiceId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser([...BILLING_ROLES]);
  const parsed = paymentSchema.safeParse({ ...Object.fromEntries(formData), tds: formData.get("tds") || 0 });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const p = parsed.data;
  if (p.amount + p.tds <= 0) return { error: "Enter the amount received." };
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  if (!invoice || invoice.status !== "ISSUED") return { error: "Payments can only be recorded on an issued invoice." };
  const balance = Number(invoice.total) - settledAmount(invoice.payments);
  if (p.amount + p.tds > balance + 0.005) return { error: `That's more than the ${balance.toFixed(2)} still due. Check the amount.` };
  await db.invoicePayment.create({ data: { ...p, invoiceId, recordedById: user.id } });
  refresh(invoiceId);
  return { ok: "Payment recorded." };
}

export async function deletePayment(id: string) {
  await requireUser(["ADMIN"]);
  const payment = await db.invoicePayment.delete({ where: { id } });
  refresh(payment.invoiceId);
}
