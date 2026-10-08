"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseDateOnly } from "@/lib/leave";
import { getSettings } from "@/lib/settings";
import { todayIST } from "@/lib/time";
import { PAYMENT_METHODS, computeTotals, financialYear } from "@/lib/invoices";
import { CREDIT_REASONS, creditNoteNumber } from "@/lib/credit-notes";
import type { FormState } from "@/components/action-form";
import { invoiceForCredit } from "./data";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const date = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "pick a date")
  .transform(parseDateOnly);

const schema = z.object({
  reason: z.enum(CREDIT_REASONS, "pick a reason"),
  reasonNote: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null),
  issueDate: date,
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
    .pipe(
      z.array(
        z.object({
          invoiceLineId: z.string().min(1),
          quantity: z.coerce.number().min(0, "quantity can't be negative").max(1e6),
          unitPrice: z.coerce.number().min(0, "rate can't be negative").max(1e11),
        }),
      ),
    ),
});

function refresh(invoiceId: string, id?: string) {
  revalidatePath("/credit-notes", "layout");
  if (id) revalidatePath(`/credit-notes/${id}`);
  revalidatePath("/invoices", "layout");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/crm", "layout");
  revalidatePath("/");
}

/**
 * Raise a credit note against one issued invoice. It is numbered straight away (EBG/CN/26-27/001),
 * carries the invoice lines' GST rates and the invoice's CGST+SGST or IGST split, and can't take off
 * more than is left on any invoice line.
 */
export async function createCreditNote(invoiceId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue.path[0] === "reason" ? "Pick a reason." : issue.message };
  }
  const f = parsed.data;
  if (f.reason === "OTHER" && !f.reasonNote) return { error: "Say what the credit is for." };

  const ctx = await invoiceForCredit(invoiceId);
  if (!ctx || ctx.invoice.status !== "ISSUED") return { error: "A credit note can only be raised on an issued invoice." };
  if (f.issueDate < ctx.invoice.issueDate) return { error: "The credit note can't be dated before the invoice." };
  if (f.issueDate > todayIST()) return { error: "The credit note can't be dated in the future." };

  const byId = new Map(ctx.lines.map((l) => [l.id, l]));
  const picked = f.lines
    .map((l) => ({ ...l, line: byId.get(l.invoiceLineId), amount: round2(l.quantity * l.unitPrice) }))
    .filter((l) => l.amount > 0);
  if (picked.length === 0) return { error: "Enter what you're crediting on at least one line." };
  for (const p of picked) {
    if (!p.line) return { error: "That line isn't on this invoice any more. Reload the page." };
    if (p.amount > p.line.left + 0.005) {
      return { error: `“${p.line.description}” has only ${p.line.left.toFixed(2)} (before GST) left to credit.` };
    }
  }

  const totals = computeTotals(
    picked.map((p) => ({ description: p.line!.description, sac: p.line!.sac, quantity: p.quantity, unitPrice: p.unitPrice, gstRate: Number(p.line!.gstRate) })),
    { interState: ctx.interState, gstEnabled: true },
  );
  // Crediting everything that's left: take the invoice's own remaining tax, so rounding over
  // several credit notes never leaves a paisa behind.
  const clearsAll = ctx.lines.every((l) => {
    const p = picked.find((x) => x.invoiceLineId === l.id);
    return l.left <= 0 || (p && Math.abs(p.amount - l.left) < 0.005);
  });
  const amounts = clearsAll
    ? ctx.remaining
    : { subtotal: totals.subtotal, cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst, total: totals.total };
  if (amounts.total > ctx.remaining.total + 0.005) return { error: "That's more than is left on the invoice." };

  const settings = await getSettings();
  const fy = financialYear(f.issueDate);
  let id = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      id = await db.$transaction(async (tx) => {
        const last = await tx.creditNote.aggregate({ where: { fy }, _max: { seq: true } });
        const seq = (last._max.seq ?? 0) + 1;
        const note = await tx.creditNote.create({
          data: {
            fy,
            seq,
            number: creditNoteNumber(settings.invoicePrefix, fy, seq),
            invoiceId,
            reason: f.reason,
            reasonNote: f.reasonNote,
            issueDate: f.issueDate,
            ...amounts,
            createdById: user.id,
            lines: {
              create: totals.lines.map((l, position) => ({
                invoiceLineId: picked[position].invoiceLineId,
                position,
                description: l.description,
                sac: l.sac || null,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                gstRate: l.gstRate,
                amount: l.amount,
              })),
            },
          },
        });
        return note.id;
      });
      break;
    } catch (e) {
      // Someone else raised a credit note at the same moment and took the number: try the next one.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }
  refresh(invoiceId, id);
  redirect(`/credit-notes/${id}`);
}

/** Withdraw a credit note raised by mistake. It keeps its number; the invoice goes back to what it was. */
export async function cancelCreditNote(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why it's being cancelled." };
  const note = await db.creditNote.findUnique({ where: { id } });
  if (!note || note.status !== "ISSUED") return { error: "Only an issued credit note can be cancelled." };
  if (Number(note.refundAmount) > 0) return { error: "Money has been refunded on this credit note. Remove the refund first." };
  await db.creditNote.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
  refresh(note.invoiceId, id);
  return { ok: "Credit note cancelled." };
}

const refundSchema = z.object({
  refundedOn: date,
  refundAmount: z.coerce.number().positive("enter the amount paid back").max(1e11),
  refundMethod: z.enum(PAYMENT_METHODS),
  refundReference: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
});

/** Record money paid back to the school when the credit is more than what was still due. */
export async function recordRefund(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const parsed = refundSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const note = await db.creditNote.findUnique({ where: { id } });
  if (!note || note.status !== "ISSUED") return { error: "Refunds can only be recorded on an issued credit note." };
  if (Number(note.refundAmount) > 0) return { error: "A refund is already recorded on this credit note." };
  const ctx = (await invoiceForCredit(note.invoiceId))!;
  const most = round2(Math.min(Number(note.total), ctx.owedBack));
  if (parsed.data.refundAmount > most + 0.005) return { error: `Only ${most.toFixed(2)} is owed back to the school on this credit note.` };
  await db.creditNote.update({ where: { id }, data: parsed.data });
  refresh(note.invoiceId, id);
  return { ok: "Refund recorded." };
}

export async function removeRefund(id: string) {
  await requireUser(["ADMIN"]);
  const note = await db.creditNote.update({
    where: { id },
    data: { refundAmount: 0, refundedOn: null, refundMethod: null, refundReference: null },
  });
  refresh(note.invoiceId, id);
}
