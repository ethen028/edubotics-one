import { createHash, randomBytes } from "node:crypto";

export type TokenKind = "RESET_PASSWORD" | "VERIFY_EMAIL";
export const tokenHash = (raw: string) => createHash("sha256").update(raw).digest("hex");
export function newAccountToken() {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: tokenHash(raw) };
}
export function tokenIsUsable(record: { kind: string; usedAt: Date | null; expiresAt: Date } | null, kind: TokenKind, now = new Date()) {
  return !!record && record.kind === kind && !record.usedAt && record.expiresAt > now;
}
export function trustedAppOrigin(value: string | null | undefined) {
  try {
    const url = new URL(value ?? "");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return url.origin;
  } catch { /* A missing or invalid deployment address disables email links. */ }
  return null;
}
export function captchaResultAccepted(result: { success?: unknown; hostname?: unknown; action?: unknown }, hostname: string, action: string) {
  return result.success === true && result.hostname === hostname && result.action === action;
}
