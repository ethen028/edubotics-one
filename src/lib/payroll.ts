// Payroll arithmetic. Pure functions so the rules are easy to read and check.

import { GRATUITY_DEFAULTS, type GratuityRules } from "./exit-math";

export type Structure = { basic: number; hra: number; specialAllowance: number };
export type PayrollRules = {
  lopDivisor: number;
  pfEnabled: boolean;
  esiEnabled: boolean;
  ptEnabled: boolean;
  tdsEnabled: boolean;
  gratuityEnabled?: boolean;
  /** Percentages, e.g. 0.75 and 3.25. Default to ESI_RATES. */
  esiEmployeeRate?: number;
  esiEmployerRate?: number;
  esiWageLimit?: number;
  gratuity?: GratuityRules;
};
export type Manual = { otherEarnings: number; tds: number; otherDeductions: number };
/** Final settlement amounts for someone leaving this month (see lib/exit-math). */
export type FinalSettlement = { leaveEncashment: number; noticePay: number; gratuity: number; noticeRecovery: number; exitRecovery: number };

/** Statutory rates used when the switches are turned on (employee share). */
export const PF_RATE = 0.12;
export const PF_WAGE_CEILING = 15000;
/** ESI as notified by ESIC (employee 0.75%, company 3.25%, for gross wages up to ₹21,000). Editable in Settings. */
export const ESI_RATES = { employee: 0.75, employer: 3.25, wageLimit: 21000 };

const rupees = (n: number) => Math.round(n);

export const monthlyGross = (s: Structure) => s.basic + s.hra + s.specialAllowance;

/**
 * One employee's pay for one month.
 * - Salary is prorated for joining or leaving mid-month (calendar days employed ÷ days in month).
 * - LOP per day = full monthly gross ÷ lopDivisor (30 by default, as in Edubotics HR V1.2).
 * - PF and ESI are worked out only when switched on. ESI is on wages earned (after LOP), rounded up to the rupee,
 *   for people covered this contribution period (esiCovered; by default, monthly gross within the wage limit).
 * - Professional tax is worked out from the half-year slabs by professionalTaxDue() and passed in; TDS is entered by hand.
 * - The company's ESI share and the gratuity set aside are costs to the company, not deductions from pay.
 * - Approved expense claims are paid back on top of net salary; they are not earnings, so no LOP or ESI applies.
 * - A final settlement (leave encashment, notice pay, gratuity, recoveries) is added in full, with no LOP or ESI on it.
 */
export function calculateSlip(args: {
  structure: Structure;
  daysInMonth: number;
  employedDays: number;
  lopDays: number;
  manual: Manual;
  rules: PayrollRules;
  reimbursements?: number;
  settlement?: FinalSettlement | null;
  esiCovered?: boolean;
  professionalTax?: number;
}) {
  const { structure, daysInMonth, employedDays, rules, manual } = args;
  const lopDays = Math.min(Math.max(0, args.lopDays), employedDays);
  const factor = employedDays / daysInMonth;
  const basic = rupees(structure.basic * factor);
  const hra = rupees(structure.hra * factor);
  const specialAllowance = rupees(structure.specialAllowance * factor);
  const otherEarnings = rupees(manual.otherEarnings);
  const fs = args.settlement;
  const leaveEncashment = rupees(fs?.leaveEncashment ?? 0);
  const noticePay = rupees(fs?.noticePay ?? 0);
  const gratuity = rupees(fs?.gratuity ?? 0);
  const noticeRecovery = rupees(fs?.noticeRecovery ?? 0);
  const exitRecovery = rupees(fs?.exitRecovery ?? 0);
  const salaryGross = basic + hra + specialAllowance + otherEarnings;
  const gross = salaryGross + leaveEncashment + noticePay + gratuity;
  const lopDeduction = Math.min(salaryGross, rupees((monthlyGross(structure) / rules.lopDivisor) * lopDays));

  const paidShare = employedDays ? (employedDays - lopDays) / employedDays : 0;
  const pf = rules.pfEnabled ? rupees(PF_RATE * Math.min(basic * paidShare, PF_WAGE_CEILING)) : 0;
  const esiCovered = args.esiCovered ?? monthlyGross(structure) <= (rules.esiWageLimit ?? ESI_RATES.wageLimit);
  const esiWages = salaryGross - lopDeduction;
  const esiOn = rules.esiEnabled && esiCovered && esiWages > 0;
  // ESIC rounds both shares up to the next rupee. Small sums like 0.75% of ₹15,000 need care with floating point.
  const share = (pct: number) => Math.ceil(Math.round(esiWages * pct * 100) / 10000);
  const esi = esiOn ? share(rules.esiEmployeeRate ?? ESI_RATES.employee) : 0;
  const esiEmployer = esiOn ? share(rules.esiEmployerRate ?? ESI_RATES.employer) : 0;
  const professionalTax = rules.ptEnabled ? rupees(args.professionalTax ?? 0) : 0;
  const g = rules.gratuity ?? GRATUITY_DEFAULTS;
  const gratuityProvision = rules.gratuityEnabled ? rupees((basic * paidShare * g.days) / g.divisor / 12) : 0;
  const tds = rules.tdsEnabled ? rupees(manual.tds) : 0;
  const otherDeductions = rupees(manual.otherDeductions);
  const totalDeductions = lopDeduction + pf + esi + professionalTax + tds + otherDeductions + noticeRecovery + exitRecovery;
  const reimbursements = Math.round((args.reimbursements ?? 0) * 100) / 100;

  return {
    daysInMonth,
    paidDays: employedDays - lopDays,
    lopDays,
    basic,
    hra,
    specialAllowance,
    otherEarnings,
    gross,
    lopDeduction,
    pf,
    esi,
    esiEmployer,
    professionalTax,
    tds,
    otherDeductions,
    finalSettlement: !!fs,
    leaveEncashment,
    noticePay,
    gratuity,
    noticeRecovery,
    exitRecovery,
    totalDeductions,
    reimbursements,
    net: Math.max(0, gross - totalDeductions) + reimbursements,
    gratuityProvision,
  };
}

// ─── Kerala professional tax ───────────────────────────────────────────────
// Charged by the panchayat, municipality or corporation per half-year (April–September, October–March) on the
// salary earned in that half-year, for people employed there 60 days or more. The company takes it from pay once
// in each half-year and pays it to the local body.

/** Tax for half-year salary of `from` rupees or more, up to the next slab. */
export type PtSlab = { from: number; tax: number };
export type PtRules = { firstHalfMonth: number; secondHalfMonth: number; minDays: number; slabs: PtSlab[] };

/** Kerala slabs per half-year (Kerala Municipality / Panchayat Raj profession tax rules). Editable in Settings. */
export const KERALA_PT_SLABS: PtSlab[] = [
  { from: 12000, tax: 120 },
  { from: 18000, tax: 180 },
  { from: 30000, tax: 300 },
  { from: 45000, tax: 450 },
  { from: 60000, tax: 600 },
  { from: 75000, tax: 750 },
  { from: 100000, tax: 1000 },
  { from: 125000, tax: 1250 },
];
export const PT_DEFAULTS: PtRules = { firstHalfMonth: 8, secondHalfMonth: 2, minDays: 60, slabs: KERALA_PT_SLABS };

/** The tax for a half-year's salary: the highest slab it reaches, or nothing below the first slab. */
export function ptForHalfYear(income: number, slabs: PtSlab[]) {
  return [...slabs].sort((a, b) => a.from - b.from).reduce((tax, s) => (income >= s.from ? s.tax : tax), 0);
}

const isFirstHalf = (m: number) => m >= 4 && m <= 9;

/** "2026-10" → the six months of its half-year, "2026-10" … "2027-03". */
export function halfYearMonths(month: string) {
  const [y, m] = month.split("-").map(Number);
  const startYear = m >= 4 ? y : y - 1;
  const startMonth = isFirstHalf(m) ? 4 : 10;
  return Array.from({ length: 6 }, (_, i) => {
    const n = startMonth - 1 + i;
    return `${startYear + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
  });
}

/**
 * Professional tax to take on this month's payslip.
 * Taken once a half-year: in the month set for that half, on a later payslip if it wasn't taken then (someone who
 * joined after it), or earlier in the month someone leaves. Nothing for under minDays employed in the half-year.
 */
export function professionalTaxDue(args: {
  month: string;
  rules: PtRules;
  alreadyTaken: boolean;
  leavingThisMonth: boolean;
  employedDaysInHalf: number;
  halfYearIncome: number;
}) {
  const { month, rules } = args;
  if (args.alreadyTaken || args.employedDaysInHalf < rules.minDays) return 0;
  const m = Number(month.slice(5));
  const first = isFirstHalf(m) ? 4 : 10;
  const pos = (x: number) => (x - first + 12) % 12;
  const due = isFirstHalf(m) ? rules.firstHalfMonth : rules.secondHalfMonth;
  if (pos(m) < pos(due) && !args.leavingThisMonth) return 0;
  return ptForHalfYear(args.halfYearIncome, rules.slabs);
}

// ─── Reading the rules from Settings ────────────────────────────────────────

type Num = { toString(): string } | number;
const n = (v: Num) => Number(v.toString());

/** Slabs saved in Settings, or the Kerala defaults if they can't be read. */
export function parseSlabs(v: unknown): PtSlab[] {
  if (!Array.isArray(v)) return KERALA_PT_SLABS;
  const slabs = v
    .map((x) => ({ from: Number(x?.from), tax: Number(x?.tax) }))
    .filter((x) => Number.isFinite(x.from) && Number.isFinite(x.tax) && x.from >= 0 && x.tax >= 0);
  return slabs.sort((a, b) => a.from - b.from);
}

export function payrollRules(s: {
  lopDivisor: number;
  pfEnabled: boolean;
  esiEnabled: boolean;
  ptEnabled: boolean;
  tdsEnabled: boolean;
  gratuityEnabled: boolean;
  esiEmployeeRate: Num;
  esiEmployerRate: Num;
  esiWageLimit: number;
  gratuityDays: number;
  gratuityDivisor: number;
  gratuityMinYears: number;
  gratuityCap: number;
}): PayrollRules {
  return {
    lopDivisor: s.lopDivisor,
    pfEnabled: s.pfEnabled,
    esiEnabled: s.esiEnabled,
    ptEnabled: s.ptEnabled,
    tdsEnabled: s.tdsEnabled,
    gratuityEnabled: s.gratuityEnabled,
    esiEmployeeRate: n(s.esiEmployeeRate),
    esiEmployerRate: n(s.esiEmployerRate),
    esiWageLimit: s.esiWageLimit,
    gratuity: gratuityRules(s),
  };
}

export const gratuityRules = (s: { gratuityDays: number; gratuityDivisor: number; gratuityMinYears: number; gratuityCap: number }): GratuityRules => ({
  days: s.gratuityDays,
  divisor: s.gratuityDivisor,
  minYears: s.gratuityMinYears,
  cap: s.gratuityCap,
});

export const ptRules = (s: { ptFirstHalfMonth: number; ptSecondHalfMonth: number; ptMinDays: number; ptSlabs: unknown }): PtRules => ({
  firstHalfMonth: s.ptFirstHalfMonth,
  secondHalfMonth: s.ptSecondHalfMonth,
  minDays: s.ptMinDays,
  slabs: parseSlabs(s.ptSlabs),
});

/** "2026-10" → first and last day (UTC midnight) and the day count. */
export function monthRange(month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error("Invalid month");
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const end = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0));
  return { start, end, days: end.getUTCDate() };
}

export function monthLabel(month: string) {
  return monthRange(month).start.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Calendar days of the month the employee was on the rolls. */
export function employedDaysIn(month: string, joined: Date, exited: Date | null) {
  const { start, end } = monthRange(month);
  const from = joined > start ? joined : start;
  const to = exited && exited < end ? exited : end;
  return to < from ? 0 : Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
}

export const RUN_COLOR = { DRAFT: "amber", FINALIZED: "blue", PAID: "green" } as const;

type Money = { toString(): string };
type SlipAmounts = Record<
  | "basic"
  | "hra"
  | "specialAllowance"
  | "otherEarnings"
  | "leaveEncashment"
  | "noticePay"
  | "gratuity"
  | "lopDeduction"
  | "pf"
  | "esi"
  | "professionalTax"
  | "tds"
  | "otherDeductions"
  | "noticeRecovery"
  | "exitRecovery"
  | "esiEmployer"
  | "gratuityProvision",
  Money
>;

/** The earnings and deductions lines printed on a payslip, on screen and in the PDF. */
export function payslipParts(p: SlipAmounts) {
  const earnings = (
    [
      ["Basic", p.basic],
      ["HRA", p.hra],
      ["Special allowance", p.specialAllowance],
      ["Other earnings", p.otherEarnings],
      ["Leave encashment", p.leaveEncashment],
      ["Notice pay", p.noticePay],
      ["Gratuity", p.gratuity],
    ] as [string, Money][]
  ).filter(([, v], i) => i < 3 || Number(v) > 0);
  const deductions = (
    [
      ["Loss of pay", p.lopDeduction],
      ["Provident fund", p.pf],
      ["ESI", p.esi],
      ["Professional tax", p.professionalTax],
      ["TDS", p.tds],
      ["Other deductions", p.otherDeductions],
      ["Notice period not served", p.noticeRecovery],
      ["Recoveries on leaving", p.exitRecovery],
    ] as [string, Money][]
  ).filter(([, v]) => Number(v) > 0);
  // Paid by the company on top of salary; shown so people see their full cost, never taken from pay.
  const companyPays = (
    [
      ["ESI (company's share)", p.esiEmployer],
      ["Gratuity set aside this month", p.gratuityProvision],
    ] as [string, Money][]
  ).filter(([, v]) => Number(v) > 0);
  return { earnings, deductions, companyPays };
}
