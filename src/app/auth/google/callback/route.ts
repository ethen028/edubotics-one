import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import { createSession, sessionSecret } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import {
  FLOW_COOKIE,
  GoogleSignInError,
  exchangeCode,
  googleSetup,
  verifyIdToken,
  type GoogleErrorCode,
} from "@/lib/google-sign-in";

/** Google sends the browser back here with a code; the person is signed in if their Google email has a login. */
export async function GET(request: NextRequest) {
  const jar = await cookies();
  const flowToken = jar.get(FLOW_COOKIE)?.value;
  jar.delete({ name: FLOW_COOKIE, path: "/auth/google" });
  const params = request.nextUrl.searchParams;

  let outcome: { userId: string } | GoogleErrorCode;
  try {
    outcome = await signIn(flowToken, params);
  } catch (e) {
    outcome = e instanceof GoogleSignInError ? e.code : "failed";
    if (!(e instanceof GoogleSignInError)) console.error("Google sign-in failed", e);
  }
  if (typeof outcome === "string") redirect(`/login?google=${outcome}`);
  await createSession(outcome.userId, "GOOGLE");
  redirect("/");
}

async function signIn(flowToken: string | undefined, params: URLSearchParams): Promise<{ userId: string } | GoogleErrorCode> {
  const settings = await db.companySettings.findUnique({ where: { id: 1 } });
  const setup = settings && googleSetup(settings);
  if (!setup) return "off";
  if (params.get("error")) return params.get("error") === "access_denied" ? "cancelled" : "failed";

  let flow: { state?: unknown; nonce?: unknown; verifier?: unknown };
  try {
    if (!flowToken) return "expired";
    ({ payload: flow } = await jwtVerify(flowToken, sessionSecret()));
  } catch {
    return "expired";
  }
  const code = params.get("code");
  if (!code || typeof flow.state !== "string" || flow.state !== params.get("state")) return "expired";
  if (typeof flow.nonce !== "string" || typeof flow.verifier !== "string") return "expired";

  const idToken = await exchangeCode(setup, code, flow.verifier);
  const google = await verifyIdToken(idToken, setup, flow.nonce);

  const user = (await db.user.findUnique({ where: { googleSub: google.sub } })) ?? (await db.user.findUnique({ where: { email: google.email } }));
  if (!user) {
    await logActivity(null, "SIGN_IN", "sign-in.google-unknown", `Google account ${google.email} tried to sign in but has no login`);
    return "no-login";
  }
  if (user.googleSub && user.googleSub !== google.sub) return "other-google";
  if (!user.active) {
    await logActivity(user, "SIGN_IN", "sign-in.failed", `${user.email} tried to sign in with Google but the login is switched off`);
    return "disabled";
  }
  if (!user.googleSub) await db.user.update({ where: { id: user.id }, data: { googleSub: google.sub } });
  await logActivity(user, "SIGN_IN", "sign-in.google", `${user.name} signed in with Google (${google.email})`);
  return { userId: user.id };
}
