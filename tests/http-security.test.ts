import assert from "node:assert/strict";
import test from "node:test";
import { allowedWriteOrigin, contentSecurityPolicy, trustedClientAddress, visibleRequestOrigin } from "../src/lib/http-security";
import { limitedFormData } from "../src/lib/request-body";

test("spoofable proxy addresses are ignored unless ingress trust is configured", () => {
  const headers = new Headers({ "x-forwarded-for": "attacker, 127.0.0.1", "cf-connecting-ip": "fake" });
  assert.equal(trustedClientAddress(headers, false), "unknown");
  assert.equal(trustedClientAddress(new Headers({ "x-forwarded-for": "192.0.2.8, 127.0.0.1" }), true), "192.0.2.8");
});
test("browser writes accept only exact same or configured origins", () => {
  assert.equal(allowedWriteOrigin("https://evil.example", "https://one.example", []), false);
  assert.equal(allowedWriteOrigin("https://one.example.evil", "https://one.example", []), false);
  assert.equal(allowedWriteOrigin("https://one.example", "https://one.example", []), true);
  assert.equal(allowedWriteOrigin("https://jobs.example", "https://one.example", ["https://jobs.example"]), true);
  assert.equal(allowedWriteOrigin("null", "https://one.example", []), false);
});
test("browser-visible origin follows Host and the trusted transport", () => {
  assert.equal(visibleRequestOrigin("127.0.0.1:3001", false), "http://127.0.0.1:3001");
  assert.equal(visibleRequestOrigin("one.example", true), "https://one.example");
  assert.equal(visibleRequestOrigin("evil.example/path", true), null);
  assert.equal(visibleRequestOrigin(null, true), null);
});
test("production CSP restricts scripts with nonces and forbids eval", () => {
  const csp = contentSecurityPolicy("test-nonce", false);
  assert.ok(csp.includes("'nonce-test-nonce'"));
  assert.ok(csp.includes("object-src 'none'"));
  assert.equal(csp.includes("unsafe-eval"), false);
  assert.ok(contentSecurityPolicy("test", true).includes("unsafe-eval"));
});
test("multipart caps enforce actual bytes rather than the claimed length", async () => {
  const body = `--boundary\r\nContent-Disposition: form-data; name="message"\r\n\r\n${"x".repeat(1024)}\r\n--boundary--\r\n`;
  await assert.rejects(limitedFormData(new Request("http://localhost/form", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=boundary" }, body }), 100), /too large/);
  const small = new FormData(); small.set("message", "hello");
  const parsed = await limitedFormData(new Request("http://localhost/form", { method: "POST", body: small }), 2048);
  assert.equal(parsed.get("message"), "hello");
});
