import { getApiUser } from "@/lib/auth";
import { cancelOwnLeave } from "@/lib/leave-requests";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };

/** Cancels the person's own pending leave, or approved leave that hasn't started. */
export async function POST(_: Request, { params }: RouteContext<"/api/mobile/leave/[id]/cancel">) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const { id } = await params;
  const result = await cancelOwnLeave(access.user, id);
  return Response.json(result, { status: result.error ? 400 : 200, headers: noStore });
}
