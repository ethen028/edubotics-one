import { redirect } from "next/navigation";
import { setSessionCookie } from "@/lib/auth";
import { redeemOpenCode } from "@/lib/mobile-open";
import { safeAppPath } from "@/lib/http-security";

export const dynamic = "force-dynamic";

/** Opens an Orbit page inside the phone app, signed in as the phone's session (see src/lib/mobile-open.ts). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const opened = await redeemOpenCode(url.searchParams.get("code"));
  if (!opened) redirect("/login");
  await setSessionCookie(opened.userId, opened.sessionId);
  redirect(safeAppPath(url.searchParams.get("to"), "/"));
}
