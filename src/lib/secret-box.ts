import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Keeps the mail password unreadable in database backups. The key comes from the session secret,
// which Docker keeps in its own data volume (docker/start.sh), not in the database.

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET must be set");
  return createHash("sha256").update(`mail-password:${s}`).digest();
}

export function seal(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

/** The password, or null if it was sealed with another secret (then it has to be entered again). */
export function unseal(sealed: string | null) {
  if (!sealed) return null;
  const [v, iv, tag, data] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
