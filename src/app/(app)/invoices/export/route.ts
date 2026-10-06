import { requireUser } from "@/lib/auth";
import { payStateLabel } from "@/lib/invoices";
import { invoicesWithBalance } from "../data";

const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Every issued and cancelled invoice, for the accountant's GST return and books. */
export async function GET() {
  await requireUser(["ADMIN", "MANAGER"]);
  const invoices = (await invoicesWithBalance({ status: { not: "DRAFT" } })).reverse();
  const rows = [
    [
      "Invoice no.",
      "Date",
      "Due",
      "Customer",
      "Customer GSTIN",
      "Place of supply",
      "Taxable value",
      "CGST",
      "SGST",
      "IGST",
      "Total",
      "Received + TDS",
      "Still due",
      "Status",
    ],
    ...invoices.map((i) => [
      i.number ?? "",
      day(i.issueDate),
      day(i.dueDate),
      i.billToName,
      i.billToGstin ?? "",
      i.placeOfSupply,
      ...[i.subtotal, i.cgst, i.sgst, i.igst, i.total].map(Number),
      i.settled,
      i.balance,
      payStateLabel[i.state],
    ]),
  ];
  return new Response(rows.map((r) => r.map(csv).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="invoices.csv"' },
  });
}
