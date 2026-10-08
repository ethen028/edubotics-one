import "server-only";
import type { ClaimStatus, Prisma } from "@prisma/client";
import { isAdmin, type CurrentUser } from "./auth";
import { monthRange } from "./payroll";
import { CLAIM_LABEL } from "./expenses";

export type TeamFilter = { month: string; status: ClaimStatus | ""; employeeId: string };

/** Reads ?month=2026-10|all&status=&person= with this month as the default. */
export function readTeamFilter(sp: Record<string, string | string[] | undefined>, thisMonth: string): TeamFilter {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const month = one("month") === "all" || /^\d{4}-(0[1-9]|1[0-2])$/.test(one("month")) ? one("month") : thisMonth;
  const status = one("status") in CLAIM_LABEL ? (one("status") as ClaimStatus) : "";
  return { month, status, employeeId: one("person") };
}

/** Claims a manager (direct reports) or an admin (everyone) can see, narrowed by the filter. */
export function teamClaimsWhere(user: CurrentUser, f: TeamFilter): Prisma.ExpenseClaimWhereInput {
  const where: Prisma.ExpenseClaimWhereInput = isAdmin(user)
    ? {}
    : { employee: { managerId: user.employee?.id ?? "__none__" } };
  if (f.month !== "all") {
    const { start, end } = monthRange(f.month);
    where.date = { gte: start, lte: end };
  }
  if (f.status) where.status = f.status;
  if (f.employeeId) where.employeeId = f.employeeId;
  return where;
}
