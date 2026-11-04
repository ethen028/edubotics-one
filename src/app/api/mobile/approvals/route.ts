import { getApiUser } from "@/lib/auth";
import { approvalsForPhone } from "@/lib/mobile-approvals";

export const dynamic = "force-dynamic";

/** Everything waiting on this person's decision, for the phone's Approvals tab. */
export async function GET() {
  const access = await getApiUser();
  if (access.error) return access.error;
  // Same people as the web Approvals page.
  if (!["ADMIN", "MANAGER"].includes(access.user.role)) return Response.json({ error: "Approvals are for managers and admins." }, { status: 403 });
  return Response.json(await approvalsForPhone(access.user), { headers: { "Cache-Control": "no-store, max-age=0" } });
}
