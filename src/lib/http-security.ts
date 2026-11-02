export function contentSecurityPolicy(nonce: string, development: boolean) {
  return [
    "default-src 'self'", `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'", "object-src 'none'",
    "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'", "frame-src https://challenges.cloudflare.com",
    `connect-src 'self' https://challenges.cloudflare.com${development ? " ws: wss:" : ""}`,
  ].join("; ");
}

/** Proxy forwarding headers are ignored unless the operator explicitly trusts the ingress. */
export function trustedClientAddress(h: Headers, trustProxy = process.env.TRUST_PROXY_HEADERS === "true") {
  if (!trustProxy) return "unknown";
  return (h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown").slice(0, 100);
}

export function allowedWriteOrigin(origin: string | null, requestOrigin: string, configuredOrigins: string[]) {
  if (!origin) return true; // CLI clients have no ambient browser cookies; Next also checks Server Action origins.
  try { return [requestOrigin, ...configuredOrigins].includes(new URL(origin).origin) && new URL(origin).origin === origin; }
  catch { return false; }
}

/** The origin visible to the browser. Next's internal request URL may use `localhost` even when Host is 127.0.0.1. */
export function visibleRequestOrigin(host: string | null, secure: boolean) {
  if (!host || /[\s/\\]/.test(host)) return null;
  try { return new URL(`${secure ? "https" : "http"}://${host}`).origin; }
  catch { return null; }
}

/**
 * A path inside this app to send someone back to after a form, or `fallback` when it isn't one.
 * Browsers read `/\evil.example` and `/%5Cevil.example`-style tricks as another site, so anything
 * with a backslash, a control character or a second leading slash is refused.
 */
export function safeAppPath(value: unknown, fallback = "/") {
  if (typeof value !== "string" || value.length > 2000) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, "http://orbit.invalid");
    return url.origin === "http://orbit.invalid" ? value : fallback;
  } catch {
    return fallback;
  }
}
