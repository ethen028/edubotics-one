// Checks for payslip arithmetic: proration, loss of pay, PF/ESI when switched on, and exit settlements.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateSlip, employedDaysIn, halfYearMonths, monthRange, professionalTaxDue, ptForHalfYear, PT_DEFAULTS, type PayrollRules } from "../src/lib/payroll";
import { gratuityEarned, serviceYears, settlementAmounts, suggestedGratuity } from "../src/lib/exit-math";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const off: PayrollRules = { lopDivisor: 30, pfEnabled: false, esiEnabled: false, ptEnabled: false, tdsEnabled: false };
const noManual = { otherEarnings: 0, tds: 0, otherDeductions: 0 };
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

test("professional tax and TDS count only when switched on", () => {
  const manual = { ...noManual, tds: 1500 };
  assert.equal(calculateSlip({ structure: salary, daysInMonth: 30, employedDays: 30, lopDays: 0, manual, rules: off, professionalTax: 1250 }).net, 30000);
  const on = { ...off, ptEnabled: true, tdsEnabled: true };
  assert.equal(calculateSlip({ structure: salary, daysInMonth: 30, employedDays: 30, lopDays: 0, manual, rules: on, professionalTax: 1250 }).net, 27250);
});

test("ESI company share is a cost, not a deduction, and uses the rates from Settings", () => {
  const low = { basic: 10000, hra: 4000, specialAllowance: 1000 }; // ₹15,000
  const s = calculateSlip({ structure: low, daysInMonth: 30, employedDays: 30, lopDays: 0, manual: noManual, rules: { ...off, esiEnabled: true } });
  assert.deepEqual([s.esi, s.esiEmployer, s.net], [113, 488, 14887]); // 0.75% and 3.25% of 15,000, rounded up
  const revised = calculateSlip({ structure: low, daysInMonth: 30, employedDays: 30, lopDays: 0, manual: noManual, rules: { ...off, esiEnabled: true, esiEmployeeRate: 1, esiWageLimit: 14000 } });
  assert.equal(revised.esi, 0); // over a lowered limit
  const kept = calculateSlip({ structure: salary, daysInMonth: 30, employedDays: 30, lopDays: 2, manual: noManual, rules: { ...off, esiEnabled: true }, esiCovered: true });
  assert.equal(kept.esi, 210); // a raise mid-period keeps ESI: 0.75% of 28,000 earned
});

test("Kerala professional tax slabs per half-year", () => {
  assert.equal(ptForHalfYear(11999, PT_DEFAULTS.slabs), 0);
  assert.equal(ptForHalfYear(12000, PT_DEFAULTS.slabs), 120);
  assert.equal(ptForHalfYear(99999, PT_DEFAULTS.slabs), 750);
  assert.equal(ptForHalfYear(180000, PT_DEFAULTS.slabs), 1250);
  assert.deepEqual(halfYearMonths("2027-02"), ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]);
  assert.deepEqual(halfYearMonths("2026-04").slice(-1), ["2026-09"]);
});

test("professional tax is taken once a half-year, in the set month or the month someone leaves", () => {
  const base = { rules: PT_DEFAULTS, alreadyTaken: false, leavingThisMonth: false, employedDaysInHalf: 183, halfYearIncome: 180000 };
  assert.equal(professionalTaxDue({ ...base, month: "2026-07" }), 0); // before August
  assert.equal(professionalTaxDue({ ...base, month: "2026-08" }), 1250);
  assert.equal(professionalTaxDue({ ...base, month: "2026-09" }), 1250); // joined after August's payroll
  assert.equal(professionalTaxDue({ ...base, month: "2026-09", alreadyTaken: true }), 0);
  assert.equal(professionalTaxDue({ ...base, month: "2026-06", leavingThisMonth: true }), 1250);
  assert.equal(professionalTaxDue({ ...base, month: "2026-11" }), 0); // second half waits for February
  assert.equal(professionalTaxDue({ ...base, month: "2027-02", employedDaysInHalf: 45 }), 0); // under 60 days
});

test("gratuity set aside each month only when switched on, and the rules can change", () => {
  const s = calculateSlip({ structure: { basic: 26000, hra: 0, specialAllowance: 0 }, daysInMonth: 30, employedDays: 30, lopDays: 0, manual: noManual, rules: { ...off, gratuityEnabled: true } });
  assert.equal(s.gratuityProvision, 1250); // 26,000 × 15 ÷ 26 ÷ 12
  assert.equal(s.net, 26000);
  assert.equal(calculateSlip({ structure: salary, daysInMonth: 30, employedDays: 30, lopDays: 0, manual: noManual, rules: off }).gratuityProvision, 0);
  assert.equal(gratuityEarned(26000, d("2023-01-01"), d("2026-08-01")), 60000); // earned for 4 years, not payable yet
  assert.equal(suggestedGratuity(26000, d("2020-01-01"), d("2026-08-01"), { days: 15, divisor: 26, minYears: 5, cap: 100000 }), 100000);
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
