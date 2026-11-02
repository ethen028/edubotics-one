import "server-only";
import { db } from "@/lib/db";
import { isoDay } from "@/lib/dashboard-range";

const DAY = 86_400_000;
const IST_OFFSET = 5.5 * 3600 * 1000;

/** The India-time calendar day of a moment, as UTC midnight like the DATE columns. */
const istDay = (t: Date) => new Date(Math.floor((t.getTime() + IST_OFFSET) / DAY) * DAY);

export type Dated = { on: Date; amount: number };

/** Payroll months ("2026-10") that touch the range. */
function monthsTouching(from: Date, to: Date) {
  const keys: string[] = [];
  for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    keys.push(isoDay(d).slice(0, 7));
  }
  return keys;
}

/** A salary counts in its payroll month: on the month's last day, or today while that month is still running. */
function salaryDay(month: string, today: Date) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return last > today ? today : last;
}

/**
 * Every record behind the dashboard's money and sales figures for a range: won deals, invoices and credit notes
 * issued, payments received and refunds, and money paid out to vendors, as salaries and as expense claims.
 * The dashboard and the lists it opens both read this, so a figure and the list behind it always agree.
 */
export async function moneyRecords(from: Date, to: Date, today: Date) {
  const day = { gte: from, lte: to };
  const [won, invoices, creditNotes, payments, refunds, vendorPayments, payrollRuns, claims] = await Promise.all([
    // closedAt is a moment, not a date, so the range runs from midnight to midnight India time.
    db.deal.findMany({
      where: { stage: "WON", closedAt: { gte: new Date(from.getTime() - IST_OFFSET), lt: new Date(to.getTime() + DAY - IST_OFFSET) } },
      select: { id: true, title: true, value: true, closedAt: true, organization: { select: { name: true } } },
      orderBy: { closedAt: "desc" },
    }),
    db.invoice.findMany({
      where: { status: "ISSUED", issueDate: day },
      select: { id: true, number: true, issueDate: true, total: true, organization: { select: { name: true } } },
      orderBy: { issueDate: "desc" },
    }),
    db.creditNote.findMany({
      where: { status: "ISSUED", issueDate: day },
      select: { id: true, number: true, issueDate: true, total: true, invoice: { select: { organization: { select: { name: true } } } } },
      orderBy: { issueDate: "desc" },
    }),
    db.invoicePayment.findMany({
      where: { receivedOn: day, invoice: { status: { not: "CANCELLED" } } },
      select: { id: true, receivedOn: true, amount: true, method: true, invoice: { select: { id: true, number: true, organization: { select: { name: true } } } } },
      orderBy: { receivedOn: "desc" },
    }),
    db.creditNote.findMany({
      where: { status: "ISSUED", refundedOn: day },
      select: { id: true, number: true, refundedOn: true, refundAmount: true, invoice: { select: { organization: { select: { name: true } } } } },
      orderBy: { refundedOn: "desc" },
    }),
    db.vendorPayment.findMany({
      where: { paidOn: day, bill: { status: "OPEN" } },
      select: { id: true, paidOn: true, amount: true, bill: { select: { id: true, billNo: true, vendor: { select: { name: true } } } } },
      orderBy: { paidOn: "desc" },
    }),
    // Salaries count once a run is finalised; drafts can still change.
    db.payrollRun.findMany({
      where: { month: { in: monthsTouching(from, to) }, status: { not: "DRAFT" } },
      select: { month: true, status: true, payslips: { select: { net: true } } },
      orderBy: { month: "desc" },
    }),
    db.expenseClaim.findMany({
      where: { status: "PAID", payslipId: null, paidOn: day },
      select: { id: true, paidOn: true, amount: true, approvedAmount: true, description: true, employee: { select: { firstName: true, lastName: true } } },
      orderBy: { paidOn: "desc" },
    }),
  ]);

  const salaries = payrollRuns
    .map((r) => ({ month: r.month, status: r.status, people: r.payslips.length, on: salaryDay(r.month, today), amount: r.payslips.reduce((s, p) => s + Number(p.net), 0) }))
    .filter((r) => r.on >= from && r.on <= to);

  return {
    won: won.map((d) => ({ ...d, on: istDay(d.closedAt!), amount: Number(d.value) })),
    invoices: invoices.map((i) => ({ ...i, on: i.issueDate, amount: Number(i.total) })),
    creditNotes: creditNotes.map((c) => ({ ...c, on: c.issueDate, amount: -Number(c.total) })),
    payments: payments.map((p) => ({ ...p, on: p.receivedOn, amount: Number(p.amount) })),
    // Money paid back to schools on credit notes comes off what came in, as in the accounts summary.
    refunds: refunds.map((c) => ({ ...c, on: c.refundedOn!, amount: -Number(c.refundAmount) })),
    vendorPayments: vendorPayments.map((p) => ({ ...p, on: p.paidOn, amount: Number(p.amount) })),
    salaries,
    claims: claims.map((c) => ({ ...c, on: c.paidOn!, amount: Number(c.approvedAmount ?? c.amount) })),
  };
}

export type MoneyRecords = Awaited<ReturnType<typeof moneyRecords>>;

/** What came in (payments less refunds) and what went out (vendors, salaries, claims paid outside payroll). */
export const cashIn = (r: MoneyRecords): Dated[] => [...r.payments, ...r.refunds];
export const cashOut = (r: MoneyRecords): Dated[] => [...r.vendorPayments, ...r.salaries, ...r.claims];
export const invoicedLessCredit = (r: MoneyRecords): Dated[] => [...r.invoices, ...r.creditNotes];

export const total = (rows: { amount: number }[]) => Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
