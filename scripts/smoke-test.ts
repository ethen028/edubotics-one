import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { request as httpRequest } from "node:http";

// Opt-in integration check. Never create test sessions against an office database.
const database = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.endsWith("_test"), "Use a local database whose name ends in _test");
const base = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3001");
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Smoke tests only target localhost");
assert.ok(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32, "Set SESSION_SECRET");
const db = new PrismaClient();
const sessions: string[] = [];

// Node fetch intentionally ignores Host overrides; use HTTP for virtual-host boundary tests.
function virtualHost(path: string, host: string, server = base, secureProxy = false) {
  assert.ok(["localhost", "127.0.0.1"].includes(server.hostname));
  return new Promise<{ status: number; headers: import("node:http").IncomingHttpHeaders }>((resolve, reject) => {
    const request = httpRequest({ hostname: server.hostname, port: server.port, path, headers: { host, ...(secureProxy ? { "x-forwarded-proto": "https" } : {}) } }, (response) => {
      response.resume();
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers }));
    });
    request.setTimeout(10000, () => request.destroy(new Error("Virtual host request timed out")));
    request.on("error", reject); request.end();
  });
}

async function cookieFor(userId: string) {
  const session = await db.session.create({ data: { userId, method: "PASSWORD" } });
  sessions.push(session.id);
  const token = await new SignJWT({ sub: userId, sid: session.id })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  return `eb_session=${token}`;
}

async function main() {
try {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.env.SMOKE_ADMIN_EMAIL ?? "rebuild@example.invalid" } });
  assert.equal(user.role, "ADMIN");
  assert.equal(user.mustChangePassword, false, "Complete the test admin's initial password setup first");
  const cookie = await cookieFor(user.id);
  const files = await readdir("src/app/(app)", { recursive: true });
  const routes = files.filter((path) => /(^|[\\/])page\.tsx$/.test(path) && !path.includes("["))
    .map((path) => `/${path.replace(/\\/g, "/").replace(/(^|\/)page\.tsx$/, "")}`.replace(/\/$/, "") || "/");
  const failures: string[] = [];
  let passed = 0;
  for (let offset = 0; offset < routes.length; offset += 4) {
    await Promise.all(routes.slice(offset, offset + 4).map(async (route) => {
      try {
        const response = await fetch(new URL(route, base), { headers: { cookie }, signal: AbortSignal.timeout(60000) });
        const body = await response.text();
        assert.ok(response.ok, `HTTP ${response.status}`);
        assert.ok(!new URL(response.url).pathname.startsWith("/login"), "Unexpected sign-out");
        assert.ok(!/:E\{\s*"digest"/.test(body), "Server rendering error in streamed response");
        passed++;
      } catch (error) { failures.push(`${route}: ${error instanceof Error ? error.message : error}`); }
    }));
  }
  const signedOut = await fetch(new URL("/projects", base), { redirect: "manual" });
  assert.equal(signedOut.status, 307);
  assert.ok(signedOut.headers.get("location")?.includes("/login"));
  const health = await fetch(new URL("/api/health", base));
  assert.equal(health.status, 200, "Readiness endpoint must include the database");
  assert.deepEqual(await health.json(), { status: "ok" });
  assert.match(health.headers.get("cache-control") ?? "", /no-store/);

  const staff = await db.user.upsert({
    where: { email: "smoke-employee@example.invalid" }, update: {},
    create: { email: "smoke-employee@example.invalid", name: "Smoke Employee", role: "EMPLOYEE", passwordHash: user.passwordHash },
  });
  assert.equal(staff.role, "EMPLOYEE");
  const staffCookie = await cookieFor(staff.id);
  for (const route of ["/admin/users", "/admin/settings", "/payroll", "/accounts", "/invoices"]) {
    const response = await fetch(new URL(route, base), { headers: { cookie: staffCookie }, redirect: "manual" });
    const body = await response.text();
    // A redirect after the loading boundary starts streaming is carried in the response body.
    const denied = response.status === 307
      ? response.headers.get("location")?.includes("/no-access")
      : response.status === 200 && body.includes("NEXT_REDIRECT") && body.includes("/no-access");
    assert.ok(denied, `Employee must be denied ${route}`);
  }
  const fileRoutes = ["/api/documents/missing", "/api/project-files/missing", "/api/checklists/photos/missing", "/api/expenses/missing/receipt", "/api/helpdesk/files/missing", "/api/notices/missing/file", "/api/purchases/bills/missing/file", "/api/recruitment/files/missing"];
  await db.user.update({ where: { id: staff.id }, data: { mustChangePassword: true } });
  try {
    for (const route of fileRoutes) {
      assert.equal((await fetch(new URL(route, base))).status, 401, `Guest file protection ${route}`);
      assert.equal((await fetch(new URL(route, base), { headers: { cookie: staffCookie } })).status, 403, `Temporary password file protection ${route}`);
    }
  } finally { await db.user.update({ where: { id: staff.id }, data: { mustChangePassword: staff.mustChangePassword } }); }
  const login = await fetch(new URL("/login", base));
  const csp = login.headers.get("content-security-policy") ?? "";
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  const loginHtml = await login.text();
  assert.ok(nonce && loginHtml.includes(`nonce="${nonce}"`), "CSP nonce reaches rendered scripts");
  assert.ok(!csp.includes("unsafe-eval"), "Production CSP forbids eval");
  const foreign = await fetch(new URL("/login", base), { method: "POST", headers: { origin: "https://evil.example" } });
  assert.equal(foreign.status, 403, "Foreign-origin writes rejected");
  for (const route of ["/privacy", "/terms", "/cookies", "/forgot-password", "/reset-password", "/verify-email", "/icon.svg", "/opengraph-image", "/robots.txt", "/sitemap.xml"]) {
    assert.equal((await fetch(new URL(route, base))).status, 200, `Public surface ${route}`);
  }
  const careersHost = process.env.SMOKE_CAREERS_HOST;
  if (careersHost) {
    for (const route of ["/login", "/projects", "/api/documents/missing", "/forgot-password"]) {
      assert.equal((await virtualHost(route, careersHost)).status, 404, `Public hostname must hide ${route}`);
    }
    assert.equal((await virtualHost("/privacy", careersHost)).status, 200);
  }
  if (process.env.SMOKE_HTTPS_URL) {
    const server = new URL(process.env.SMOKE_HTTPS_URL);
    const host = process.env.SMOKE_HTTPS_HOST ?? "one.example.test";
    const redirected = await virtualHost("/login", host, server);
    assert.equal(redirected.status, 308);
    assert.equal(redirected.headers.location, `https://${host}/login`);
    const secured = await virtualHost("/login", host, server, true);
    assert.equal(secured.status, 200);
    assert.equal(secured.headers["strict-transport-security"], "max-age=31536000");
    console.log("HTTPS redirect and trusted-ingress HSTS checks passed.");
  }
  console.log(`${passed}/${routes.length} static authenticated pages rendered. Signed-out protection and 5 employee role restrictions passed.`);
  console.log("HTTP security passed: 8 API account gates, nonce CSP, cross-origin rejection, public pages and metadata" + (careersHost ? ", public-host boundary." : "."));
  assert.deepEqual(failures, [], failures.join("\n"));
} finally {
  await db.session.deleteMany({ where: { id: { in: sessions } } });
  await db.$disconnect();
}
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
