import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { creditReasonLabel } from "@/lib/credit-notes";

const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Every credit note with its original invoice, for the accountant's GST return (credit/debit notes section). */
export async function GET() {
  await requireUser(["ADMIN", "MANAGER"]);
  const notes = await db.creditNote.findMany({
    include: { invoice: { select: { number: true, issueDate: true, billToName: true, billToGstin: true, placeOfSupply: true } } },
    orderBy: [{ issueDate: "asc" }, { seq: "asc" }],
  });
  const rows = [
    [
      "Credit note no.",
      "Date",
      "Invoice no.",
      "Invoice date",
      "Customer",
      "Customer GSTIN",
      "Place of supply",
      "Taxable value",
      "CGST",
      "SGST",
      "IGST",
      "Total",
      "Reason",
      "Refunded",
      "Status",
    ],
    ...notes.map((n) => [
      n.number,
      day(n.issueDate),
      n.invoice.number ?? "",
      day(n.invoice.issueDate),
      n.invoice.billToName,
      n.invoice.billToGstin ?? "",
      n.invoice.placeOfSupply,
      ...[n.subtotal, n.cgst, n.sgst, n.igst, n.total].map(Number),
      creditReasonLabel[n.reason] + (n.reasonNote ? `: ${n.reasonNote}` : ""),
      Number(n.refundAmount),
      n.status === "ISSUED" ? "Issued" : "Cancelled",
    ]),
  ];
  return new Response(rows.map((r) => r.map(csv).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="credit-notes.csv"' },
  });
}
