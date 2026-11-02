import assert from "node:assert/strict";
import test from "node:test";
import { base32Decode, base32Encode, hashBackupCode, looksLikeBackupCode, matchTotp, newBackupCodes, newTotpSecret, otpauthUri, totpCode, totpStep } from "../src/lib/totp";

// RFC 6238 appendix B, SHA-1, last six digits.
const RFC_KEY = Buffer.from("12345678901234567890");
test("codes match the RFC 6238 test values", () => {
  for (const [seconds, code] of [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"]] as const) {
    assert.equal(totpCode(RFC_KEY, totpStep(seconds * 1000)), code, String(seconds));
  }
  assert.equal(totpCode(RFC_KEY, totpStep(59_000), 8), "94287082");
});

test("keys survive writing out and reading back", () => {
  assert.equal(base32Encode(RFC_KEY), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.deepEqual(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq"), RFC_KEY);
  const secret = newTotpSecret();
  assert.equal(secret.length, 32);
  assert.equal(base32Encode(base32Decode(secret)), secret);
  assert.throws(() => base32Decode("not base32!"));
});

test("a code works for one step either side, once", () => {
  const secret = base32Encode(RFC_KEY);
  const now = 1_700_000_000_000;
  const step = totpStep(now);
  assert.equal(matchTotp(secret, totpCode(secret, step), now, null), step);
  assert.equal(matchTotp(secret, totpCode(secret, step - 1), now, null), step - 1);
  assert.equal(matchTotp(secret, totpCode(secret, step + 1), now, null), step + 1);
  assert.equal(matchTotp(secret, totpCode(secret, step - 2), now, null), null);
  // Already used: the same step, or an older one, is refused.
  assert.equal(matchTotp(secret, totpCode(secret, step), now, step), null);
  assert.equal(matchTotp(secret, totpCode(secret, step - 1), now, step), null);
  assert.equal(matchTotp(secret, totpCode(secret, step + 1), now, step), step + 1);
  assert.equal(matchTotp(secret, "12345", now, null), null);
  assert.equal(matchTotp(secret, "abcdef", now, null), null);
  const spaced = totpCode(secret, step);
  assert.equal(matchTotp(secret, `${spaced.slice(0, 3)} ${spaced.slice(3)}`, now, null), step);
});

test("backup codes are readable, unique and stored only as hashes", () => {
  const codes = newBackupCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) {
    assert.match(c, /^[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}$/);
    assert.ok(looksLikeBackupCode(c));
  }
  assert.equal(hashBackupCode("K7MQ-X2PD"), hashBackupCode("k7mq x2pd"));
  assert.notEqual(hashBackupCode("k7mq-x2pd"), hashBackupCode("k7mq-x2pe"));
  assert.ok(!looksLikeBackupCode("123456"));
});

test("the setup link names Orbit and the login", () => {
  assert.equal(
    otpauthUri("ABCD", "asha@example.com"),
    "otpauth://totp/Orbit%3Aasha%40example.com?secret=ABCD&issuer=Orbit&algorithm=SHA1&digits=6&period=30",
  );
});
