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
import { GST_RATES, INDIAN_STATES, computeTotals, financialYear, formatMoney } from "@/lib/invoices";
import { quoteNumber } from "@/lib/quotes";
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

function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  return `${issue.path.join(" ") || "Form"}: ${issue.message}`;
}

function refresh(id?: string) {
  revalidatePath("/quotes", "layout");
  if (id) revalidatePath(`/quotes/${id}`);
  revalidatePath("/crm", "layout");
  revalidatePath("/invoices", "layout");
  revalidatePath("/");
}

const lineSchema = z.object({
  description: z.string().trim().min(1, "every line needs a description").max(500),
  sac: z.string().trim().max(10).nullish(),
  quantity: z.coerce.number().positive("quantity must be more than 0").max(1e6),
  unitPrice: z.coerce.number().min(0, "can't be negative").max(1e11),
  gstRate: z.coerce.number().refine((r) => (GST_RATES as readonly number[]).includes(r), "pick a GST rate"),
});

// The quote form is the invoice form with other labels, so the dates arrive as issueDate and dueDate.
const quoteSchema = z.object({
  organizationId: z.string().min(1, "pick a school or institution"),
  contactId: optional,
  dealId: optional,
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
  terms: optional,
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

async function readQuoteForm(formData: FormData) {
  const parsed = quoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstError(parsed.error) } as const;
  const { lines, issueDate, dueDate, ...data } = parsed.data;
  if (dueDate < issueDate) return { error: "The valid-until date is before the quote date." } as const;
  const settings = await getSettings();
  const totals = computeTotals(lines, { interState: data.placeOfSupply !== settings.companyState, gstEnabled: settings.gstEnabled });
  return {
    data: {
      ...data,
      quoteDate: issueDate,
      validUntil: dueDate,
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      total: totals.total,
    },
    lines: totals.lines.map((l, position) => ({ ...l, sac: l.sac || null, position })),
  } as const;
}

export async function createQuote(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser([...BILLING_ROLES]);
  const form = await readQuoteForm(formData);
  if ("error" in form) return { error: form.error };
  const quote = await db.quote.create({
    data: { ...form.data, createdById: user.id, lines: { create: form.lines } },
  });
  refresh();
  redirect(`/quotes/${quote.id}`);
}

async function quoteIn(id: string, status: "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED", message: string) {
  const quote = await db.quote.findUnique({ where: { id } });
  if (!quote) throw new Error("Quote not found");
  if (quote.status !== status) throw new Error(message);
  return quote;
}

const draft = (id: string) => quoteIn(id, "DRAFT", "Only a draft can be changed. Make a revision instead.");

export async function updateQuote(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireUser([...BILLING_ROLES]);
  await draft(id);
  const form = await readQuoteForm(formData);
  if ("error" in form) return { error: form.error };
  await db.$transaction([
    db.quoteLine.deleteMany({ where: { quoteId: id } }),
    db.quote.update({ where: { id }, data: { ...form.data, lines: { create: form.lines } } }),
  ]);
  refresh(id);
  return { ok: "Draft saved." };
}

export async function deleteQuoteDraft(id: string) {
  await requireUser([...BILLING_ROLES]);
  await draft(id);
  await db.quote.delete({ where: { id } });
  refresh();
  redirect("/quotes");
}

/** Note on the deal's timeline, so the CRM shows the quote history too. */
function dealNote(tx: Prisma.TransactionClient, dealId: string | null, userId: string, subject: string, body?: string | null) {
  if (!dealId) return Promise.resolve();
  return tx.activity.create({ data: { type: "NOTE", subject, body, done: true, dealId, createdById: userId } }).then(() => undefined);
}

/**
 * Number the draft and mark it sent. An open deal moves to Proposal and takes the quote's value
 * (before GST); the quote this one revises is marked as replaced.
 */
export async function sendQuote(id: string) {
  const user = await requireUser([...BILLING_ROLES]);
  const quote = await draft(id);
  const settings = await getSettings();
  // Amounts follow today's GST settings, in case they changed since the draft was saved.
  const lines = await db.quoteLine.findMany({ where: { quoteId: id }, orderBy: { position: "asc" } });
  const totals = computeTotals(
    lines.map((l) => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), gstRate: Number(l.gstRate) })),
    { interState: quote.placeOfSupply !== settings.companyState, gstEnabled: settings.gstEnabled },
  );
  const fy = financialYear(quote.quoteDate);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.$transaction(async (tx) => {
        const last = await tx.quote.aggregate({ where: { fy }, _max: { seq: true } });
        const seq = (last._max.seq ?? 0) + 1;
        const number = quoteNumber(settings.invoicePrefix, fy, seq);
        await tx.quote.update({
          where: { id, status: "DRAFT" },
          data: {
            status: "SENT",
            fy,
            seq,
            number,
            sentAt: new Date(),
            subtotal: totals.subtotal,
            cgst: totals.cgst,
            sgst: totals.sgst,
            igst: totals.igst,
            total: totals.total,
          },
        });
        for (const [i, l] of totals.lines.entries()) {
          await tx.quoteLine.update({ where: { id: lines[i].id }, data: { gstRate: l.gstRate, amount: l.amount } });
        }
        if (quote.revisionOfId) {
          await tx.quote.updateMany({ where: { id: quote.revisionOfId, status: "SENT" }, data: { status: "REVISED" } });
        }
        if (quote.dealId) {
          const deal = await tx.deal.findUnique({ where: { id: quote.dealId } });
          if (deal && deal.stage !== "WON" && deal.stage !== "LOST") {
            await tx.deal.update({
              where: { id: deal.id },
              data: {
                value: totals.subtotal,
                stage: deal.stage === "PROSPECT" || deal.stage === "DEMO" ? "PROPOSAL" : deal.stage,
              },
            });
          }
          await dealNote(tx, quote.dealId, user.id, `Quote ${number} sent: ${formatMoney(totals.subtotal)} + GST`);
        }
      });
      break;
    } catch (e) {
      // Someone else sent a quote at the same moment and took the number: try the next one.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }
  refresh(id);
}

/** The school said yes: the deal is won at the quote's value, ready to invoice. */
export async function acceptQuote(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser([...BILLING_ROLES]);
  const parsed = date.safeParse(formData.get("decidedOn"));
  if (!parsed.success) return { error: "Pick the date the school accepted." };
  const quote = await db.quote.findUnique({ where: { id } });
  if (quote?.status !== "SENT") return { error: "Only a sent quote can be accepted." };
  await db.$transaction(async (tx) => {
    await tx.quote.update({ where: { id, status: "SENT" }, data: { status: "ACCEPTED", decidedOn: parsed.data } });
    if (quote.dealId) {
      const deal = await tx.deal.findUnique({ where: { id: quote.dealId } });
      if (deal) {
        await tx.deal.update({
          where: { id: deal.id },
          data: {
            stage: "WON",
            closedAt: deal.stage === "WON" ? deal.closedAt : new Date(),
            lostReason: null,
            value: quote.subtotal,
            organizationId: deal.organizationId ?? quote.organizationId,
            contactId: deal.contactId ?? quote.contactId,
          },
        });
      }
      await dealNote(tx, quote.dealId, user.id, `Quote ${quote.number} accepted: ${formatMoney(quote.subtotal)} + GST`);
    }
  });
  refresh(id);
  return { ok: "Marked accepted." };
}

/** The school said no. Optionally close the deal as lost with the same reason. */
export async function declineQuote(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser([...BILLING_ROLES]);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Say why the school declined." };
  const quote = await db.quote.findUnique({ where: { id } });
  if (quote?.status !== "SENT") return { error: "Only a sent quote can be declined." };
  const markLost = formData.get("markLost") === "on";
  await db.$transaction(async (tx) => {
    await tx.quote.update({ where: { id, status: "SENT" }, data: { status: "DECLINED", decidedOn: todayIST(), declineReason: reason } });
    if (quote.dealId && markLost) {
      await tx.deal.updateMany({
        where: { id: quote.dealId, stage: { notIn: ["WON", "LOST"] } },
        data: { stage: "LOST", lostReason: reason, closedAt: new Date() },
      });
    }
    await dealNote(tx, quote.dealId, user.id, `Quote ${quote.number} declined`, reason);
  });
  refresh(id);
  return { ok: "Marked declined." };
}

/** Undo an accept or decline entered by mistake. The deal is left as it is now. */
export async function reopenQuote(id: string) {
  await requireUser(["ADMIN"]);
  const quote = await db.quote.findUnique({ where: { id }, include: { invoices: { where: { status: { not: "CANCELLED" } } } } });
  if (!quote || (quote.status !== "ACCEPTED" && quote.status !== "DECLINED")) throw new Error("Only an answered quote can be reopened.");
  if (quote.invoices.length > 0) throw new Error("This quote has been invoiced. Cancel those invoices first.");
  await db.quote.update({ where: { id }, data: { status: "SENT", decidedOn: null, declineReason: null } });
  refresh(id);
}

/** Copy a sent or declined quote into a new draft. When the copy is sent, a still-waiting original shows as replaced. */
export async function reviseQuote(id: string) {
  const user = await requireUser([...BILLING_ROLES]);
  const quote = await db.quote.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } });
  if (quote?.status !== "SENT" && quote?.status !== "DECLINED") throw new Error("Only a sent or declined quote can be revised.");
  const settings = await getSettings();
  const today = todayIST();
  const copy = await db.quote.create({
    data: {
      organizationId: quote.organizationId,
      contactId: quote.contactId,
      dealId: quote.dealId,
      revisionOfId: quote.id,
      billToName: quote.billToName,
      billToAddress: quote.billToAddress,
      billToGstin: quote.billToGstin,
      placeOfSupply: quote.placeOfSupply,
      quoteDate: today,
      validUntil: new Date(today.getTime() + settings.quoteValidDays * 86400000),
      subtotal: quote.subtotal,
      cgst: quote.cgst,
      sgst: quote.sgst,
      igst: quote.igst,
      total: quote.total,
      terms: quote.terms,
      notes: quote.notes,
      createdById: user.id,
      lines: {
        create: quote.lines.map(({ position, description, sac, quantity, unitPrice, gstRate, amount }) => ({
          position,
          description,
          sac,
          quantity,
          unitPrice,
          gstRate,
          amount,
        })),
      },
    },
  });
  refresh(id);
  redirect(`/quotes/${copy.id}`);
}
