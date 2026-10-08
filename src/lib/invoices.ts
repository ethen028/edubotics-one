/** Invoice maths and labels, shared by the server and the invoice form. No database access here. */

/** States and union territories, for place of supply. */
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

/** GST slabs offered on a line (5% and 18% cover nearly everything since the 2025 rate change). */
export const GST_RATES = [0, 5, 12, 18, 28, 40] as const;

export const PAYMENT_METHODS = ["BANK_TRANSFER", "UPI", "CHEQUE", "CASH", "OTHER"] as const;

export const methodLabel: Record<(typeof PAYMENT_METHODS)[number], string> = {
  BANK_TRANSFER: "Bank transfer",
  UPI: "UPI",
  CHEQUE: "Cheque",
  CASH: "Cash",
  OTHER: "Other",
};

/** Match free-typed CRM state names ("kerala", "TN") to the list; unknown → the company's state. */
export function normalizeState(value: string | null | undefined, fallback: string) {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return fallback;
  const aliases: Record<string, string> = {
    tn: "Tamil Nadu",
    ka: "Karnataka",
    kl: "Kerala",
    "new delhi": "Delhi",
    pondicherry: "Puducherry",
  };
  return aliases[v] ?? INDIAN_STATES.find((s) => s.toLowerCase() === v) ?? fallback;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type LineInput = { description: string; sac?: string | null; quantity: number; unitPrice: number; gstRate: number };

/**
 * Line amounts and tax. Same state as the company → half CGST, half SGST; another state → IGST.
 * With GST switched off every rate counts as 0.
 */
export function computeTotals(lines: LineInput[], opts: { interState: boolean; gstEnabled: boolean }) {
  let subtotal = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const computed = lines.map((l) => {
    const amount = round2(l.quantity * l.unitPrice);
    const rate = opts.gstEnabled ? l.gstRate : 0;
    subtotal += amount;
    if (opts.interState) igst += round2((amount * rate) / 100);
    else {
      const half = round2((amount * rate) / 200);
      cgst += half;
      sgst += half;
    }
    return { ...l, gstRate: rate, amount };
  });
  subtotal = round2(subtotal);
  cgst = round2(cgst);
  sgst = round2(sgst);
  igst = round2(igst);
  return { lines: computed, subtotal, cgst, sgst, igst, total: round2(subtotal + cgst + sgst + igst) };
}

/** Indian financial year (April–March) of a date, as "26-27". */
export function financialYear(d: Date) {
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function invoiceNumber(prefix: string, fy: string, seq: number) {
  return `${prefix}/${fy}/${String(seq).padStart(3, "0")}`;
}

/** Where an issued invoice stands, from its total and what has come in. */
export type PayState = "DRAFT" | "CANCELLED" | "CREDITED" | "PAID" | "PART_PAID" | "OVERDUE" | "DUE";

/**
 * `settled` is payments plus TDS; `credited` is what issued credit notes take off, less any money
 * refunded on them. An invoice credited in full with nothing paid reads as Credited, not Paid.
 */
export function payState(inv: { status: string; total: unknown; dueDate: Date }, settled: number, today: Date, credited = 0): PayState {
  if (inv.status === "DRAFT") return "DRAFT";
  if (inv.status === "CANCELLED") return "CANCELLED";
  const balance = round2(Number(inv.total) - settled - credited);
  if (balance <= 0) return credited > 0 && settled <= 0 ? "CREDITED" : "PAID";
  if (inv.dueDate < today) return "OVERDUE";
  return settled > 0 || credited > 0 ? "PART_PAID" : "DUE";
}

export const payStateLabel: Record<PayState, string> = {
  DRAFT: "Draft",
  CANCELLED: "Cancelled",
  CREDITED: "Credited in full",
  PAID: "Paid",
  PART_PAID: "Part paid",
  OVERDUE: "Overdue",
  DUE: "Not yet due",
};

export const payStateColor: Record<PayState, "gray" | "blue" | "green" | "amber" | "red" | "purple"> = {
  DRAFT: "gray",
  CANCELLED: "gray",
  CREDITED: "purple",
  PAID: "green",
  PART_PAID: "amber",
  OVERDUE: "red",
  DUE: "blue",
};

/** Received plus TDS withheld: both settle the invoice. */
export function settledAmount(payments: { amount: unknown; tds: unknown }[]) {
  return round2(payments.reduce((s, p) => s + Number(p.amount) + Number(p.tds), 0));
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function belowThousand(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? belowHundred(r) : ""].filter(Boolean).join(" ");
}

/** 125000.5 → "Rupees One Lakh Twenty Five Thousand and Fifty Paise Only" (Indian grouping). */
export function amountInWords(value: number) {
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);
  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${crore >= 100 ? belowThousand(crore) : belowHundred(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  const words = parts.join(" ") || "Zero";
  return `Rupees ${words}${paise ? ` and ${belowHundred(paise)} Paise` : ""} Only`;
}

const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,25,000.50: invoices show paise. */
export function formatMoney(value: number | string | { toString(): string }) {
  return inr2.format(Number(value.toString()));
}
