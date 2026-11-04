import { getApiUser } from "@/lib/auth";
import { removeOwnEntry } from "@/lib/timesheet-entries";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };

/** Removes one of the person's own entries while the week is open. */
export async function POST(_: Request, { params }: RouteContext<"/api/mobile/timesheet/entries/[id]/delete">) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const { id } = await params;
  const result = await removeOwnEntry(access.user, id);
  return Response.json(result, { status: result.error ? 400 : 200, headers: noStore });
}
