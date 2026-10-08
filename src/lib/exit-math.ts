// Exit and offboarding rules. Pure functions and labels, safe in any component.

import type { ExitKind, ExitStage } from "@prisma/client";

export const EXIT_KIND_LABEL: Record<ExitKind, string> = {
  RESIGNATION: "Resignation",
  TERMINATION: "Let go by the company",
  END_OF_CONTRACT: "End of contract",
  RETIREMENT: "Retirement",
  OTHER: "Other",
};

export const EXIT_STAGE: Record<ExitStage, { label: string; color: "amber" | "blue" | "gray" | "green" }> = {
  REQUESTED: { label: "Waiting for acceptance", color: "amber" },
  ON_NOTICE: { label: "Serving notice", color: "blue" },
  LEFT: { label: "Left", color: "gray" },
  WITHDRAWN: { label: "Withdrawn", color: "green" },
};

/** Standard leaving checklist. The app also checks assets, kits, claims and handover on its own. */
export const EXIT_TASK_TEMPLATE = [
  { title: "Hand over work, files and passwords", category: "Manager" },
  { title: "Hand over school programmes and upcoming sessions", category: "Manager" },
  { title: "Return laptop, phone, kits and ID card", category: "Admin" },
  { title: "Close company email and other accounts", category: "IT Setup" },
  { title: "Exit interview", category: "HR" },
  { title: "Settle expense claims and any advances", category: "Payroll" },
  { title: "Final settlement agreed and paid", category: "Payroll" },
  { title: "Relieving and experience letter given", category: "HR" },
] as const;

export const EXIT_TASK_CATEGORIES = ["Manager", "Admin", "IT Setup", "HR", "Payroll", "Other"] as const;

/** Main reason for leaving, asked in the exit interview. */
export const EXIT_REASONS = [
  "Better pay elsewhere",
  "Career growth",
  "Higher studies",
  "Moving to another place",
  "Family or personal reasons",
  "Health",
  "Work or workload",
  "Manager or team",
  "Travel to schools",
  "Other",
] as const;

const DAY = 86_400_000;
const days = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** The last day if the full notice is served: the date notice was given plus the notice days. */
export const fullNoticeLastDay = (givenOn: Date, noticeDays: number) => addDays(givenOn, noticeDays);

/** Days of notice served up to the last working day, and how many short of the full notice. */
export function noticeServed(givenOn: Date, lastDay: Date, noticeDays: number) {
  const served = Math.max(0, days(givenOn, lastDay));
  return { served, short: Math.max(0, noticeDays - served) };
}

/** Pay for one day in the settlement: monthly gross ÷ the LOP divisor, the same rate as loss of pay. */
export function dayRate(structure: { basic: number; hra: number; specialAllowance: number }, lopDivisor: number) {
  return (structure.basic + structure.hra + structure.specialAllowance) / lopDivisor;
}

/** Whole years of service, counting a part year over six months as a full year (as gratuity does). */
export function serviceYears(joined: Date, lastDay: Date) {
  let years = lastDay.getUTCFullYear() - joined.getUTCFullYear();
  let months = lastDay.getUTCMonth() - joined.getUTCMonth();
  if (lastDay.getUTCDate() < joined.getUTCDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, rounded: years + (months >= 6 ? 1 : 0) };
}

export const GRATUITY_CAP = 2_000_000;

/**
 * Gratuity under the Payment of Gratuity Act, for five or more years of service:
 * 15 days' basic for each year (basic × 15 ÷ 26 × years), up to ₹20 lakh. Zero below five years.
 */
export function suggestedGratuity(monthlyBasic: number, joined: Date, lastDay: Date) {
  const s = serviceYears(joined, lastDay);
  if (s.years < 5) return 0;
  return Math.min(GRATUITY_CAP, Math.round((monthlyBasic * 15 * s.rounded) / 26));
}

type SettlementInput = {
  encashDays: { toString(): string } | number;
  noticePayDays: { toString(): string } | number;
  recoveryDays: { toString(): string } | number;
  gratuity: { toString(): string } | number;
  recoveries: { toString(): string } | number;
};

/** The final settlement in rupees, from the day counts and the day rate. */
export function settlementAmounts(e: SettlementInput, rate: number) {
  const n = (v: { toString(): string } | number) => Number(v.toString());
  const leaveEncashment = Math.round(rate * n(e.encashDays));
  const noticePay = Math.round(rate * n(e.noticePayDays));
  const gratuity = Math.round(n(e.gratuity));
  const noticeRecovery = Math.round(rate * n(e.recoveryDays));
  const exitRecovery = Math.round(n(e.recoveries));
  const earnings = leaveEncashment + noticePay + gratuity;
  const deductions = noticeRecovery + exitRecovery;
  return { leaveEncashment, noticePay, gratuity, noticeRecovery, exitRecovery, earnings, deductions, net: earnings - deductions };
}

export type Settlement = Pick<
  ReturnType<typeof settlementAmounts>,
  "leaveEncashment" | "noticePay" | "gratuity" | "noticeRecovery" | "exitRecovery"
>;
