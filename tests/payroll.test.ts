// Checks for payslip arithmetic: proration, loss of pay, PF/ESI when switched on, and exit settlements.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateSlip, employedDaysIn, monthRange, type PayrollRules } from "../src/lib/payroll";
import { serviceYears, settlementAmounts, suggestedGratuity } from "../src/lib/exit-math";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const off: PayrollRules = { lopDivisor: 30, pfEnabled: false, esiEnabled: false, ptEnabled: false, tdsEnabled: false };
const noManual = { otherEarnings: 0, professionalTax: 0, tds: 0, otherDeductions: 0 };
const salary = { basic: 20000, hra: 8000, specialAllowance: 2000 }; // ₹30,000 a month

test("a full month with two days' loss of pay", () => {
  const s = calculateSlip({ structure: salary, daysInMonth: 30, employedDays: 30, lopDays: 2, manual: noManual, rules: off });
  assert.equal(s.gross, 30000);
  assert.equal(s.lopDeduction, 2000); // 30,000 ÷ 30 × 2
  assert.equal(s.net, 28000);
  assert.equal(s.paidDays, 28);
});

test("someone joining on 16 October is paid for 16 of 31 days", () => {
  const days = employedDaysIn("2026-10", d("2026-10-16"), null);
  assert.equal(days, 16);
  const s = calculateSlip({ structure: salary, daysInMonth: monthRange("2026-10").days, employedDays: days, lopDays: 0, manual: noManual, rules: off });
  assert.deepEqual([s.basic, s.hra, s.specialAllowance, s.gross], [10323, 4129, 1032, 15484]);
});

test("loss of pay never takes more than the salary", () => {
  const s = calculateSlip({ structure: salary, daysInMonth: 30, employedDays: 30, lopDays: 40, manual: noManual, rules: off });
  assert.equal(s.lopDays, 30);
  assert.equal(s.net, 0);
});

test("expense claims are paid on top of net salary", () => {
  const s = calculateSlip({ structure: salary, daysInMonth: 30, employedDays: 30, lopDays: 0, manual: noManual, rules: off, reimbursements: 640.5 });
  assert.equal(s.net, 30640.5);
});

test("PF and ESI only when switched on, with their limits", () => {
  const on = { ...off, pfEnabled: true, esiEnabled: true };
  const high = calculateSlip({ structure: salary, daysInMonth: 30, employedDays: 30, lopDays: 0, manual: noManual, rules: on });
  assert.equal(high.pf, 1800); // 12% of basic capped at ₹15,000
  assert.equal(high.esi, 0); // gross above ₹21,000
  const low = calculateSlip({ structure: { basic: 10000, hra: 4000, specialAllowance: 1000 }, daysInMonth: 30, employedDays: 30, lopDays: 0, manual: noManual, rules: on });
  assert.equal(low.esi, 113); // 0.75% of ₹15,000, rounded up
  assert.equal(calculateSlip({ structure: salary, daysInMonth: 30, employedDays: 30, lopDays: 0, manual: noManual, rules: off }).pf, 0);
});

test("professional tax and TDS entered by hand count only when switched on", () => {
  const manual = { ...noManual, professionalTax: 200, tds: 1500 };
  assert.equal(calculateSlip({ structure: salary, daysInMonth: 30, employedDays: 30, lopDays: 0, manual, rules: off }).net, 30000);
  const on = { ...off, ptEnabled: true, tdsEnabled: true };
  assert.equal(calculateSlip({ structure: salary, daysInMonth: 30, employedDays: 30, lopDays: 0, manual, rules: on }).net, 28300);
});

test("gratuity starts at five years and counts over six months as a full year", () => {
  assert.equal(serviceYears(d("2020-01-01"), d("2026-08-01")).rounded, 7);
  assert.equal(suggestedGratuity(26000, d("2020-01-01"), d("2026-08-01")), 105000); // 26,000 × 15 × 7 ÷ 26
  assert.equal(suggestedGratuity(26000, d("2022-01-01"), d("2026-08-01")), 0);
});

test("final settlement adds encashment and notice pay, takes off recoveries", () => {
  const s = settlementAmounts({ encashDays: 5, noticePayDays: 0, recoveryDays: 3, gratuity: 0, recoveries: 1200 }, 1000);
  assert.deepEqual([s.earnings, s.deductions, s.net], [5000, 4200, 800]);
});
