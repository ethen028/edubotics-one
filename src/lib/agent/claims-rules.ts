// Pure rules for the agent's read-only view of expense claims. No database, so `npm test` can check them.
// Money is summed in paise (whole integers) so totals never drift from floating-point error.
import type { ClaimStatus, Prisma } from "@prisma/client";
import type { ApiCatalog } from "./catalog";

export const CLAIM_STATUSES = ["SUBMITTED", "APPROVED", "REJECTED", "PAID"] as const satisfies readonly ClaimStatus[];

/** The part of a signed-in user the rules need. Matches CurrentUser from src/lib/auth.ts. */
export type AgentUser = { role: "ADMIN" | "HR" | "MANAGER" | "EMPLOYEE"; employee: { id: string } | null };

/**
 * Which claims a person may read through the agent. Same rule as the expense pages:
 * admins see every claim in the company, managers see their own and their direct reports',
 * everyone else (including HR, who never sees pay) sees only their own.
 * `db` adds the company filter on top of this.
 */
export function claimScopeFor(user: AgentUser): Prisma.ExpenseClaimWhereInput {
  if (user.role === "ADMIN") return {};
  if (!user.employee) return { id: { in: [] } }; // no employee record: matches nothing
  const own: Prisma.ExpenseClaimWhereInput = { employeeId: user.employee.id };
  if (user.role === "MANAGER") return { OR: [own, { employee: { managerId: user.employee.id } }] };
  return own;
}

/** "2026-10" → first and last day of that month, at UTC midnight (how @db.Date values are stored). null if malformed. */
export function monthBounds(month: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  return {
    start: new Date(Date.UTC(year, monthIndex, 1)),
    end: new Date(Date.UTC(year, monthIndex + 1, 0)),
  };
}

/** Converts a decimal string such as "1250.5" or "1250.50" to whole paise. Throws on anything else. */
export function toPaise(amount: string): number {
  if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) throw new Error(`Not a money amount: ${amount}`);
  return Math.round(Number(amount) * 100);
}

export const fromPaise = (paise: number) => (paise / 100).toFixed(2);

/** One claim as the agent sees it. Money is a decimal string. */
export type AgentClaim = {
  id: string;
  date: string; // YYYY-MM-DD
  category: string;
  description: string;
  status: ClaimStatus;
  claimed: string;
  /** What the company owes on it: the approved amount, only once approved or paid. Otherwise null. */
  payable: string | null;
  employee: string;
};

export type ClaimRow = {
  id: string;
  date: Date;
  category: string;
  description: string;
  status: ClaimStatus;
  amount: { toString(): string };
  approvedAmount: { toString(): string } | null;
  employee: { firstName: string; lastName: string };
};

export function toAgentClaim(c: ClaimRow): AgentClaim {
  const payable =
    (c.status === "APPROVED" || c.status === "PAID") ? (c.approvedAmount ?? c.amount).toString() : null;
  return {
    id: c.id,
    date: c.date.toISOString().slice(0, 10),
    category: c.category,
    description: c.description,
    status: c.status,
    claimed: c.amount.toString(),
    payable,
    employee: `${c.employee.firstName} ${c.employee.lastName}`.trim(),
  };
}

export type StatusTotal = { count: number; claimed: string; payable: string };

/** Counts and money totals per status. `payable` sums only approved and paid claims. */
export function summarizeClaims(claims: AgentClaim[]): { count: number; byStatus: Record<ClaimStatus, StatusTotal> } {
  const byStatus = Object.fromEntries(
    CLAIM_STATUSES.map((s) => [s, { count: 0, claimedPaise: 0, payablePaise: 0 }]),
  ) as Record<ClaimStatus, { count: number; claimedPaise: number; payablePaise: number }>;
  for (const c of claims) {
    const row = byStatus[c.status];
    row.count += 1;
    row.claimedPaise += toPaise(c.claimed);
    if (c.payable !== null) row.payablePaise += toPaise(c.payable);
  }
  const out = Object.fromEntries(
    CLAIM_STATUSES.map((s) => {
      const r = byStatus[s];
      return [s, { count: r.count, claimed: fromPaise(r.claimedPaise), payable: fromPaise(r.payablePaise) }];
    }),
  ) as Record<ClaimStatus, StatusTotal>;
  return { count: claims.length, byStatus: out };
}

/** The functions the sandboxed code may call. The API object in claims-api.ts must have exactly these keys. */
export const CLAIMS_API_METHODS = ["listMyClaims", "listClaimsForReview", "getClaim", "summarizeClaims"] as const;

/** Everything the model can search for about claims. Each name must be in CLAIMS_API_METHODS. */
export const CLAIMS_CATALOG: ApiCatalog = {
  types: `type ClaimStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "PAID";
type Claim = {
  id: string; date: string; category: string; description: string; status: ClaimStatus;
  claimed: string; payable: string | null; employee: string;
};
type ClaimSummary = {
  count: number;
  byStatus: Record<ClaimStatus, { count: number; claimed: string; payable: string }>;
};
// Money is a decimal string such as "1250.00". month is "YYYY-MM" or "all". Read-only.`,
  entries: [
    {
      name: "listMyClaims",
      description: "list claims the signed-in person made, filter by status and month",
      declaration: "listMyClaims(args?: { status?: ClaimStatus; month?: string }): Promise<Claim[]>;",
    },
    {
      name: "listClaimsForReview",
      description: "list claims to review: direct reports for managers, all claims for admins, filter by status and month",
      declaration: "listClaimsForReview(args?: { status?: ClaimStatus; month?: string }): Promise<Claim[]>;",
    },
    {
      name: "getClaim",
      description: "one claim by id, or null if the person cannot see it",
      declaration: "getClaim(args: { id: string }): Promise<Claim | null>;",
    },
    {
      name: "summarizeClaims",
      description: "counts and money totals per status for mine or review claims in a month, use for totals",
      declaration: 'summarizeClaims(args: { scope: "mine" | "review"; month?: string }): Promise<ClaimSummary>;',
    },
  ],
};
