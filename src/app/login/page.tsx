import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { GOOGLE_ERRORS, googleSetup } from "@/lib/google-sign-in";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { login } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { google } = (await searchParams) as Record<string, string | undefined>;
  const settings = await db.companySettings.findUnique({ where: { id: 1 } });
  const withGoogle = !!settings && !!googleSetup(settings);
  const googleError = google && google in GOOGLE_ERRORS ? GOOGLE_ERRORS[google as keyof typeof GOOGLE_ERRORS] : null;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            E1
          </div>
          <h1 className="text-xl font-semibold">Edubotics One</h1>
          <p className="text-sm text-slate-500">Sign in with your work account</p>
        </div>
        {googleError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{googleError}</div>
        )}
        {withGoogle && (
          <>
            <a href="/auth/google" className="btn-secondary flex w-full items-center justify-center gap-2 py-2.5">
              <GoogleMark />
              Sign in with Google
            </a>
            <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              or with your password
              <span className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        )}
        <ActionForm action={login} className="card space-y-4">
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" required autoComplete="email" className="input" />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input name="password" type="password" required autoComplete="current-password" className="input" />
          </label>
          <SubmitButton className="btn-primary w-full" pendingLabel="Signing in…">
            Sign in
          </SubmitButton>
        </ActionForm>
        <p className="mt-4 text-center text-xs text-slate-500">Forgot your password? Ask an admin to set a new one.</p>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
