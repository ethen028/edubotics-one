import { SignJWT } from "jose";
import { z } from "zod";
import { rawDb } from "@/lib/db"; // sign-in works across the whole group, before a company is known
import { firstCompanyId } from "@/lib/company";
import { createSessionRecord, hashPassword, sessionSecret, verifyPassword } from "@/lib/auth";
import { allowRequest } from "@/lib/rate-limit";
import { trustedClientAddress } from "@/lib/http-security";
import { recordAttempt, emailLock, ipBlocked, minutesUntil } from "@/lib/sign-in";
import { logActivity } from "@/lib/activity";
import { passwordProblem } from "@/lib/passwords";
import { redeemSignInCode } from "@/lib/sign-in-codes";

export const dynamic = "force-dynamic";
const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
  /** The code from the authenticator app, or a backup code, for people who switched sign-in codes on. */
  code: z.string().trim().max(40).optional(),
});
let dummyHash: Promise<string> | null = null;
const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: Request) {
  let input: unknown;
  try { input = await request.json(); } catch { return Response.json({ error: "Send a valid JSON body." }, { status: 400, headers: noStore }); }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Enter a valid email and password." }, { status: 400, headers: noStore });
  const { email, password, code } = parsed.data;
  const ip = trustedClientAddress(request.headers);
  if (!(await allowRequest("mobile-login-ip", ip, 30, 900000)) || !(await allowRequest("mobile-login-email", email, 10, 900000))) {
    return Response.json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, { status: 429, headers: noStore });
  }
  if (await ipBlocked(ip)) return Response.json({ error: "Too many failed sign-ins from this network. Try again later." }, { status: 429, headers: noStore });
  const user = await rawDb.user.findUnique({ where: { email } });
  const rules = (await rawDb.companySettings.findUnique({ where: { companyId: user?.companyId ?? (await firstCompanyId()) } })) ?? { loginMaxAttempts: 5, loginLockMinutes: 15 };
  const lock = await emailLock(email, rules);
  if (lock.lockedUntil) return Response.json({ error: `This account is locked. Try again in ${minutesUntil(lock.lockedUntil)} minutes or contact an administrator.` }, { status: 423, headers: noStore });

  dummyHash ??= hashPassword("not-a-real-mobile-password-1");
  const matches = await verifyPassword(password, user?.passwordHash ?? await dummyHash);
  if (!user || !user.active || user.closedAt || !matches) {
    await recordAttempt(email, ip, false);
    await logActivity(user, "SIGN_IN", "sign-in.failed", `Wrong password for ${email} (phone app)`);
    return Response.json({ error: "Email or password is incorrect." }, { status: 401, headers: noStore });
  }

  // Sign-in codes switched on: the password was right, so the app asks for the code and sends both again.
  let usedCode: "app" | "backup" | null = null;
  if (user.totpEnabledAt) {
    if (!code) return Response.json({ needsCode: true, error: "Type the 6-digit code from your authenticator app." }, { status: 401, headers: noStore });
    if (!(await allowRequest("sign-in-code", user.id, 5, 900000))) {
      return Response.json({ needsCode: true, error: "Too many wrong codes. Wait 15 minutes, then try again." }, { status: 429, headers: noStore });
    }
    usedCode = await redeemSignInCode(user, code);
    if (!usedCode) {
      await logActivity(user, "SIGN_IN", "sign-in.code-failed", `Wrong sign-in code for ${user.email} (phone app)`);
      return Response.json({ needsCode: true, error: "That code didn't work. Type the newest code from your app, or one of your backup codes." }, { status: 401, headers: noStore });
    }
  }

  // Same rule as the web sign-in: old or weak passwords must be changed (in the browser) first.
  let mustChangePassword = user.mustChangePassword;
  if (!mustChangePassword && passwordProblem(password, user)) {
    await rawDb.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash }, data: { mustChangePassword: true } });
    mustChangePassword = true;
  }

  const session = await createSessionRecord(user.id, "PASSWORD", user.passwordHash, {
    ip: ip === "unknown" ? null : ip,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? "Orbit phone app",
  });
  if (!session) {
    await recordAttempt(email, ip, false);
    return Response.json({ error: "Sign-in could not be completed. Please try again." }, { status: 401, headers: noStore });
  }
  await recordAttempt(email, ip, true);
  await logActivity(user, "SIGN_IN", "sign-in", usedCode === "backup"
    ? `${user.name} signed in on the phone app with a backup code (${user.totpBackupCodes.length - 1} left)`
    : usedCode ? `${user.name} signed in on the phone app with an app code` : `${user.name} signed in on the phone app`);
  const token = await new SignJWT({ sub: user.id, sid: session.id })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(sessionSecret());
  return Response.json({ token, expiresIn: 604800, mustChangePassword, user: { id: user.id, name: user.name, email: user.email, role: user.role } }, { headers: noStore });
}
