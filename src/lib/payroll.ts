// Payroll arithmetic. Pure functions so the rules are easy to read and check.

export type Structure = { basic: number; hra: number; specialAllowance: number };
export type PayrollRules = {
  lopDivisor: number;
  pfEnabled: boolean;
  esiEnabled: boolean;
  ptEnabled: boolean;
  tdsEnabled: boolean;
};
export type Manual = { otherEarnings: number; professionalTax: number; tds: number; otherDeductions: number };
/** Final settlement amounts for someone leaving this month (see lib/exit-math). */
export type FinalSettlement = { leaveEncashment: number; noticePay: number; gratuity: number; noticeRecovery: number; exitRecovery: number };

/** Statutory rates used when the switches are turned on (employee share). */
export const PF_RATE = 0.12;
export const PF_WAGE_CEILING = 15000;
export const ESI_RATE = 0.0075;
export const ESI_GROSS_LIMIT = 21000;

const rupees = (n: number) => Math.round(n);

export const monthlyGross = (s: Structure) => s.basic + s.hra + s.specialAllowance;

/**
 * One employee's pay for one month.
 * - Salary is prorated for joining or leaving mid-month (calendar days employed ÷ days in month).
 * - LOP per day = full monthly gross ÷ lopDivisor (30 by default, as in Edubotics HR V1.2).
 * - PF and ESI are worked out only when switched on; PT and TDS are entered by hand when switched on.
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
  const esi =
    rules.esiEnabled && monthlyGross(structure) <= ESI_GROSS_LIMIT ? Math.ceil(ESI_RATE * (salaryGross - lopDeduction)) : 0;
  const professionalTax = rules.ptEnabled ? rupees(manual.professionalTax) : 0;
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
  };
}

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
  | "exitRecovery",
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
  return { earnings, deductions };
}
