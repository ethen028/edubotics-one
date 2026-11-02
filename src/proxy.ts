import { NextResponse, type NextRequest } from "next/server";
import { allowedWriteOrigin, contentSecurityPolicy, trustedClientAddress, visibleRequestOrigin } from "./lib/http-security";
import { trustedAppOrigin } from "./lib/account-security";
import { allowRequest } from "./lib/rate-limit";
import { recordRequest, reportServerError } from "./lib/telemetry";

/**
 * Keeps the careers page the only thing reachable from the internet, once it is put there.
 *
 * Inside the office the app answers everything as usual. When PUBLIC_CAREERS_HOST is set (for
 * example "jobs.eduboticsglobal.com") and a request arrives for that name (through a tunnel or a
 * hosted copy), it may only read the careers pages and their styles and scripts, and post an
 * application. Sign-in, the app's pages, file downloads and every other form are answered "not
 * found", so the internet can't try passwords or reach staff data. See docs/careers-page.md.
 */

const MAX_APPLICATION_BYTES = 6 * 1024 * 1024; // a 5 MB resume plus the form fields

function publicHost() {
  return process.env.PUBLIC_CAREERS_HOST?.trim().toLowerCase() || null;
}

/**
 * Whether a request came from outside. Only the Host header counts (X-Forwarded-Host can be typed
 * by anyone), and anything that passed through Cloudflare is treated as outside whatever its name.
 * Both checks can only narrow what a request reaches, never widen it.
 */
function fromOutside(request: NextRequest, host: string) {
  const asked = (request.headers.get("host") ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  return asked === host || request.headers.has("cf-connecting-ip") || request.headers.has("cf-ray");
}

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

function publicBoundary(request: NextRequest, requestHeaders: Headers) {
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  const host = publicHost();
  if (!host || !fromOutside(request, host)) return next();

  const { pathname } = request.nextUrl;
  // Server actions are the app's internal forms (sign in included); none of them are public.
  if (request.headers.has("next-action")) return notFound();

  if (request.method === "GET" || request.method === "HEAD") {
    if (pathname === "/") return NextResponse.redirect(new URL("/careers", request.url));
    if (pathname === "/careers" || pathname.startsWith("/careers/") || pathname.startsWith("/_next/static/") ||
      ["/privacy", "/terms", "/cookies", "/robots.txt", "/sitemap.xml", "/icon.svg", "/apple-icon.png", "/favicon.ico", "/opengraph-image"].includes(pathname)) {
      return next();
    }
    return notFound();
  }

  if (request.method === "POST" && /^\/careers\/[A-Za-z0-9_-]{1,40}\/apply$/.test(pathname)) {
    const length = Number(request.headers.get("content-length"));
    if (!length || length > MAX_APPLICATION_BYTES) {
      return NextResponse.json({ error: "Your resume can be up to 5 MB." }, { status: 413 });
    }
    return next();
  }

  return notFound();
}

export async function proxy(request: NextRequest) {
  const started = Date.now();
  const path = request.nextUrl.pathname;
  const origins = [trustedAppOrigin(process.env.APP_URL), trustedAppOrigin(process.env.PUBLIC_SITE_URL)].filter((v): v is string => !!v);
  const requestHeaders = new Headers(request.headers);
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  let response: NextResponse;
  const forwardedHTTPS = process.env.TRUST_PROXY_HEADERS === "true" && request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  const secure = request.nextUrl.protocol === "https:" || forwardedHTTPS;
  if (process.env.FORCE_HTTPS === "true" && !secure) {
    const canonical = origins.find((origin) => new URL(origin).host === request.headers.get("host"));
    response = canonical?.startsWith("https:")
      ? NextResponse.redirect(new URL(`${path}${request.nextUrl.search}`, canonical), 308)
      : new NextResponse("Secure access is not configured for this host", { status: 503 });
  } else if (!["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    !allowedWriteOrigin(request.headers.get("origin"), visibleRequestOrigin(request.headers.get("host"), secure) ?? request.nextUrl.origin, origins)) {
    response = new NextResponse("Cross-origin request rejected", { status: 403 });
  } else {
    try {
      // The Messages check-in has its own per-person limit (api/messages/poll): an office behind one public
      // address would otherwise use up this shared one just by having chats open.
      const limited = (path.startsWith("/api/") && path !== "/api/messages/poll") || !["GET", "HEAD", "OPTIONS"].includes(request.method);
      if (limited && !(await allowRequest("http", trustedClientAddress(request.headers), 120, 60000))) {
        response = new NextResponse("Too many requests", { status: 429, headers: { "Retry-After": "60" } });
      } else response = publicBoundary(request, requestHeaders);
    } catch (error) {
      reportServerError(error, { path });
      response = new NextResponse("Service temporarily unavailable", { status: 503 });
    }
  }
  if (!path.startsWith("/api/")) response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Referrer-Policy", "no-referrer");
  if (secure) response.headers.set("Strict-Transport-Security", "max-age=31536000");
  if (!path.startsWith("/careers") && !["/privacy", "/terms", "/cookies", "/robots.txt", "/sitemap.xml", "/icon.svg", "/opengraph-image"].includes(path)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  if (!path.startsWith("/_next/")) recordRequest(path, response.status, Date.now() - started);
  return response;
}
