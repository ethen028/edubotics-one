/** Shared page/API gate for sessions with outstanding account security steps. */
export function sessionAccessProblem(current: {
  user: { mustChangePassword: boolean; emailVerifiedAt: Date | null };
  session: { method: string };
}, requireVerifiedEmail: boolean): "password" | "email" | null {
  if (current.user.mustChangePassword && current.session.method === "PASSWORD") return "password";
  if (requireVerifiedEmail && !current.user.emailVerifiedAt) return "email";
  return null;
}
