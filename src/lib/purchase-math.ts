/** Purchase maths and labels, shared by the server and the purchase order form. No database access here. */

/** The company's own state. A vendor in another state charges IGST instead of CGST + SGST. */
export const COMPANY_STATE = "Kerala";

/** States and union territories, for where a vendor is registered. Same list as invoices use. */
export { INDIAN_STATES } from "./invoices";

export const GST_RATES = [0, 5, 12, 18, 28, 40] as const;

export const PAYMENT_METHODS = ["BANK_TRANSFER", "UPI", "CHEQUE", "CASH", "OTHER"] as const;

export const methodLabel: Record<string, string> = {
  BANK_TRANSFER: "Bank transfer",
  UPI: "UPI",
  CHEQUE: "Cheque",
  CASH: "Cash",
  OTHER: "Other",
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const poNo = (n: number) => `PO-${String(n).padStart(4, "0")}`;

export type PriceLine = { quantity: number; unitPrice: number; gstRate: number };

/** Amount before GST, GST and total for a set of lines. */
export function orderTotals(lines: PriceLine[]) {
  let subtotal = 0;
  let tax = 0;
  for (const l of lines) {
    const amount = round2(l.quantity * l.unitPrice);
    subtotal += amount;
    tax += round2((amount * l.gstRate) / 100);
  }
  subtotal = round2(subtotal);
  tax = round2(tax);
  return { subtotal, tax, total: round2(subtotal + tax) };
}

/** How the GST on a bill or order splits: half CGST and half SGST inside Kerala, all IGST otherwise. */
export function taxSplit(tax: number, interState: boolean) {
  if (interState) return { cgst: 0, sgst: 0, igst: round2(tax) };
  const half = round2(tax / 2);
  return { cgst: half, sgst: round2(tax - half), igst: 0 };
}

export type BillState = "CANCELLED" | "PAID" | "PART_PAID" | "OVERDUE" | "DUE";

/** Where a bill stands, from its total and what has been settled (paid + TDS held back). */
export function billState(bill: { status: string; total: unknown; dueDate: Date }, settled: number, today: Date): BillState {
  if (bill.status === "CANCELLED") return "CANCELLED";
  if (round2(Number(bill.total) - settled) <= 0) return "PAID";
  if (bill.dueDate < today) return "OVERDUE";
  return settled > 0 ? "PART_PAID" : "DUE";
}

export const AGE_BUCKETS = ["Not due yet", "1–30 days late", "31–60 days late", "61–90 days late", "Over 90 days late"] as const;

/** Which ageing column a bill's balance falls in, counted from its due date. */
export function ageBucket(dueDate: Date, today: Date) {
  const late = Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000);
  if (late <= 0) return 0;
  if (late <= 30) return 1;
  if (late <= 60) return 2;
  if (late <= 90) return 3;
  return 4;
}

/** A CSV cell. Leading = + - @ are escaped so spreadsheets don't run them as formulas. */
export function csvCell(v: string | number) {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
