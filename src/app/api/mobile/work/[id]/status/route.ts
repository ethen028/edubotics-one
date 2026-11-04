import { z } from "zod";
import { getApiUser } from "@/lib/auth";
import { limitedJson } from "@/lib/request-body";
import { TASK_STATUSES, setTaskStatusFor } from "@/lib/my-work";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };

/** Moves one of the person's tasks to another status, with the same checks as the web My work page. */
export async function POST(request: Request, { params }: RouteContext<"/api/mobile/work/[id]/status">) {
  const access = await getApiUser();
  if (access.error) return access.error;
  const parsed = z.object({ status: z.enum(TASK_STATUSES) }).safeParse(await limitedJson(request));
  if (!parsed.success) return Response.json({ error: "Pick a status." }, { status: 400, headers: noStore });
  const { id } = await params;
  const result = await setTaskStatusFor(access.user, id, parsed.data.status);
  return Response.json({ ok: result.ok, error: result.error }, { status: result.error ? 400 : 200, headers: noStore });
}
