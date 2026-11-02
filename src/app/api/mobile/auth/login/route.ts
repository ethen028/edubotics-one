import { SignJWT } from "jose";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSessionRecord, hashPassword, sessionSecret, verifyPassword } from "@/lib/auth";
import { allowRequest } from "@/lib/rate-limit";
import { trustedClientAddress } from "@/lib/http-security";
import { recordAttempt, emailLock, ipBlocked, minutesUntil } from "@/lib/sign-in";
import { logActivity } from "@/lib/activity";
import { passwordProblem } from "@/lib/passwords";

export const dynamic = "force-dynamic";
const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(200) });
let dummyHash: Promise<string> | null = null;
const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: Request) {
  let input: unknown;
  try { input = await request.json(); } catch { return Response.json({ error: "Send a valid JSON body." }, { status: 400, headers: noStore }); }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Enter a valid email and password." }, { status: 400, headers: noStore });
  const { email, password } = parsed.data;
  const ip = trustedClientAddress(request.headers);
  if (!(await allowRequest("mobile-login-ip", ip, 30, 900000)) || !(await allowRequest("mobile-login-email", email, 10, 900000))) {
    return Response.json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, { status: 429, headers: noStore });
  }
  if (await ipBlocked(ip)) return Response.json({ error: "Too many failed sign-ins from this network. Try again later." }, { status: 429, headers: noStore });
  const rules = (await db.companySettings.findUnique({ where: { id: 1 } })) ?? { loginMaxAttempts: 5, loginLockMinutes: 15 };
  const lock = await emailLock(email, rules);
  if (lock.lockedUntil) return Response.json({ error: `This account is locked. Try again in ${minutesUntil(lock.lockedUntil)} minutes or contact an administrator.` }, { status: 423, headers: noStore });

  const user = await db.user.findUnique({ where: { email } });
  dummyHash ??= hashPassword("not-a-real-mobile-password-1");
  const matches = await verifyPassword(password, user?.passwordHash ?? await dummyHash);
  if (!user || !user.active || user.closedAt || !matches) {
    await recordAttempt(email, ip, false);
    await logActivity(user, "SIGN_IN", "sign-in.failed", `Wrong password for ${email} (phone app)`);
    return Response.json({ error: "Email or password is incorrect." }, { status: 401, headers: noStore });
  }

  // Same rule as the web sign-in: old or weak passwords must be changed (in the browser) first.
  let mustChangePassword = user.mustChangePassword;
  if (!mustChangePassword && passwordProblem(password, user)) {
    await db.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash }, data: { mustChangePassword: true } });
    mustChangePassword = true;
  }

  const session = await createSessionRecord(user.id, "PASSWORD", user.passwordHash, {
    ip: ip === "unknown" ? null : ip,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? "Edubotics One Mobile",
  });
  if (!session) {
    await recordAttempt(email, ip, false);
    return Response.json({ error: "Sign-in could not be completed. Please try again." }, { status: 401, headers: noStore });
  }
  await recordAttempt(email, ip, true);
  await logActivity(user, "SIGN_IN", "sign-in", `${user.name} signed in on the phone app`);
  const token = await new SignJWT({ sub: user.id, sid: session.id })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(sessionSecret());
  return Response.json({ token, expiresIn: 604800, mustChangePassword, user: { id: user.id, name: user.name, email: user.email, role: user.role } }, { headers: noStore });
}
