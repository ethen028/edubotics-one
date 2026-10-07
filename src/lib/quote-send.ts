import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";
import { computeTotals, financialYear, formatMoney } from "./invoices";
import { quoteNumber } from "./quotes";

/** A note on the deal's timeline, written inside the same transaction as the quote change. */
export function dealNote(tx: Prisma.TransactionClient, dealId: string | null, userId: string, subject: string, body?: string | null) {
  if (!dealId) return Promise.resolve();
  return tx.activity.create({ data: { type: "NOTE", subject, body, done: true, dealId, createdById: userId } }).then(() => undefined);
}

/**
 * Number a draft quote and mark it sent. An open deal moves to Proposal and takes the quote's value
 * (before GST); the quote this one revises is marked as replaced. Used by "Mark as sent" and by emailing a draft.
 */
export async function markQuoteSent(id: string, userId: string) {
  const quote = await db.quote.findUniqueOrThrow({ where: { id } });
  if (quote.status !== "DRAFT") throw new Error("Only a draft can be sent.");
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
          await dealNote(tx, quote.dealId, userId, `Quote ${number} sent: ${formatMoney(totals.subtotal)} + GST`);
        }
      });
      return;
    } catch (e) {
      // Someone else sent a quote at the same moment and took the number: try the next one.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) continue;
      throw e;
    }
  }
}
