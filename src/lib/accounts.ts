/** Accounts summary arithmetic: financial-year months and the monthly money rows. No database access here. */

import { financialYear } from "./invoices";
import { gstCreditDeadline } from "./credit-notes";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** "2026-10" for a UTC-midnight date. */
export const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/** First day of the financial year "26-27" (1 April 2026) and of the next one. */
export function fyRange(fy: string) {
  const start = 2000 + Number(fy.slice(0, 2));
  return { from: new Date(Date.UTC(start, 3, 1)), to: new Date(Date.UTC(start + 1, 3, 1)) };
}

/** "26-27" → "2026-27", as written on returns. */
export const fyLabel = (fy: string) => `20${fy}`;

export const isFy = (v: string | undefined): v is string => !!v && /^\d{2}-\d{2}$/.test(v) && (Number(v.slice(0, 2)) + 1) % 100 === Number(v.slice(3));

/** Financial years from the one holding `earliest` up to today's, newest first. */
export function fyChoices(earliest: Date | null, today: Date) {
  const out: string[] = [];
  const last = fyRange(financialYear(today)).from.getUTCFullYear();
  const first = earliest ? fyRange(financialYear(earliest)).from.getUTCFullYear() : last;
  for (let y = last; y >= Math.min(first, last); y--) out.push(financialYear(new Date(Date.UTC(y, 3, 1))));
  return out;
}

/** April to March of a financial year, stopping at the current month for the year in progress. */
export function fyMonths(fy: string, today: Date) {
  const { from } = fyRange(fy);
  const months: { key: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), 3 + i, 1));
    if (d > today) break;
    months.push({ key: monthKey(d), label: d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }) });
  }
  return months;
}

/** Every figure the summary shows for one month. All amounts in rupees. */
export type MonthMoney = {
  // Income and spending, counted when invoiced, billed or earned (before GST)
  sales: number; // issued invoices, before GST
  credited: number; // credit notes against them, before GST (plus GST that could no longer be reversed)
  workshopFees: number; // per-person workshop fees received
  purchases: number; // vendor bills, before GST
  salaries: number; // earned pay on finalised payroll: gross less loss of pay and recoveries
  claims: number; // approved expense claims, by the day the money was spent
  // GST
  gstOut: number; // on issued invoices
  gstCredited: number; // reversed by credit notes in time
  gstIn: number; // on vendor bills (input credit)
  cgstOut: number;
  sgstOut: number;
  igstOut: number;
  // Money that actually moved
  receivedSchools: number; // payments on invoices, not counting TDS
  receivedWorkshops: number;
  refunds: number; // paid back to schools on credit notes
  paidVendors: number; // not counting TDS held back
  paidSalaries: number; // net pay on finalised payroll, claims paid with salary included
  paidClaims: number; // claims paid outside payroll
  // TDS
  tdsBySchools: number; // held back by schools; claimed back in the income tax return
  tdsOnVendors: number; // held back from vendors; to be paid to the government
  tdsOnSalaries: number;
};

export const emptyMonth = (): MonthMoney => ({
  sales: 0,
  credited: 0,
  workshopFees: 0,
  purchases: 0,
  salaries: 0,
  claims: 0,
  gstOut: 0,
  gstCredited: 0,
  gstIn: 0,
  cgstOut: 0,
  sgstOut: 0,
  igstOut: 0,
  receivedSchools: 0,
  receivedWorkshops: 0,
  refunds: 0,
  paidVendors: 0,
  paidSalaries: 0,
  paidClaims: 0,
  tdsBySchools: 0,
  tdsOnVendors: 0,
  tdsOnSalaries: 0,
});

type Money = { toString(): string };
const n = (v: Money | null | undefined) => Number(v ?? 0);

/** The raw rows the summary is built from, already limited to the financial year. */
export type AccountsInput = {
  invoices: { issueDate: Date; subtotal: Money; cgst: Money; sgst: Money; igst: Money }[];
  creditNotes: { issueDate: Date; subtotal: Money; cgst: Money; sgst: Money; igst: Money; invoice: { issueDate: Date } }[];
  refunds: { refundedOn: Date | null; refundAmount: Money }[];
  invoicePayments: { receivedOn: Date; amount: Money; tds: Money }[];
  workshopPayments: { paidOn: Date; amount: Money }[];
  bills: { billDate: Date; subtotal: Money; tax: Money }[];
  vendorPayments: { paidOn: Date; amount: Money; tds: Money }[];
  payrollRuns: {
    month: string;
    paidOn: Date | null;
    payslips: { gross: Money; lopDeduction: Money; noticeRecovery: Money; exitRecovery: Money; net: Money; tds: Money }[];
  }[];
  claims: { date: Date; amount: Money; approvedAmount: Money | null }[];
  claimsPaidByHand: { paidOn: Date | null; amount: Money; approvedAmount: Money | null }[];
};

/**
 * Sorts every row into its month. A credit note lowers sales and GST in the month it is dated. Its
 * GST is reversed only up to 30 November after the invoice's financial year (CGST Act section 34);
 * past that the school still gets the full credit, so the tax part counts as lost income instead.
 */
export function monthlyMoney(input: AccountsInput, months: { key: string; label: string }[]) {
  const rows = new Map(months.map((m) => [m.key, emptyMonth()]));
  const at = (d: Date | null) => (d ? rows.get(monthKey(d)) : undefined);

  for (const i of input.invoices) {
    const r = at(i.issueDate);
    if (!r) continue;
    r.sales += n(i.subtotal);
    r.cgstOut += n(i.cgst);
    r.sgstOut += n(i.sgst);
    r.igstOut += n(i.igst);
    r.gstOut += n(i.cgst) + n(i.sgst) + n(i.igst);
  }
  for (const c of input.creditNotes) {
    const r = at(c.issueDate);
    if (!r) continue;
    const gst = n(c.cgst) + n(c.sgst) + n(c.igst);
    const inTime = c.issueDate <= gstCreditDeadline(c.invoice.issueDate);
    r.credited += n(c.subtotal) + (inTime ? 0 : gst);
    if (inTime) {
      r.gstCredited += gst;
      r.cgstOut -= n(c.cgst);
      r.sgstOut -= n(c.sgst);
      r.igstOut -= n(c.igst);
    }
  }
  for (const c of input.refunds) {
    const r = at(c.refundedOn);
    if (r) r.refunds += n(c.refundAmount);
  }
  for (const p of input.invoicePayments) {
    const r = at(p.receivedOn);
    if (!r) continue;
    r.receivedSchools += n(p.amount);
    r.tdsBySchools += n(p.tds);
  }
  for (const p of input.workshopPayments) {
    const r = at(p.paidOn);
    if (!r) continue;
    r.workshopFees += n(p.amount);
    r.receivedWorkshops += n(p.amount);
  }
  for (const b of input.bills) {
    const r = at(b.billDate);
    if (!r) continue;
    r.purchases += n(b.subtotal);
    r.gstIn += n(b.tax);
  }
  for (const p of input.vendorPayments) {
    const r = at(p.paidOn);
    if (!r) continue;
    r.paidVendors += n(p.amount);
    r.tdsOnVendors += n(p.tds);
  }
  for (const run of input.payrollRuns) {
    const earned = rows.get(run.month);
    // Paid in the month it was marked paid; a finalised run not yet marked paid counts in its own month.
    const paid = run.paidOn ? at(run.paidOn) : earned;
    for (const s of run.payslips) {
      if (earned) {
        earned.salaries += n(s.gross) - n(s.lopDeduction) - n(s.noticeRecovery) - n(s.exitRecovery);
        earned.tdsOnSalaries += n(s.tds);
      }
      if (paid) paid.paidSalaries += n(s.net);
    }
  }
  for (const c of input.claims) {
    const r = at(c.date);
    if (r) r.claims += n(c.approvedAmount ?? c.amount);
  }
  for (const c of input.claimsPaidByHand) {
    const r = at(c.paidOn);
    if (r) r.paidClaims += n(c.approvedAmount ?? c.amount);
  }

  return months.map((m) => {
    const raw = rows.get(m.key)!;
    const money = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, round2(v)])) as MonthMoney;
    return { ...m, ...money, ...derived(money) };
  });
}

/** Totals worked out from one month's (or a year's) figures. */
export function derived(m: MonthMoney) {
  const income = round2(m.sales - m.credited + m.workshopFees);
  const spending = round2(m.purchases + m.salaries + m.claims);
  const moneyIn = round2(m.receivedSchools + m.receivedWorkshops - m.refunds);
  const moneyOut = round2(m.paidVendors + m.paidSalaries + m.paidClaims);
  const gstNetOut = round2(m.gstOut - m.gstCredited);
  return {
    income,
    spending,
    profit: round2(income - spending),
    moneyIn,
    moneyOut,
    netCash: round2(moneyIn - moneyOut),
    gstNetOut,
    gstToPay: round2(gstNetOut - m.gstIn), // negative = input credit carried forward
  };
}

/** Adds the months up into one year. */
export function yearTotals(months: MonthMoney[]) {
  const total = emptyMonth();
  for (const m of months) for (const k of Object.keys(total) as (keyof MonthMoney)[]) total[k] += m[k];
  for (const k of Object.keys(total) as (keyof MonthMoney)[]) total[k] = round2(total[k]);
  return { ...total, ...derived(total) };
}
