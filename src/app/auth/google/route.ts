import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT } from "jose";
import { db } from "@/lib/db";
import { cookieSecure, sessionSecret } from "@/lib/auth";
import { FLOW_COOKIE, FLOW_MAX_AGE, authorizationUrl, googleSetup, newFlow } from "@/lib/google-sign-in";

/** "Sign in with Google": remembers this round trip in a short-lived cookie and sends the browser to Google. */
export async function GET() {
  const settings = await db.companySettings.findUnique({ where: { id: 1 } });
  const setup = settings && googleSetup(settings);
  if (!setup) redirect("/login?google=off");
  const flow = newFlow();
  const token = await new SignJWT({ state: flow.state, nonce: flow.nonce, verifier: flow.verifier })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${FLOW_MAX_AGE}s`)
    .sign(sessionSecret());
  (await cookies()).set(FLOW_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax", // sent when Google sends the browser back
    secure: cookieSecure(),
    path: "/auth/google",
    maxAge: FLOW_MAX_AGE,
  });
  redirect(authorizationUrl(setup, flow).toString());
}
