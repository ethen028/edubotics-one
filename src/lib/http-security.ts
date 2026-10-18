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
