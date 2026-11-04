import { getCurrentSession } from "@/lib/auth";
import { issueOpenCode, OPEN_CODE_SECONDS } from "@/lib/mobile-open";
import { allowRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };

/** The phone app asks for this before it opens an Orbit page inside itself (see src/lib/mobile-open.ts). */
export async function POST() {
  const current = await getCurrentSession();
  if (!current) return Response.json({ error: "Sign in again." }, { status: 401, headers: noStore });
  if (!(await allowRequest("app-open-code", current.session.id, 60, 60000))) {
    return Response.json({ error: "Too many pages opened at once. Wait a minute and try again." }, { status: 429, headers: noStore });
  }
  const code = await issueOpenCode(current.user.id, current.session.id);
  return Response.json({ code, expiresIn: OPEN_CODE_SECONDS }, { headers: noStore });
}
