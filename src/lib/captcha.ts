import "server-only";
import { captchaResultAccepted, trustedAppOrigin } from "./account-security";

export function captchaConfig() {
  const siteKey = process.env.TURNSTILE_SITE_KEY || null;
  const required = process.env.REQUIRE_CAPTCHA === "true" || !!(process.env.NODE_ENV === "production" && process.env.PUBLIC_CAREERS_HOST);
  return { siteKey, required, ready: !!siteKey && !!process.env.TURNSTILE_SECRET_KEY };
}

export async function verifyCaptcha(value: FormDataEntryValue | null, action: string) {
  const config = captchaConfig();
  if (!config.required && !config.siteKey) return true;
  if (!config.ready || typeof value !== "string" || !value || value.length > 2048) return false;
  const origin = trustedAppOrigin(process.env.APP_URL) ?? trustedAppOrigin(process.env.PUBLIC_SITE_URL);
  const hostname = action === "application" && process.env.PUBLIC_CAREERS_HOST
    ? process.env.PUBLIC_CAREERS_HOST.trim().toLowerCase().split(":")[0]
    : origin ? new URL(origin).hostname : null;
  if (!hostname) return false;
  try {
    const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: value }),
      signal: AbortSignal.timeout(10000),
    });
    if (!result.ok) return false;
    return captchaResultAccepted(await result.json(), hostname, action);
  } catch { return false; }
}
