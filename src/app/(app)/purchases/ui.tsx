import type { PurchaseOrderStatus } from "@prisma/client";
import { Badge } from "@/components/ui";
import { formatINR, humanize } from "@/lib/format";
import { taxSplit, type BillState } from "@/lib/purchase-math";

const PO_COLOR: Record<PurchaseOrderStatus, "gray" | "blue" | "green" | "amber" | "red" | "purple"> = {
  PENDING: "amber",
  APPROVED: "blue",
  ORDERED: "purple",
  PART_RECEIVED: "purple",
  RECEIVED: "green",
  CLOSED: "gray",
  REJECTED: "red",
  CANCELLED: "gray",
};

const PO_LABEL: Partial<Record<PurchaseOrderStatus, string>> = {
  PENDING: "Waiting for approval",
  APPROVED: "Approved, to order",
  ORDERED: "Ordered, waiting for goods",
  PART_RECEIVED: "Part received",
  CLOSED: "Closed short",
};

export function OrderBadge({ status }: { status: PurchaseOrderStatus }) {
  return <Badge color={PO_COLOR[status]}>{PO_LABEL[status] ?? humanize(status)}</Badge>;
}

const BILL: Record<BillState, { color: "gray" | "blue" | "green" | "amber" | "red"; label: string }> = {
  DUE: { color: "blue", label: "To pay" },
  PART_PAID: { color: "amber", label: "Part paid" },
  OVERDUE: { color: "red", label: "Overdue" },
  PAID: { color: "green", label: "Paid" },
  CANCELLED: { color: "gray", label: "Cancelled" },
};

export function BillBadge({ state }: { state: BillState }) {
  return <Badge color={BILL[state].color}>{BILL[state].label}</Badge>;
}

/** Before-GST amount, the GST split for Kerala or another state, and the total. */
export function TotalsTable({ subtotal, tax, total, interState }: { subtotal: number; tax: number; total: number; interState: boolean }) {
  const split = taxSplit(tax, interState);
  const row = (label: string, value: number, strong = false) => (
    <div className={`flex justify-between gap-6 ${strong ? "border-t border-slate-200 pt-1 font-semibold" : ""}`}>
      <span className={strong ? "" : "text-slate-500"}>{label}</span>
      <span>{formatINR2(value)}</span>
    </div>
  );
  return (
    <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
      {row("Before GST", subtotal)}
      {interState ? row("IGST", split.igst) : (
        <>
          {row("CGST", split.cgst)}
          {row("SGST", split.sgst)}
        </>
      )}
      {row("Total", total, true)}
    </div>
  );
}

const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹ with paise, for bills and orders where rupee rounding would not match the vendor's paper. */
export function formatINR2(value: number | string | { toString(): string }) {
  const n = Number(value.toString());
  return Number.isInteger(n) ? formatINR(n) : inr2.format(n);
}
