import assert from "node:assert/strict";
import test from "node:test";
import { sessionAccessProblem } from "../src/lib/session-access";

test("API and page account gates reject temporary passwords and unverified accounts", () => {
  const current = { user: { mustChangePassword: true, emailVerifiedAt: null }, session: { method: "PASSWORD" } };
  assert.equal(sessionAccessProblem(current, true), "password");
  assert.equal(sessionAccessProblem(current, false), "password");
  current.user.mustChangePassword = false;
  assert.equal(sessionAccessProblem(current, true), "email");
  assert.equal(sessionAccessProblem(current, false), null);
});

test("Google sign-in bypasses temporary password only, never required email verification", () => {
  assert.equal(sessionAccessProblem({ user: { mustChangePassword: true, emailVerifiedAt: null }, session: { method: "GOOGLE" } }, true), "email");
  assert.equal(sessionAccessProblem({ user: { mustChangePassword: true, emailVerifiedAt: new Date() }, session: { method: "GOOGLE" } }, true), null);
});
