import "server-only";
import { db } from "@/lib/db";
import { settledAmount } from "@/lib/invoices";
import { creditableByLine, invoiceMoney } from "@/lib/credit-notes";

/**
 * An issued invoice with what is left to credit on each line and where its money stands.
 * Used by the credit note form, the action that saves it, and the invoice and credit note pages.
 */
export async function invoiceForCredit(invoiceId: string) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: { orderBy: { position: "asc" } },
      payments: { select: { amount: true, tds: true } },
      creditNotes: { orderBy: [{ issueDate: "asc" }, { seq: "asc" }] },
      organization: { select: { id: true, name: true, email: true } },
      contact: { select: { name: true, email: true } },
    },
  });
  if (!invoice) return null;
  const credited = await db.creditNoteLine.findMany({
    where: { invoiceLine: { invoiceId } },
    select: { invoiceLineId: true, amount: true, creditNote: { select: { status: true } } },
  });
  const left = creditableByLine(invoice.lines, credited);
  const settled = settledAmount(invoice.payments);
  const money = invoiceMoney(invoice.total, settled, invoice.creditNotes);
  const live = invoice.creditNotes.filter((n) => n.status === "ISSUED");
  const sum = (k: "subtotal" | "cgst" | "sgst" | "igst" | "total") =>
    Math.round((Number(invoice[k]) - live.reduce((s, n) => s + Number(n[k]), 0)) * 100) / 100;
  return {
    invoice,
    settled,
    ...money,
    lines: invoice.lines.map((l) => ({ ...l, left: left.get(l.id) ?? 0 })),
    /** What is still on the invoice once issued credit notes are taken off, tax by tax. */
    remaining: { subtotal: sum("subtotal"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), total: sum("total") },
    // The invoice's own split decides the credit note's, even if the company's state changes later.
    // An invoice with no tax has 0% lines, so the split doesn't matter there.
    interState: Number(invoice.igst) > 0,
  };
}

export type CreditContext = NonNullable<Awaited<ReturnType<typeof invoiceForCredit>>>;
