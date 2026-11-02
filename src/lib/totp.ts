import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

/**
 * Six-digit sign-in codes from an authenticator app (RFC 6238: SHA-1, 30-second steps), and the
 * one-time backup codes kept for a lost phone. No database access here, so it can be tested on its own.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

export function base32Encode(bytes: Uint8Array) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string) {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Not a base32 key");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit key, written the way authenticator apps expect it. */
export function newTotpSecret() {
  return base32Encode(randomBytes(20));
}

export const totpStep = (now: number) => Math.floor(now / 1000 / STEP_SECONDS);

/** The code for one 30-second step. */
export function totpCode(secret: string | Uint8Array, step: number, digits = 6) {
  const key = typeof secret === "string" ? base32Decode(secret) : Buffer.from(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 15;
  const number = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(number).padStart(digits, "0");
}

/**
 * The step a typed code belongs to, or null. Allows one step either side for a phone clock that is a
 * little off, and refuses a step at or before `lastStep`, so a code that was seen can't be used again.
 */
export function matchTotp(secret: string, typed: string, now: number, lastStep: number | null) {
  const code = typed.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpStep(now);
  for (const step of [current - 1, current, current + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (totpCode(secret, step) === code) return step;
  }
  return null;
}

/** The link a phone opens in its authenticator app. */
export function otpauthUri(secret: string, account: string, issuer = "Orbit") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** The key in groups of four, easier to type into an app by hand. */
export const groupedSecret = (secret: string) => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

// No 0/O, 1/l/I: backup codes are read off paper.
const BACKUP_LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";

/** Ten one-time codes such as "k7mq-x2pd", shown once and stored only as hashes. */
export function newBackupCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const pick = () => Array.from({ length: 4 }, () => BACKUP_LETTERS[randomInt(BACKUP_LETTERS.length)]).join("");
    return `${pick()}-${pick()}`;
  });
}

export function hashBackupCode(code: string) {
  const clean = code.toLowerCase().replace(/[\s-]/g, "");
  return createHash("sha256").update(`orbit-backup-code:${clean}`).digest("hex");
}

/** Whether something typed looks like a backup code rather than an app code. */
export const looksLikeBackupCode = (typed: string) => /^[a-z0-9]{8}$/i.test(typed.replace(/[\s-]/g, "")) && !/^\d+$/.test(typed.trim());
