import type { ClaimStatus, ExpenseCategory } from "@prisma/client";

export const EXPENSE_CATEGORIES = [
  "TRAVEL",
  "FOOD",
  "LODGING",
  "KITS_MATERIALS",
  "PRINTING",
  "PHONE_INTERNET",
  "OTHER",
] as const satisfies readonly ExpenseCategory[];

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  TRAVEL: "Travel",
  FOOD: "Food",
  LODGING: "Stay",
  KITS_MATERIALS: "Kits and materials",
  PRINTING: "Printing",
  PHONE_INTERNET: "Phone and internet",
  OTHER: "Other",
};

export const VEHICLES = ["TWO_WHEELER", "CAR"] as const;
export const VEHICLE_LABEL: Record<(typeof VEHICLES)[number], string> = { TWO_WHEELER: "Own two-wheeler", CAR: "Own car" };

export const CLAIM_COLOR: Record<ClaimStatus, "amber" | "blue" | "red" | "green"> = {
  SUBMITTED: "amber",
  APPROVED: "blue",
  REJECTED: "red",
  PAID: "green",
};

export const CLAIM_LABEL: Record<ClaimStatus, string> = {
  SUBMITTED: "Waiting for approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PAID: "Paid",
};

/** What the company owes on a claim: the approved amount if the approver changed it, else the claimed amount. */
export const payableOf = (c: { amount: { toString(): string }; approvedAmount: { toString(): string } | null }) =>
  Number((c.approvedAmount ?? c.amount).toString());
