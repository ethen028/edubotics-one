import "server-only";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { financialYear } from "@/lib/invoices";
import { settledByBill } from "@/lib/purchases";
import { payableOf } from "@/lib/expenses";
import { fyChoices, fyMonths, fyRange, isFy, monthlyMoney, yearTotals } from "@/lib/accounts";
import { invoicesWithBalance } from "../invoices/data";

/** One financial year of income, spending, GST and TDS, read from invoices, credit notes, bills, payroll and claims. */
export async function accountsSummary(fyParam?: string) {
  const today = todayIST();
  const current = financialYear(today);
  const fy = isFy(fyParam) && fyParam <= current ? fyParam : current;
  const { from, to } = fyRange(fy);
  const inYear = { gte: from, lt: to };
  const months = fyMonths(fy, today);

  const [
    settings,
    invoices,
    creditNotes,
    refunds,
    invoicePayments,
    workshopPayments,
    bills,
    vendorPayments,
    payrollRuns,
    claims,
    claimsPaidByHand,
    earliest,
  ] = await Promise.all([
    getSettings(),
    db.invoice.findMany({ where: { status: "ISSUED", issueDate: inYear }, select: { issueDate: true, subtotal: true, cgst: true, sgst: true, igst: true } }),
    db.creditNote.findMany({
      where: { status: "ISSUED", issueDate: inYear },
      select: { issueDate: true, subtotal: true, cgst: true, sgst: true, igst: true, invoice: { select: { issueDate: true } } },
    }),
    db.creditNote.findMany({ where: { status: "ISSUED", refundedOn: inYear }, select: { refundedOn: true, refundAmount: true } }),
    db.invoicePayment.findMany({
      where: { receivedOn: inYear, invoice: { status: { not: "CANCELLED" } } },
      select: { receivedOn: true, amount: true, tds: true },
    }),
    db.workshopPayment.findMany({ where: { paidOn: inYear }, select: { paidOn: true, amount: true } }),
    db.vendorBill.findMany({ where: { status: "OPEN", billDate: inYear }, select: { billDate: true, subtotal: true, tax: true } }),
    db.vendorPayment.findMany({ where: { paidOn: inYear, bill: { status: "OPEN" } }, select: { paidOn: true, amount: true, tds: true } }),
    // Runs earned in this year, plus runs from the year before that were paid in this one.
    db.payrollRun.findMany({
      where: {
        status: { in: ["FINALIZED", "PAID"] },
        OR: [{ month: { in: months.map((m) => m.key) } }, { paidOn: inYear }],
      },
      select: {
        month: true,
        paidOn: true,
        payslips: { select: { gross: true, lopDeduction: true, noticeRecovery: true, exitRecovery: true, net: true, tds: true } },
      },
    }),
    db.expenseClaim.findMany({ where: { status: { in: ["APPROVED", "PAID"] }, date: inYear }, select: { date: true, amount: true, approvedAmount: true } }),
    db.expenseClaim.findMany({
      where: { status: "PAID", payslipId: null, paidOn: inYear },
      select: { paidOn: true, amount: true, approvedAmount: true },
    }),
    earliestRecord(),
  ]);

  const rows = monthlyMoney(
    { invoices, creditNotes, refunds, invoicePayments, workshopPayments, bills, vendorPayments, payrollRuns, claims, claimsPaidByHand },
    months,
  );

  return {
    fy,
    current,
    fys: fyChoices(earliest, today),
    gstEnabled: settings.gstEnabled,
    rows,
    total: yearTotals(rows),
  };
}

/** What is owed either way today, whatever the year. */
export async function openBalances() {
  const [invoices, bills, claimsToPay] = await Promise.all([
    invoicesWithBalance({ status: "ISSUED" }),
    db.vendorBill.findMany({ where: { status: "OPEN" }, select: { id: true, total: true } }),
    db.expenseClaim.findMany({ where: { status: "APPROVED" }, select: { amount: true, approvedAmount: true } }),
  ]);
  const settled = await settledByBill(bills.map((b) => b.id));
  const round2 = (v: number) => Math.round(v * 100) / 100;
  return {
    owedToUs: round2(invoices.reduce((s, i) => s + i.balance, 0)),
    owedBack: round2(invoices.reduce((s, i) => s + i.owedBack, 0)),
    toVendors: round2(bills.reduce((s, b) => s + Math.max(0, Number(b.total) - (settled.get(b.id) ?? 0)), 0)),
    claimsToPay: round2(claimsToPay.reduce((s, c) => s + payableOf(c), 0)),
  };
}

async function earliestRecord() {
  const [inv, bill, run, claim, wp] = await Promise.all([
    db.invoice.aggregate({ where: { status: "ISSUED" }, _min: { issueDate: true } }),
    db.vendorBill.aggregate({ _min: { billDate: true } }),
    db.payrollRun.aggregate({ _min: { month: true } }),
    db.expenseClaim.aggregate({ _min: { date: true } }),
    db.workshopPayment.aggregate({ _min: { paidOn: true } }),
  ]);
  const dates = [
    inv._min.issueDate,
    bill._min.billDate,
    run._min.month ? new Date(`${run._min.month}-01T00:00:00Z`) : null,
    claim._min.date,
    wp._min.paidOn,
  ].filter((d): d is Date => !!d);
  return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
}
