import assert from "node:assert/strict";
import test from "node:test";
import { newAccountToken, tokenHash, tokenIsUsable, trustedAppOrigin, captchaResultAccepted } from "../src/lib/account-security";
import { passwordProblem } from "../src/lib/passwords";

test("account links use random opaque tokens, storing only a digest", () => {
  const first = newAccountToken();
  const next = newAccountToken();
  assert.match(first.raw, /^[a-f0-9]{64}$/);
  assert.notEqual(first.raw, next.raw);
  assert.notEqual(first.hash, first.raw);
  assert.equal(first.hash, tokenHash(first.raw));
});
test("expired, consumed and wrong-purpose tokens are rejected", () => {
  const record = { kind: "RESET_PASSWORD", usedAt: null, expiresAt: new Date("2026-10-17T12:00:00Z") };
  const now = new Date("2026-10-17T11:59:59Z");
  assert.ok(tokenIsUsable(record, "RESET_PASSWORD", now));
  assert.equal(tokenIsUsable(record, "VERIFY_EMAIL", now), false);
  assert.equal(tokenIsUsable({ ...record, usedAt: now }, "RESET_PASSWORD", now), false);
  assert.equal(tokenIsUsable(record, "RESET_PASSWORD", record.expiresAt), false);
});
test("account email links cannot be redirected to untrusted schemes or paths", () => {
  assert.equal(trustedAppOrigin("https://one.example.com"), "https://one.example.com");
  assert.equal(trustedAppOrigin("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
  for (const url of ["javascript:alert(1)", "https://u:p@example.com", "http://example.com", "https://example.com/reset", "https://example.com?x=1"]) {
    assert.equal(trustedAppOrigin(url), null);
  }
});
test("CAPTCHA responses must match the expected hostname and action", () => {
  const result = { success: true, hostname: "jobs.example.com", action: "application" };
  assert.ok(captchaResultAccepted(result, "jobs.example.com", "application"));
  assert.equal(captchaResultAccepted(result, "other.example.com", "application"), false);
  assert.equal(captchaResultAccepted(result, "jobs.example.com", "account-recovery"), false);
  assert.equal(captchaResultAccepted({ ...result, success: false }, "jobs.example.com", "application"), false);
});
test("new passwords cannot silently truncate at bcrypt's 72-byte boundary", () => {
  assert.ok(passwordProblem("A9!" + "é".repeat(40)));
  assert.ok(passwordProblem("A9!" + "x".repeat(80)));
  assert.equal(passwordProblem("Copper!River47"), null);
});
