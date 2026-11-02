import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { readCodeChallenge } from "@/lib/sign-in-codes";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { LogoMark } from "@/components/logo";
import { verifyLoginCode } from "../../actions";

export const metadata = { title: "Sign-in code" };

export default async function SignInCodePage() {
  if (await getCurrentUser()) redirect("/");
  if (!(await readCodeChallenge())) redirect("/login");
  return (
    <main id="main-content" tabIndex={-1} className="auth-bg flex min-h-screen items-center justify-center p-4 md:p-6">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="brand-mark h-10 w-10" role="img" aria-label="Edubotics">
            <LogoMark />
          </div>
          <span className="font-semibold">Orbit</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Enter your code</h1>
        <p className="mt-1 mb-5 text-sm text-slate-500">Open your authenticator app and type the 6-digit code for Orbit.</p>
        <ActionForm action={verifyLoginCode} className="space-y-4">
          <label className="block">
            <span className="label">Code</span>
            <input
              name="code"
              required
              autoFocus
              autoComplete="one-time-code"
              inputMode="text"
              maxLength={12}
              placeholder="123456"
              className="input text-lg tracking-widest"
            />
          </label>
          <SubmitButton className="btn-primary w-full py-2.5" pendingLabel="Checking…">
            Sign in
          </SubmitButton>
        </ActionForm>
        <p className="mt-4 text-xs text-slate-500">
          Lost your phone? Type one of your backup codes instead, or ask an admin to turn codes off for your login.
        </p>
        <p className="mt-4 text-center text-xs">
          <Link href="/login" className="link">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
