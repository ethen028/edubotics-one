import { getApiUser } from "@/lib/auth";
import { submitOwnWeek } from "@/lib/timesheet-entries";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };

/** Sends the person's week to their manager. */
export async function POST(_: Request, { params }: RouteContext<"/api/mobile/timesheet/[id]/submit">) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const { id } = await params;
  const result = await submitOwnWeek(access.user, id);
  return Response.json(result, { status: result.error ? 400 : 200, headers: noStore });
}
