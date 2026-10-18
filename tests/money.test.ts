// Checks for the sums that end up on GST invoices, credit notes, receipts and payslips.
// Run with `npm test`. Pure functions only: no database needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { amountInWords, computeTotals, financialYear, invoiceNumber, payState } from "../src/lib/invoices";
import { creditNoteNumber, gstCreditDeadline, invoiceMoney } from "../src/lib/credit-notes";
import { receiptTax } from "../src/lib/workshops";
import { csvCell } from "../src/lib/csv";

const line = (quantity: number, unitPrice: number, gstRate = 18) => ({ description: "Robotics sessions", quantity, unitPrice, gstRate });
const d = (s: string) => new Date(`${s}T00:00:00Z`);

test("invoice inside Kerala splits GST into CGST and SGST", () => {
  const t = computeTotals([line(2, 1000)], { interState: false, gstEnabled: true });
  assert.deepEqual([t.subtotal, t.cgst, t.sgst, t.igst, t.total], [2000, 180, 180, 0, 2360]);
});

test("invoice to another state charges IGST only", () => {
  const t = computeTotals([line(2, 1000)], { interState: true, gstEnabled: true });
  assert.deepEqual([t.subtotal, t.cgst, t.sgst, t.igst, t.total], [2000, 0, 0, 360, 2360]);
});

test("with GST switched off there is no tax, whatever the line's rate", () => {
  const t = computeTotals([line(3, 500, 18)], { interState: false, gstEnabled: false });
  assert.equal(t.total, 1500);
  assert.equal(t.lines[0].gstRate, 0);
});

test("paise round per line and the total is the sum of its parts", () => {
  const t = computeTotals([line(1, 333.33), line(7, 12.5, 5)], { interState: false, gstEnabled: true });
  assert.equal(t.subtotal, 420.83);
  assert.equal(t.cgst, 30 + 2.19);
  assert.equal(t.total, Math.round((t.subtotal + t.cgst + t.sgst) * 100) / 100);
});

test("financial year turns over on 1 April and numbers restart with it", () => {
  assert.equal(financialYear(d("2026-03-31")), "25-26");
  assert.equal(financialYear(d("2026-04-01")), "26-27");
  assert.equal(invoiceNumber("EBG", "26-27", 7), "EBG/26-27/007");
  assert.equal(creditNoteNumber("EBG", "26-27", 12), "EBG/CN/26-27/012");
});

test("payment state counts TDS and credit notes as settled", () => {
  const inv = { status: "ISSUED", total: 1180, dueDate: d("2026-10-10") };
  assert.equal(payState(inv, 0, d("2026-10-01")), "DUE");
  assert.equal(payState(inv, 0, d("2026-10-11")), "OVERDUE");
  assert.equal(payState(inv, 500, d("2026-10-01")), "PART_PAID");
  assert.equal(payState(inv, 1180, d("2026-10-20")), "PAID");
  assert.equal(payState(inv, 0, d("2026-10-20"), 1180), "CREDITED");
  assert.equal(payState({ ...inv, status: "CANCELLED" }, 0, d("2026-10-20")), "CANCELLED");
});

test("a credit note on a paid invoice becomes money owed back until refunded", () => {
  const note = { status: "ISSUED", total: 236, refundAmount: 0 };
  assert.deepEqual(invoiceMoney(1180, 1180, [note]), { credited: 236, refunded: 0, balance: 0, owedBack: 236 });
  assert.deepEqual(invoiceMoney(1180, 1180, [{ ...note, refundAmount: 236 }]), { credited: 236, refunded: 236, balance: 0, owedBack: 0 });
  assert.equal(invoiceMoney(1180, 0, [{ ...note, status: "CANCELLED" }]).balance, 1180);
});

test("GST can be reduced by a credit note until 30 November after the invoice's year", () => {
  assert.equal(gstCreditDeadline(d("2026-05-10")).toISOString().slice(0, 10), "2027-11-30");
  assert.equal(gstCreditDeadline(d("2026-02-01")).toISOString().slice(0, 10), "2026-11-30");
});

test("workshop receipt takes the GST out of the fee and the parts add back up", () => {
  assert.deepEqual(receiptTax(1180, 18, false), { subtotal: 1000, cgst: 90, sgst: 90, igst: 0, total: 1180 });
  assert.deepEqual(receiptTax(1180, 18, true), { subtotal: 1000, cgst: 0, sgst: 0, igst: 180, total: 1180 });
  const odd = receiptTax(999, 18, false);
  assert.equal(Math.round((odd.subtotal + odd.cgst + odd.sgst) * 100) / 100, 999);
  assert.equal(receiptTax(500, 0, false).subtotal, 500);
});

test("amount in words uses lakhs and crores", () => {
  assert.equal(amountInWords(125000.5), "Rupees One Lakh Twenty Five Thousand and Fifty Paise Only");
  assert.equal(amountInWords(23600), "Rupees Twenty Three Thousand Six Hundred Only");
  assert.equal(amountInWords(12500000), "Rupees One Crore Twenty Five Lakh Only");
});

test("spreadsheet cells can't run formulas, but amounts stay numbers", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell("+91 98470 00000"), `"'+91 98470 00000"`);
  assert.equal(csvCell("-250.00"), `"-250.00"`);
  assert.equal(csvCell(-250), `"-250"`);
});
