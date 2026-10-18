import assert from "node:assert/strict";
import test from "node:test";
import { calculateSlip, employedDaysIn, monthRange } from "../src/lib/payroll";
import { computeTotals, financialYear, payState, settledAmount } from "../src/lib/invoices";
import { csvCell, orderTotals, taxSplit } from "../src/lib/purchase-math";
import { workedMinutes } from "../src/lib/daily-log";
import { mondayOf, weekDays } from "../src/lib/week";
import { passwordProblem } from "../src/lib/passwords";

test("daily logs exclude only the overlapping lunch minutes", () => {
  assert.equal(workedMinutes("09:00", "18:00"), 480);
  assert.equal(workedMinutes("12:45", "13:15"), 15);
  assert.equal(workedMinutes("13:00", "14:00"), 0);
  assert.equal(workedMinutes("14:00", "14:30"), 30);
  assert.equal(workedMinutes("18:00", "09:00"), null);
});

test("timesheet weeks stay on UTC dates across year boundaries", () => {
  const monday = mondayOf(new Date("2027-01-03T23:30:00Z"));
  assert.equal(monday.toISOString(), "2026-12-28T00:00:00.000Z");
  assert.equal(weekDays(monday)[6].toISOString(), "2027-01-03T00:00:00.000Z");
});

test("payroll counts leap days and inclusive joining and leaving dates", () => {
  assert.equal(monthRange("2028-02").days, 29);
  assert.equal(employedDaysIn("2028-02", new Date("2028-02-15Z"), new Date("2028-02-20Z")), 6);
  assert.equal(employedDaysIn("2028-02", new Date("2028-03-01Z"), null), 0);
  assert.throws(() => monthRange("2028-13"), /Invalid month/);
});

test("full loss of pay does not swallow approved reimbursements", () => {
  const slip = calculateSlip({
    structure: { basic: 15000, hra: 6000, specialAllowance: 9000 },
    daysInMonth: 30, employedDays: 30, lopDays: 99,
    manual: { otherEarnings: 0, professionalTax: 0, tds: 0, otherDeductions: 0 },
    rules: { lopDivisor: 30, pfEnabled: false, esiEnabled: false, ptEnabled: false, tdsEnabled: false },
    reimbursements: 845.5,
  });
  assert.equal(slip.paidDays, 0);
  assert.equal(slip.lopDays, 30);
  assert.equal(slip.net, 845.5);
});

test("invoice calculations handle interstate and disabled tax", () => {
  const lines = [{ description: "Workshop", quantity: 3, unitPrice: 1250, gstRate: 18 }];
  const interstate = computeTotals(lines, { interState: true, gstEnabled: true });
  assert.equal(interstate.total, 4425);
  assert.equal(interstate.igst, 675);
  assert.equal(interstate.cgst + interstate.sgst, 0);
  const exempt = computeTotals(lines, { interState: false, gstEnabled: false });
  assert.equal(exempt.total, 3750);
  assert.equal(exempt.lines[0].gstRate, 0);
});

test("financial-year numbers change at April midnight", () => {
  assert.equal(financialYear(new Date("2027-03-31Z")), "26-27");
  assert.equal(financialYear(new Date("2027-04-01Z")), "27-28");
});

test("invoice settlement includes withheld amounts and credit notes", () => {
  const inv = { status: "ISSUED", total: 1000, dueDate: new Date("2026-10-20Z") };
  const today = new Date("2026-10-17Z");
  assert.equal(settledAmount([{ amount: 900, tds: 100 }]), 1000);
  assert.equal(payState(inv, 1000, today), "PAID");
  assert.equal(payState(inv, 0, today, 1000), "CREDITED");
  assert.equal(payState(inv, 0, today, 500), "PART_PAID");
  assert.equal(payState(inv, 0, new Date("2026-10-21Z")), "OVERDUE");
});

test("purchase tax splits conserve every paise", () => {
  assert.deepEqual(taxSplit(0.01, false), { cgst: 0.01, sgst: 0, igst: 0 });
  assert.deepEqual(orderTotals([{ quantity: 3, unitPrice: 19.99, gstRate: 18 }]), { subtotal: 59.97, tax: 10.79, total: 70.76 });
});

test("CSV exports neutralize formula prefixes and escape quotes", () => {
  for (const value of ["=1+1", "+SUM(A1)", "-1+1", "@SUM(A1)", "\t=1+1", "\r=1+1"]) {
    assert.ok(csvCell(value).startsWith('"\''));
  }
  assert.equal(csvCell('School "A"'), '"School ""A"""');
  assert.equal(csvCell(-42), '"-42"');
});

test("password checks reject predictable and personal passwords", () => {
  assert.ok(passwordProblem("Password123!"));
  assert.ok(passwordProblem("Edubotics123!"));
  assert.ok(passwordProblem("AnjaliSecure8!", { name: "Anjali Kumar" }));
  assert.equal(passwordProblem("Copper!River47"), null);
});
