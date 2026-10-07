/** Credit note numbers, labels and the money sums that tie them to invoices. No database access here. */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const CREDIT_REASONS = ["SESSIONS_NOT_HELD", "WRONG_AMOUNT", "DISCOUNT", "SERVICE_ISSUE", "CANCEL_INVOICE", "OTHER"] as const;
export type CreditReason = (typeof CREDIT_REASONS)[number];

export const creditReasonLabel: Record<CreditReason, string> = {
  SESSIONS_NOT_HELD: "Fewer sessions or days than billed",
  WRONG_AMOUNT: "Wrong price or quantity on the invoice",
  DISCOUNT: "Discount agreed after the invoice",
  SERVICE_ISSUE: "Problem with the service",
  CANCEL_INVOICE: "Whole invoice withdrawn",
  OTHER: "Other",
};

/** EBG/CN/26-27/001: same prefix as invoices, its own series that restarts each April. */
export function creditNoteNumber(prefix: string, fy: string, seq: number) {
  return `${prefix}/CN/${fy}/${String(seq).padStart(3, "0")}`;
}

type Money = { toString(): string };

/** What issued (not cancelled) credit notes take off an invoice, GST included. */
export function creditedAmount(notes: { status: string; total: Money }[]) {
  return round2(notes.filter((n) => n.status === "ISSUED").reduce((s, n) => s + Number(n.total), 0));
}

/** Money already paid back to the school on those credit notes. */
export function refundedAmount(notes: { status: string; refundAmount: Money }[]) {
  return round2(notes.filter((n) => n.status === "ISSUED").reduce((s, n) => s + Number(n.refundAmount), 0));
}

/**
 * Where an invoice stands once credit notes count. `net` is what the school still has to pay
 * (negative when it has paid more than the credited invoice is now worth); `owedBack` is the part
 * of that overpayment not yet refunded.
 */
export function invoiceMoney(total: Money, settled: number, notes: { status: string; total: Money; refundAmount: Money }[]) {
  const credited = creditedAmount(notes);
  const refunded = refundedAmount(notes);
  const net = round2(Number(total) - credited - settled + refunded);
  return { credited, refunded, balance: Math.max(0, net), owedBack: Math.max(0, -net) };
}

/**
 * GST lets a credit note lower the tax on an invoice only until 30 November after the end of the
 * financial year the invoice belongs to (CGST Act section 34). Past that the credit note still
 * lowers what the school owes, but not the GST already declared.
 */
export function gstCreditDeadline(invoiceDate: Date) {
  const y = invoiceDate.getUTCFullYear();
  const fyStart = invoiceDate.getUTCMonth() >= 3 ? y : y - 1;
  return new Date(Date.UTC(fyStart + 1, 10, 30));
}

/** Per invoice line: how much (before GST) is still there to credit. */
export function creditableByLine(
  lines: { id: string; amount: Money }[],
  credited: { invoiceLineId: string | null; amount: Money; creditNote: { status: string } }[],
) {
  const used = new Map<string, number>();
  for (const c of credited) {
    if (!c.invoiceLineId || c.creditNote.status !== "ISSUED") continue;
    used.set(c.invoiceLineId, (used.get(c.invoiceLineId) ?? 0) + Number(c.amount));
  }
  return new Map(lines.map((l) => [l.id, round2(Number(l.amount) - (used.get(l.id) ?? 0))]));
}

/** The reason line printed on the credit note, under the lines. */
export function creditNoteNotes(n: { reason: CreditReason; reasonNote: string | null }) {
  return `Reason: ${creditReasonLabel[n.reason]}${n.reasonNote ? `. ${n.reasonNote}` : ""}`;
}
