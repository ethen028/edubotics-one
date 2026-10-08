import { NextResponse, type NextRequest } from "next/server";

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

export function proxy(request: NextRequest) {
  const host = publicHost();
  if (!host || !fromOutside(request, host)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  // Server actions are the app's internal forms (sign in included); none of them are public.
  if (request.headers.has("next-action")) return notFound();

  if (request.method === "GET" || request.method === "HEAD") {
    if (pathname === "/") return NextResponse.redirect(new URL("/careers", request.url));
    if (pathname === "/careers" || pathname.startsWith("/careers/") || pathname.startsWith("/_next/static/") || pathname === "/favicon.ico") {
      return NextResponse.next();
    }
    return notFound();
  }

  if (request.method === "POST" && /^\/careers\/[A-Za-z0-9_-]{1,40}\/apply$/.test(pathname)) {
    const length = Number(request.headers.get("content-length"));
    if (!length || length > MAX_APPLICATION_BYTES) {
      return NextResponse.json({ error: "Your resume can be up to 5 MB." }, { status: 413 });
    }
    return NextResponse.next();
  }

  return notFound();
}
