import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { limitedJson } from "@/lib/request-body";
import { decideLeaveRequest } from "@/lib/leave-requests";
import {
  decideClaimRequest, decideCorrectionRequest, decideProjectApproval, decidePurchaseOrderDecision, decideStockRequestDecision, decideTimesheetRequest,
  type DecisionOutcome,
} from "@/lib/decisions";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };

const input = z.object({
  kind: z.enum(["leave", "correction", "timesheet", "claim", "project", "stock", "purchase"]),
  id: z.string().min(1).max(100),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(1000).optional(),
  approvedAmount: z.number().nonnegative().max(10_000_000).nullable().optional(),
});

/** Approves or rejects one item from the phone, with the same checks as the web Approvals page. */
export async function POST(request: Request) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const parsed = input.safeParse(await limitedJson(request));
  if (!parsed.success) return Response.json({ error: "Something was missing. Pull down to refresh and try again." }, { status: 400, headers: noStore });
  const { kind, id, decision, approvedAmount } = parsed.data;
  const note = parsed.data.note || null;
  const user = access.user;
  const result: DecisionOutcome =
    kind === "leave" ? await decideLeaveRequest(user, id, decision, note)
    : kind === "correction" ? await decideCorrectionRequest(user, id, decision)
    : kind === "timesheet" ? await decideTimesheetRequest(user, id, decision, note)
    : kind === "claim" ? await decideClaimRequest(user, id, decision, note, approvedAmount)
    : kind === "project" ? await decideProjectApproval(user, id, decision, note)
    : kind === "stock" ? await decideStockRequestDecision(user, id, decision, note)
    : await decidePurchaseOrderDecision(user, id, decision, note);
  return Response.json(result, { status: result.error ? (result.gone ? 409 : 400) : 200, headers: noStore });
}
