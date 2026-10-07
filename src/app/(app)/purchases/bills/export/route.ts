import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { todayIST } from "@/lib/time";
import { settledByBill } from "@/lib/purchases";
import { COMPANY_STATE, billState, csvCell, poNo, round2, taxSplit } from "@/lib/purchase-math";

/** Every vendor bill with its GST split and payments, for the accountant (input tax credit, TDS returns). */
export async function GET() {
  await requireUser(["ADMIN"]);
  const today = todayIST();
  const bills = await db.vendorBill.findMany({
    include: { vendor: true, order: { select: { number: true } }, payments: { select: { amount: true, tds: true } } },
    orderBy: { billDate: "asc" },
  });
  const settled = await settledByBill(bills.map((b) => b.id));
  const rows = [
    ["Bill date", "Vendor", "Vendor GSTIN", "Vendor state", "Bill no.", "PO", "Before GST", "CGST", "SGST", "IGST", "Total", "Paid", "TDS", "Left to pay", "Due date", "Status"],
    ...bills.map((b) => {
      const split = taxSplit(Number(b.tax), b.vendor.state !== COMPANY_STATE);
      const paid = round2(b.payments.reduce((s, p) => s + Number(p.amount), 0));
      const tds = round2(b.payments.reduce((s, p) => s + Number(p.tds), 0));
      const state = billState(b, settled.get(b.id) ?? 0, today);
      return [
        formatDate(b.billDate),
        b.vendor.name,
        b.vendor.gstin ?? "",
        b.vendor.state,
        b.billNo,
        b.order ? poNo(b.order.number) : "",
        Number(b.subtotal),
        split.cgst,
        split.sgst,
        split.igst,
        Number(b.total),
        paid,
        tds,
        b.status === "OPEN" ? round2(Number(b.total) - paid - tds) : 0,
        formatDate(b.dueDate),
        state === "PART_PAID" ? "Part paid" : state === "DUE" ? "To pay" : state.charAt(0) + state.slice(1).toLowerCase(),
      ];
    }),
  ];
  return new Response(rows.map((r) => r.map(csvCell).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="vendor-bills.csv"` },
  });
}
