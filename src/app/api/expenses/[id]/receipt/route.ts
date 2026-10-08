import { getCurrentUser } from "@/lib/auth";
import { canManage } from "@/lib/team";
import { db } from "@/lib/db";

/** Streams a claim's receipt to the claimant, their manager or an admin. */
export async function GET(_: Request, { params }: RouteContext<"/api/expenses/[id]/receipt">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const receipt = await db.expenseReceipt.findUnique({ where: { claimId: id }, include: { claim: { select: { employeeId: true } } } });
  const allowed = receipt && (user.employee?.id === receipt.claim.employeeId || (await canManage(user, receipt.claim.employeeId)));
  if (!receipt || !allowed) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(receipt.data), {
    headers: {
      "Content-Type": receipt.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(receipt.fileName)}"`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
