// Password rules, used wherever a password is set and at sign-in (a password that no longer meets them has to be changed).

export const PASSWORD_RULES = "At least 8 characters with a letter and a number. Not a common password, the company name, or your own name or email.";

// Passwords guessed first. Matched after lower-casing and dropping digits and symbols at the end.
const COMMON = new Set([
  "password", "passw0rd", "qwerty", "qwertyuiop", "asdfgh", "asdfghjkl", "zxcvbnm", "abc", "abcd", "abcdef", "abcdefgh",
  "letmein", "welcome", "admin", "administrator", "login", "iloveyou", "monkey", "dragon", "sunshine", "princess",
  "football", "cricket", "india", "kerala", "kochi", "cochin", "ernakulam", "test", "testing", "changeme", "secret",
  "master", "hello", "user", "default", "trustno", "superman", "batman", "pass", "office", "school", "teacher", "robot",
  "robotics", "student", "company", "global",
]);
const COMMON_DIGITS = /^(?:0123|1234|2345|3456|4567|5678|6789|1111|0000|1212|1122|1313|2020|2021|2022|2023|2024|2025|2026|2027)/;

/** Why this password can't be used, or null if it's fine. */
export function passwordProblem(password: string, who: { email?: string | null; name?: string | null } = {}): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 200) return "Use at most 200 characters.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Use at least one letter and one number.";
  const lower = password.toLowerCase();
  const stem = lower.replace(/[^a-z]+$/, "").replace(/^[^a-z]+/, "");
  if (COMMON.has(stem) || (stem.length < 4 && COMMON_DIGITS.test(lower.replace(/[a-z]/g, "")))) {
    return "That password is too easy to guess. Pick something less common.";
  }
  if (/edu ?botics|edubotic/.test(lower)) return "Don't use the company name in a password.";
  const own = [who.email?.split("@")[0], ...(who.name ?? "").split(/\s+/)]
    .map((p) => p?.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((p): p is string => !!p && p.length >= 3);
  if (own.some((p) => lower.includes(p))) return "Don't use your own name or email in a password.";
  return null;
}
