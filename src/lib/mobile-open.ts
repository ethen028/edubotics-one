import "server-only";
import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { rawDb as db } from "./db"; // the session row is looked up before a company is known
import { sessionSecret } from "./auth";
import { allowRequest } from "./rate-limit";

/**
 * How the phone app opens an Orbit page inside itself, already signed in.
 *
 * The app holds the session token in the phone's secure storage and never puts it in a web address. Instead
 * it asks /api/mobile/open-code for a code that names the same session, works once, and lasts a minute, then
 * loads /api/mobile/open?code=…&to=/page. That route turns the code into the normal session cookie. Because
 * the cookie names the phone's own session row, signing out on the phone, ending the session in Admin or the
 * idle limit signs the pages inside the app out too.
 */

export const OPEN_CODE_SECONDS = 60;
const USE = "app-open";

export async function issueOpenCode(userId: string, sessionId: string) {
  return new SignJWT({ sub: userId, sid: sessionId, use: USE })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${OPEN_CODE_SECONDS}s`)
    .sign(sessionSecret());
}

/** The session a code names, or null when it is wrong, old, already used, or its session has ended. */
export async function redeemOpenCode(code: unknown) {
  if (typeof code !== "string" || code.length > 1000) return null;
  let userId: string, sessionId: string, jti: string;
  try {
    const { payload } = await jwtVerify(code, sessionSecret(), { algorithms: ["HS256"] });
    if (payload.use !== USE || typeof payload.sub !== "string" || typeof payload.sid !== "string" || typeof payload.jti !== "string") return null;
    userId = payload.sub;
    sessionId = payload.sid;
    jti = payload.jti;
  } catch {
    return null;
  }
  // Once only: the first use takes the only slot (kept well past the code's own minute).
  if (!(await allowRequest(USE, jti, 1, OPEN_CODE_SECONDS * 5 * 1000))) return null;
  const session = await db.session.findUnique({ where: { id: sessionId }, include: { user: { select: { active: true, closedAt: true } } } });
  if (!session || session.endedAt || session.userId !== userId || !session.user.active || session.user.closedAt) return null;
  return { userId, sessionId };
}
