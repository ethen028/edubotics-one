import "server-only";
import type { ClaimStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import {
  CLAIM_STATUSES,
  CLAIMS_API_METHODS,
  claimScopeFor,
  monthBounds,
  summarizeClaims,
  toAgentClaim,
  type AgentClaim,
  type ClaimRow,
} from "./claims-rules";

type Filter = { status?: ClaimStatus; month?: string };

const MAX_ROWS = 200;

/** Builds the claims API for one signed-in person. Every call is checked against what that person may see. */
export function createClaimsAgent(user: CurrentUser) {
  const scope = claimScopeFor(user);

  function where(f: Filter, reviewOnly: boolean): Prisma.ExpenseClaimWhereInput {
    const parts: Prisma.ExpenseClaimWhereInput[] = [];
    if (reviewOnly) {
      parts.push(scope);
    } else {
      // "mine": own claims only, even for admins and managers
      parts.push(user.employee ? { employeeId: user.employee.id } : { id: { in: [] } });
    }
    if (f.status) {
      if (!CLAIM_STATUSES.includes(f.status)) throw new Error(`Unknown status ${f.status}`);
      parts.push({ status: f.status });
    }
    if (f.month && f.month !== "all") {
      const bounds = monthBounds(f.month);
      if (!bounds) throw new Error('month must look like "2026-10" or "all"');
      parts.push({ date: { gte: bounds.start, lte: bounds.end } });
    }
    return { AND: parts };
  }

  async function fetchClaims(f: Filter, reviewOnly: boolean): Promise<AgentClaim[]> {
    const rows = await db.expenseClaim.findMany({
      where: where(f, reviewOnly),
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { date: "desc" },
      take: MAX_ROWS,
    });
    return rows.map((r) => toAgentClaim(r as ClaimRow));
  }

  const api = {
    listMyClaims: (args: Filter = {}) => fetchClaims(args, false),
    listClaimsForReview: (args: Filter = {}) => fetchClaims(args, true),
    getClaim: async ({ id }: { id: string }): Promise<AgentClaim | null> => {
      const row = await db.expenseClaim.findFirst({
        where: { AND: [{ id }, scope] },
        include: { employee: { select: { firstName: true, lastName: true } } },
      });
      return row ? toAgentClaim(row as ClaimRow) : null;
    },
    summarizeClaims: async ({ scope: which, month }: { scope: "mine" | "review"; month?: string }) => {
      const claims = await fetchClaims({ month }, which === "review");
      return summarizeClaims(claims);
    },
  };

  // Compile-time check that the object matches the declarations the model sees.
  const methods: Record<(typeof CLAIMS_API_METHODS)[number], unknown> = {
    listMyClaims: api.listMyClaims,
    listClaimsForReview: api.listClaimsForReview,
    getClaim: api.getClaim,
    summarizeClaims: api.summarizeClaims,
  };
  void methods;

  return api;
}
