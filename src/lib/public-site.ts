/** Only a configured HTTPS public origin is published to crawlers. */
export function publicOrigin(value = process.env.PUBLIC_SITE_URL): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname === "127.0.0.1" || url.hostname === "[::1]") return null;
    return url.origin;
  } catch { return null; }
}

export const publicPaths = ["/careers", "/privacy", "/terms", "/cookies"] as const;
