import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { PASSWORD_RULES } from "@/lib/passwords";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { changePassword, logout } from "../actions";

export const metadata = { title: "Choose a new password" };

/** Shown after signing in with a temporary password, or one that no longer meets the rules. */
export default async function ChangePasswordPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.user.mustChangePassword || current.session.method !== "PASSWORD") redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">Choose a new password</h1>
          <p className="mt-1 text-sm text-slate-500">
            Hi {current.user.name.split(" ")[0]}. Your password was set by someone else or is too easy to guess, so pick your own
            before carrying on.
          </p>
        </div>
        <ActionForm action={changePassword} className="card space-y-4">
          <input type="hidden" name="then" value="home" />
          <label className="block">
            <span className="label">Current password</span>
            <input name="current" type="password" required autoComplete="current-password" className="input" />
          </label>
          <label className="block">
            <span className="label">New password</span>
            <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </label>
          <label className="block">
            <span className="label">New password again</span>
            <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </label>
          <p className="text-xs text-slate-500">{PASSWORD_RULES}</p>
          <SubmitButton className="btn-primary w-full">Save and continue</SubmitButton>
        </ActionForm>
        <form action={logout} className="mt-4 text-center">
          <button className="text-xs text-slate-500 hover:text-slate-800">Sign out instead</button>
        </form>
      </div>
    </main>
  );
}
